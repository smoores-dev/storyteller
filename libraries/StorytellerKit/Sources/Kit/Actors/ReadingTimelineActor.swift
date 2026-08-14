import Foundation

/// Coalesces raw position updates into reading visits.
public actor ReadingTimelineActor {
    public static let shared = ReadingTimelineActor()

    private static let maxVisitsPerBook = 200
    private static let sessionGapMs: Double = 30 * 60 * 1000
    private static let jumpProgressionDelta = 0.05

    private var visits: [BookID: [ReadingVisit]] = [:]
    private var loaded = false
    private var observers: [UUID: @Sendable () -> Void] = [:]

    public init() {}

    public func record(
        bookID: BookID,
        locator: BookLocator,
        timestamp: Double,
        reason: SyncReason,
        sourceIdentifier: String,
        locationDescription: String,
        contextText: String? = nil,
    ) async {
        guard await ensureLoaded() else { return }

        let source = ReadingVisitSource(sourceIdentifier: sourceIdentifier)
        let progression = locator.locations?.totalProgression
        var bookVisits = visits[bookID] ?? []

        if let open = bookVisits.last, timestamp < open.endedAt {
            return
        }

        if var open = bookVisits.last, shouldExtend(
            open,
            timestamp: timestamp,
            reason: reason,
            source: source,
            progression: progression,
        ) {
            open.endedAt = timestamp
            open.endLocator = locator
            if let progression {
                open.endProgression = progression
            }
            if !locationDescription.isEmpty {
                open.endDescription = locationDescription
            }
            if let contextText {
                open.endText = contextText
            }
            open.eventCount += 1
            bookVisits[bookVisits.count - 1] = open
        } else {
            let visit = ReadingVisit(
                startedAt: timestamp,
                endedAt: timestamp,
                startLocator: locator,
                endLocator: locator,
                startProgression: progression,
                endProgression: progression,
                startDescription: locationDescription,
                endDescription: locationDescription,
                source: source,
                openedByJump: Self.jumpReasons.contains(reason),
                endText: contextText,
            )
            bookVisits.append(visit)
            if bookVisits.count > Self.maxVisitsPerBook {
                bookVisits.removeFirst(bookVisits.count - Self.maxVisitsPerBook)
            }
        }

        visits[bookID] = bookVisits
        await saveToDisk()
        notifyObservers()
    }

    public func getVisits(for bookID: BookID) async -> [ReadingVisit] {
        guard await ensureLoaded() else { return [] }
        return visits[bookID] ?? []
    }

    public func clearVisits(for bookID: BookID) async {
        guard await ensureLoaded() else { return }
        visits.removeValue(forKey: bookID)
        await saveToDisk()
        notifyObservers()
    }

    public func removeVisits(ids: Set<UUID>, for bookID: BookID) async {
        guard await ensureLoaded(), !ids.isEmpty else { return }
        guard var bookVisits = visits[bookID] else { return }
        bookVisits.removeAll { ids.contains($0.id) }
        if bookVisits.isEmpty {
            visits.removeValue(forKey: bookID)
        } else {
            visits[bookID] = bookVisits
        }
        await saveToDisk()
        notifyObservers()
    }

    @discardableResult
    public func addObserver(_ callback: @escaping @Sendable () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        return id
    }

    public func removeObserver(id: UUID) {
        observers.removeValue(forKey: id)
    }

    private static let jumpReasons: Set<SyncReason> = [
        .userSelectedChapter, .userDraggedSeekBar, .userRestoredFromHistory,
    ]

    private func shouldExtend(
        _ visit: ReadingVisit,
        timestamp: Double,
        reason: SyncReason,
        source: ReadingVisitSource,
        progression: Double?,
    ) -> Bool {
        guard source == visit.source else { return false }
        guard timestamp - visit.endedAt < Self.sessionGapMs else { return false }
        guard !Self.jumpReasons.contains(reason) else { return false }
        if let progression, let last = visit.endProgression,
            abs(progression - last) > Self.jumpProgressionDelta
        {
            return false
        }
        return true
    }

    private func notifyObservers() {
        for (_, callback) in observers {
            callback()
        }
    }

    private func ensureLoaded() async -> Bool {
        guard !loaded else { return true }
        do {
            let stored = try await FilesystemActor.shared.loadReadingTimeline()
            guard !loaded else { return true }
            visits = stored
        } catch {
            debugLog("[RTA] ensureLoaded: starting fresh - \(error)")
            visits = [:]
        }
        loaded = true
        return true
    }

    private func saveToDisk() async {
        guard loaded else { return }
        do {
            try await FilesystemActor.shared.saveReadingTimeline(visits)
        } catch {
            debugLog("[RTA] saveToDisk: failed - \(error)")
        }
    }
}
