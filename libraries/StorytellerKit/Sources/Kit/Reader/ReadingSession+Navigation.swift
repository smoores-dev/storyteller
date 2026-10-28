import Foundation

extension ReadingSession {
    public func turnPageLeft() {
        if ebookFileFormat == .cbz {
            moveNativePage(by: -1)
        } else {
            requestReaderNavigation(ReaderTarget(kind: "left"), reason: .userFlippedPage)
        }
    }
    public func turnPageRight() {
        if ebookFileFormat == .cbz {
            moveNativePage(by: 1)
        } else {
            requestReaderNavigation(ReaderTarget(kind: "right"), reason: .userFlippedPage)
        }
    }
    public func selectTextSection(_ index: Int, href: String? = nil) {
        if ebookFileFormat == .cbz {
            selectNativePage(index)
            return
        }
        let target =
            href.map { ReaderTarget(kind: "href", value: $0) }
            ?? ReaderTarget(kind: "section", sectionIndex: index, fraction: 0)
        requestReaderNavigation(target, reason: .userSelectedChapter)
    }
    public func seekReaderProgress(_ fraction: Double) {
        guard fraction.isFinite else { return }
        if ebookFileFormat == .cbz {
            seekNativePage(fraction: fraction)
            return
        }
        requestReaderNavigation(
            ReaderTarget(kind: "fraction", fraction: min(max(0, fraction), 1)),
            reason: .userDraggedSeekBar,
        )
    }

    public var currentReaderLocator: BookLocator? {
        navigation.browseLocation ?? playback.accepted ?? readerLocation?.locator
    }

    func initializeTextProgress() async throws {
        guard playback.accepted == nil else { return }
        let stored = try await progressAccess.read(bookID)
        playback.accepted = stored?.locator ?? metadata.position?.locator
        playback.acceptedAudio = false
        playback.acceptedAt = stored?.timestamp
        playback.savedAt = stored?.timestamp
    }

    /// Reconciles playback, reader position, and saved progress.
    @discardableResult
    public func ensureSynced(reason: String = "explicit") async -> ReadingSyncResult {
        // Requests received during a pass require another pass.
        navigation.syncRequestID = UUID()
        if let task = navigation.syncTask { return await task.value }
        let task = Task { @StorytellerUIActor [weak self] in
            guard let self else { return ReadingSyncResult.failed("Session ended") }
            while true {
                let requestID = navigation.syncRequestID
                let result = await reconcile(reason: reason)
                // Detachment cancels this task and may start a replacement.
                guard !Task.isCancelled else { return result }
                if navigation.syncRequestID != requestID { continue }

                // Clear atomically with the request check so new requests start a fresh task.
                navigation.syncTask = nil
                lastSyncResult = result
                if case .deferred = result, navigation.foreground, commsBridge != nil,
                    navigation.retryCount < 3, navigation.retry == nil
                {
                    navigation.retryCount += 1
                    navigation.retry = Task { @StorytellerUIActor [weak self] in
                        try? await Task.sleep(for: .milliseconds(250))
                        guard !Task.isCancelled, let self else { return }
                        self.navigation.retry = nil
                        _ = await self.ensureSynced(reason: "bounded retry")
                    }
                } else if result == .synced {
                    navigation.retryCount = 0
                }
                debugLog("[ReadingSession] ensureSynced \(reason): \(result)")
                return result
            }
        }
        navigation.syncTask = task
        return await task.value
    }

    func scheduleReconciliation(reason: String) {
        guard !isEnded else { return }
        Task { @StorytellerUIActor [weak self] in _ = await self?.ensureSynced(reason: reason) }
    }

    private func reconcile(reason: String) async -> ReadingSyncResult {
        guard !isEnded else { return .failed("Session ended") }
        await awaitPreparation()
        guard !isEnded, !Task.isCancelled else { return .deferred("Session changed") }
        if let error = lastPrepareError { return .failed(error.localizedDescription) }
        do {
            if category == .ebook { try await initializeTextProgress() }
            await engine.reconcilePositionFromPlayer()
            let audio = await engine.getCurrentState()
            if let audio, audio.bookID == bookID {
                playback.observed = audio
                onPlaybackActivityChanged?(audio.isPlaying)
                if settings.freeBrowseMode == "paused", audio.isPlaying {
                    navigation.browseLocation = nil
                }
            }
            if reason == "foreground" || reason == "reader ready" || reason == "explicit" {
                if let stored = try await progressAccess.read(bookID), let locator = stored.locator,
                    let timestamp = stored.timestamp, timestamp > (playback.acceptedAt ?? 0)
                {
                    await applyIncomingPosition(
                        IncomingServerPosition(locator: locator, timestamp: timestamp)
                    )
                }
            }
            if ebookFileFormat == .cbz {
                guard let locator = playback.accepted ?? navigation.nativeLocation?.locator,
                    let index = nativePageIndex(for: locator)
                else { return .deferred("Native reader not ready") }
                displayNativePage(index, user: false)
                return await settledResult()
            }
            guard navigation.foreground, let bridge = commsBridge else {
                return category == .audio
                    ? await settledResult() : .deferred("Reader unavailable; audio may continue")
            }
            let anchor = await currentPlayhead()
            var snapshot = try await bridge.readingSnapshot(playhead: anchor)
            guard commsBridge === bridge, !isEnded, !Task.isCancelled else {
                return .deferred("Reader replaced")
            }
            guard snapshot.ready else { return .deferred("Document not ready") }
            guard snapshotIsCurrent(snapshot) else {
                return .deferred("Newer reader facts available")
            }
            navigation.snapshot = snapshot

            // Handle gestures before command receipts or audio following.
            if let gesture = snapshot.gesture, gesture.active {
                navigation.followTimer?.cancel()
                if case .projection = navigation.pending?.purpose { navigation.pending = nil }
                return .deferred("User gesture owns the viewport")
            }
            if let gesture = snapshot.gesture, gesture.moved,
                navigation.lastGesture?.documentID != snapshot.documentID
                    || navigation.lastGesture?.id != gesture.id
            {
                navigation.revision &+= 1
                navigation.pending = nil
                navigation.confirmed = nil
                let accepted = await acceptUserDestination(
                    gesture.location,
                    snapshot: snapshot,
                    reason: .userFlippedPage,
                )
                guard accepted else {
                    return .deferred("Gesture destination needs valid geometry/audio")
                }
                navigation.lastGesture = (snapshot.documentID, gesture.id)
                try await bridge.acknowledgeReading(
                    documentID: snapshot.documentID,
                    gestureID: gesture.id,
                )
                onUserNavigation?()
            } else if let gesture = snapshot.gesture, !gesture.active {
                try await bridge.acknowledgeReading(
                    documentID: snapshot.documentID,
                    gestureID: gesture.id,
                )
            }

            if navigation.pending == nil, let offered = playback.offered {
                await applyIncomingPosition(offered)
            }

            if let pending = navigation.pending, let oldDocument = pending.documentID,
                oldDocument != snapshot.documentID
            {
                navigation.pending = nil
                if pending.target.isRelative {
                    // The destroyed document had the starting position for this relative turn.
                    lastSyncResult = .failed("Page turn lost with destroyed document")
                } else {
                    navigation.pending = ReaderOperation(
                        target: pending.target,
                        purpose: pending.purpose,
                        revision: navigation.revision,
                    )
                }
            }
            if navigation.pending == nil {
                let target = await readerTarget()
                if navigation.confirmed?.documentID == snapshot.documentID,
                    navigation.confirmed?.target == target,
                    target.kind != "anchor" || snapshot.playhead?.visible == true
                {
                    try await paintPlayhead(on: bridge)
                    scheduleSplitSentenceFollow(snapshot: snapshot)
                    return await settledResult()
                }
                if target.kind == "anchor", snapshot.playhead?.visible == true,
                    snapshot.playhead?.sectionIndex == target.sectionIndex,
                    snapshot.playhead?.textId == target.textId
                {
                    navigation.confirmed = (snapshot.documentID, target)
                    try await paintPlayhead(on: bridge)
                    scheduleSplitSentenceFollow(snapshot: snapshot)
                    return await settledResult()
                }
                navigation.pending = ReaderOperation(
                    target: target,
                    purpose: .projection,
                    revision: navigation.revision,
                )
            }
            guard !snapshot.navigationBlocked else { return .deferred("Renderer settling") }
            guard var pending = navigation.pending else { return .synced }
            if let running = snapshot.command, running.status == "running", running.id != pending.id
            {
                return .deferred("Superseded command is still settling")
            }
            pending.documentID = snapshot.documentID
            navigation.pending = pending
            if snapshot.command?.id != pending.id {
                navigation.pending?.sent = true
                // JS deduplicates command IDs, so lost replies are safe to retry.
                try await bridge.dispatchReading(
                    ReaderCommand(
                        documentID: snapshot.documentID,
                        id: pending.id,
                        target: pending.target,
                    )
                )
            }
            for _ in 0..<20 {
                guard !Task.isCancelled, !isEnded, navigation.foreground, commsBridge === bridge,
                    navigation.pending?.id == pending.id
                else { return .deferred("Operation superseded") }
                snapshot = try await bridge.readingSnapshot(playhead: await currentPlayhead())
                guard snapshot.documentID == pending.documentID else {
                    return .deferred("Document replaced during command")
                }
                guard snapshotIsCurrent(snapshot), navigation.pending?.id == pending.id else {
                    return .deferred("Newer reader facts available")
                }
                navigation.snapshot = snapshot
                if let gesture = snapshot.gesture, gesture.active || gesture.moved {
                    navigation.pending = nil
                    scheduleReconciliation(reason: "gesture interrupted command")
                    return .deferred("Gesture superseded navigation")
                }
                if let receipt = snapshot.command, receipt.id == pending.id,
                    receipt.status != "running"
                {
                    if receipt.status == "completed" {
                        switch pending.purpose {
                            case .user(let reason):
                                guard
                                    await acceptUserDestination(
                                        receipt.location,
                                        snapshot: snapshot,
                                        reason: reason,
                                    )
                                else {
                                    return .deferred(
                                        "Navigation completed; audio/geometry not yet established"
                                    )
                                }
                            case .projection: break
                        }
                        guard navigation.pending?.id == pending.id, commsBridge === bridge else {
                            return .deferred("Newer navigation")
                        }
                        navigation.confirmed = (snapshot.documentID, pending.target)
                        navigation.pending = nil
                        try await bridge.acknowledgeReading(
                            documentID: snapshot.documentID,
                            commandID: pending.id,
                        )
                        try await paintPlayhead(on: bridge)
                        scheduleSplitSentenceFollow(snapshot: snapshot)
                        return await settledResult()
                    }
                    navigation.pending = nil
                    try await bridge.acknowledgeReading(
                        documentID: snapshot.documentID,
                        commandID: pending.id,
                    )
                    return .failed(receipt.error ?? "Navigation \(receipt.status)")
                }
                try await Task.sleep(for: .milliseconds(50))
            }
            return .deferred("Awaiting retained navigation receipt")
        } catch {
            return .deferred("Reader/progress unavailable: \(error.localizedDescription)")
        }
    }

    private func snapshotIsCurrent(_ snapshot: ReaderSnapshot) -> Bool {
        guard let known = navigation.snapshot else { return true }
        return known.documentID != snapshot.documentID || known.sequence <= snapshot.sequence
    }

    private func settledResult() async -> ReadingSyncResult {
        await saveProgressLocally(reason: .appWokeFromSleep)
            ? .synced : .deferred("Local progress save failed")
    }

    public func navigateTextChapter(by delta: Int) {
        guard let location = navigation.snapshot?.location, let index = location.sectionIndex else {
            return
        }
        let restart =
            delta < 0
            && previousChapterRestarts(
                progressInChapter: location.chapterFraction ?? 0,
                lastRestartAt: navigation.lastChapterRestart,
            )
        var target = restart ? index : index + delta
        while !restart, bookStructure.indices.contains(target), bookStructure[target].linear == "no"
        { target += delta }
        guard bookStructure.indices.contains(target) else { return }
        navigation.lastChapterRestart = restart ? Date() : nil
        requestReaderNavigation(
            ReaderTarget(kind: "section", sectionIndex: target, fraction: 0),
            reason: .userSelectedChapter,
        )
    }

    /// Invalidates pending reader operations before an audio seek or Play.
    @discardableResult
    func beginAudioNavigation() -> UInt64 {
        navigation.revision &+= 1
        navigation.audioOperation = navigation.revision
        navigation.pending = nil
        navigation.confirmed = nil
        navigation.followTimer?.cancel()
        navigation.followTimer = nil
        return navigation.revision
    }

    func finishAudioNavigation(_ revision: UInt64) {
        if navigation.audioOperation == revision { navigation.audioOperation = nil }
    }

    public func requestReaderNavigation(_ target: ReaderTarget, reason: SyncReason) {
        guard !isEnded else { return }
        navigation.revision &+= 1
        navigation.retryCount = 0
        navigation.followTimer?.cancel()
        navigation.peer = nil
        navigation.pending = ReaderOperation(
            target: target,
            purpose: .user(reason),
            revision: navigation.revision,
        )
        navigation.confirmed = nil
        onUserNavigation?()
        scheduleReconciliation(reason: "user navigation")
    }

    private func acceptUserDestination(
        _ location: ReaderLocation?,
        snapshot: ReaderSnapshot,
        reason: SyncReason,
    ) async -> Bool {
        guard !snapshot.navigationBlocked, let location, let locator = location.locator, !isEnded
        else { return false }
        navigation.peer = nil
        let revision = navigation.revision
        navigation.audioOperation = revision
        defer { finishAudioNavigation(revision) }
        if content.hasAudio, !(await audioFollowsUserNavigation()) {
            guard revision == navigation.revision, !isEnded else { return false }
            navigation.browseLocation = locator
            return true
        }
        if content.hasAlignment, let sectionIndex = location.sectionIndex,
            let section = bookStructure[safe: sectionIndex]
        {
            let scrolling = location.flow == "scrolled"
            if snapshot.playhead?.visible == true {
                // Moving the viewport does not move audio while its sentence is still visible.
                if !playback.acceptedAudio {
                    await acceptAudioPosition()
                    playback.origin = .userText
                    await saveProgressLocally(reason: reason)
                }
                return true
            }
            if let measured = snapshot.playhead, measured.visible == nil { return false }
            if !section.mediaOverlay.isEmpty {
                guard let visible = snapshot.visibleIDs,
                    let preferred = scrolling ? snapshot.visibleIDs : snapshot.fullyVisibleIDs
                else { return false }
                // Prefer a fully visible sentence on page turns, then an intersecting one.
                if let entry = section.mediaOverlay.first(where: { preferred.contains($0.textId) })
                    ?? section.mediaOverlay.first(where: { visible.contains($0.textId) })
                {
                    guard
                        await engine.seekToFragment(
                            sectionIndex: sectionIndex,
                            textId: entry.textId,
                        ),
                        navigation.revision == revision, !isEnded
                    else { return false }
                    await acceptAudioPosition()
                    playback.origin = .userText
                    await saveProgressLocally(reason: reason)
                    navigation.browseLocation = nil
                    return true
                }
            }
            // Stop audio updates from overwriting the unnarrated text position.
            playback.acceptedAudio = false
            await engine.pause()
        }
        guard revision == navigation.revision, !isEnded else { return false }
        playback.accepted = locator
        playback.acceptedAudio = false
        playback.acceptedAt = Date().timeIntervalSince1970 * 1000
        playback.origin = .userText
        navigation.browseLocation = nil
        await saveProgressLocally(reason: reason)
        return true
    }

    private func readerTarget() async -> ReaderTarget {
        if let browse = navigation.browseLocation { return .location(browse) }
        if let peer = navigation.peer { return .location(peer.locator) }
        if playback.acceptedAudio, let anchor = await currentPlayhead() {
            return ReaderTarget(
                kind: "anchor",
                sectionIndex: anchor.sectionIndex,
                textId: anchor.textId,
            )
        }
        return playback.accepted.map(ReaderTarget.location)
            ?? ReaderTarget(kind: "fraction", fraction: 0)
    }

    private func displayedPlayhead() async -> ReaderPlayhead? {
        if let peer = navigation.peer,
            let section = findSectionIndex(for: peer.locator.href, in: bookStructure),
            let fragment = peer.locator.locations?.fragments?.first
        {
            return ReaderPlayhead(sectionIndex: section, textId: fragment)
        }
        return await currentPlayhead()
    }

    /// Local audio position used for visibility checks.
    private func currentPlayhead() async -> ReaderPlayhead? {
        guard let sync = await engine.getBackgroundSyncData(),
            await engine.getLoadedBookID() == bookID
        else { return nil }
        return ReaderPlayhead(sectionIndex: sync.sectionIndex, textId: sync.fragment)
    }

    private func paintPlayhead(on bridge: ReaderBridge) async throws {
        let state = await engine.getCurrentState()
        let playing = state?.bookID == bookID && state?.isPlaying == true
        let mode =
            ReadaloudHighlightVisibility(rawValue: settings.readaloudHighlightVisibility) ?? .paused
        let show = playing || mode == .always || (mode == .paused && playback.origin != .userText)
        guard commsBridge === bridge, let documentID = navigation.snapshot?.documentID else {
            throw ReaderBridgeError.jsNotAvailable
        }
        try await bridge.presentReading(
            documentID: documentID,
            playing: playing,
            highlight: show,
            follow: !isBrowsing,
            anchor: await displayedPlayhead(),
        )
    }

    private func scheduleSplitSentenceFollow(snapshot: ReaderSnapshot) {
        guard navigation.followTimer == nil, !isBrowsing, snapshot.location?.flow != "scrolled",
            let geometry = snapshot.playhead, let offscreen = geometry.offScreenRatio,
            offscreen > 0,
            let visible = geometry.visibleRatio
        else { return }
        let revision = navigation.revision
        navigation.followTimer = Task { @StorytellerUIActor [weak self] in
            guard let self, let entry = await engine.getCurrentEntry(),
                let audio = await engine.getCurrentState(), audio.isPlaying
            else {
                self?.navigation.followTimer = nil
                return
            }
            let time = await engine.getBackgroundSyncData()?.currentTime ?? entry.begin
            let remainingVisible = (entry.end - entry.begin) * visible - max(0, time - entry.begin)
            let delay =
                offscreen >= 0.9 ? 0 : max(0, remainingVisible / max(audio.playbackRate, 0.1))
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled, !isEnded, navigation.revision == revision,
                !isBrowsing, navigation.pending == nil, let bridge = commsBridge,
                let fresh = try? await bridge.readingSnapshot(playhead: geometry),
                fresh.documentID == snapshot.documentID, fresh.gesture?.active != true
            else {
                self.navigation.followTimer = nil
                return
            }
            navigation.followTimer = nil
            let now = await currentPlayhead()
            guard now?.textId == geometry.textId, now?.sectionIndex == geometry.sectionIndex else {
                return
            }
            navigation.pending = ReaderOperation(
                target: ReaderTarget(kind: "next", animated: false),
                purpose: .projection,
                revision: revision,
            )
            _ = await ensureSynced(reason: "split sentence follow")
        }
    }

    public func returnToPlayhead() async {
        navigation.revision &+= 1
        navigation.browseLocation = nil
        navigation.pending = nil
        navigation.confirmed = nil
        _ = await ensureSynced(reason: "return to playhead")
    }

    public func userSeekNarration(sectionIndex: Int, anchor: String, doubleTap: Bool) async {
        let revision = beginAudioNavigation()
        defer { finishAudioNavigation(revision) }
        guard await engine.getLoadedBookID() == bookID,
            await engine.seekToFragment(sectionIndex: sectionIndex, textId: anchor),
            navigation.revision == revision, !isEnded
        else { return }
        navigation.browseLocation = nil
        navigation.confirmed = nil
        await acceptAudioPosition()
        playback.origin = .userAudio
        navigation.peer = nil
        finishAudioNavigation(revision)
        await saveProgressLocally(reason: .userDraggedSeekBar)
        if doubleTap {
            let mode = DoubleTapPlayMode(rawValue: settings.doubleTapPlay) ?? .never
            if mode == .always
                || (mode == .headphones
                    && StorytellerPlatform.audioRoute?.isHeadphoneRouteActive == true)
            {
                try? await play()
            }
        }
        scheduleReconciliation(reason: "explicit narration seek")
    }

    public func skipSentence(by delta: Int) async {
        guard let position = await engine.getBackgroundSyncData() else { return }
        let entries = bookStructure.enumerated().flatMap { section, value in
            value.mediaOverlay.map { (section, $0.textId) }
        }
        guard
            let current = entries.firstIndex(where: {
                $0.0 == position.sectionIndex && $0.1 == position.fragment
            }),
            let target = entries[safe: current + delta]
        else { return }
        await userSeekNarration(sectionIndex: target.0, anchor: target.1, doubleTap: false)
    }

    func receivePeerPosition(_ packet: LiveReadingSyncPacket) async {
        guard !isEnded, packet.bookID == bookID, navigation.pending == nil,
            navigation.snapshot?.gesture?.active != true,
            await engine.getCurrentState()?.isPlaying != true,
            let section = findSectionIndex(for: packet.textHref, in: bookStructure),
            bookStructure[section].mediaOverlay.contains(where: { $0.textId == packet.textId })
        else { return }
        let locator = BookLocator(
            href: packet.textHref,
            type: "application/xhtml+xml",
            title: nil,
            locations: BookLocator.Locations(
                fragments: [packet.textId],
                progression: nil,
                position: nil,
                totalProgression: nil,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )
        navigation.peer = (locator, Date().addingTimeInterval(30), packet.playbackRate)
        navigation.browseLocation = nil
        _ = await ensureSynced(reason: "peer progress")
    }

    func nativePageIndex(for locator: BookLocator) -> Int? {
        if let index = findSectionIndex(for: locator.href, in: bookStructure) { return index }
        guard !bookStructure.isEmpty, let fraction = locator.locations?.totalProgression,
            fraction.isFinite, (0...1).contains(fraction)
        else { return nil }
        return Int(fraction * Double(max(0, bookStructure.count - 1)))
    }
    public func nativeReaderReady(pageCount: Int) {
        guard pageCount > 0 else { return }
        let locator = playback.accepted ?? metadata.position?.locator
        let index = locator.flatMap(nativePageIndex) ?? 0
        displayNativePage(min(max(0, index), pageCount - 1), user: false)
    }
    public func selectNativePage(_ index: Int) { displayNativePage(index, user: true) }
    public func moveNativePage(by delta: Int) {
        displayNativePage((readerLocation?.sectionIndex ?? 0) + delta, user: true)
    }
    public func seekNativePage(fraction: Double) {
        guard fraction.isFinite else { return }
        displayNativePage(
            Int(min(max(0, fraction), 1) * Double(max(0, bookStructure.count - 1))),
            user: true,
        )
    }
    private func displayNativePage(_ index: Int, user: Bool) {
        guard !isEnded, let section = bookStructure[safe: index] else { return }
        let location = ReaderLocation(
            sectionIndex: index,
            pageIndex: index + 1,
            totalPages: bookStructure.count,
            href: section.id,
            cfi: nil,
            fraction: Double(index) / Double(max(1, bookStructure.count - 1)),
            chapterFraction: 0,
            flow: "native",
            reason: user ? "user" : "restore",
        )
        navigation.nativeLocation = location
        if user {
            playback.accepted = location.locator
            playback.acceptedAudio = false
            playback.origin = .userText
            playback.acceptedAt = Date().timeIntervalSince1970 * 1000
            Task { await saveProgressLocally(reason: .userSelectedChapter) }
        }
    }
}
