import Foundation

public enum AudiobookError: Error, LocalizedError {
    case invalidFileFormat(String)
    case fileNotFound
    case failedToLoadMetadata
    case playbackFailed(String)
    case playbackUnavailable

    public var errorDescription: String? {
        switch self {
            case .invalidFileFormat(let format):
                return
                    "Audiobook format '\(format)' is not supported. Audiobooks must use manifest.json packages."
            case .fileNotFound:
                return "Audiobook file not found at the specified path."
            case .failedToLoadMetadata:
                return "Failed to load audiobook metadata or chapters."
            case .playbackFailed(let reason):
                return "Playback failed: \(reason)"
            case .playbackUnavailable:
                return "Audio playback is not available on this platform."
        }
    }
}

extension Array {
    public subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

public struct AudiobookChapter: Sendable, Hashable {
    public let id: String
    public let title: String
    public let startTime: TimeInterval
    public let duration: TimeInterval
    public let href: String

    public init(
        id: String? = nil,
        title: String,
        startTime: TimeInterval,
        duration: TimeInterval,
        href: String,
    ) {
        self.id = id ?? href
        self.title = title
        self.startTime = startTime
        self.duration = duration
        self.href = href
    }
}

public struct AudiobookTrack: Sendable, Hashable {
    public let href: String
    public let url: URL
    public let type: String?
    public let duration: TimeInterval
    public let startTime: TimeInterval

    public init(
        href: String,
        url: URL,
        type: String?,
        duration: TimeInterval,
        startTime: TimeInterval,
    ) {
        self.href = href
        self.url = url
        self.type = type
        self.duration = duration
        self.startTime = startTime
    }
}

public struct AudiobookMetadata: Sendable {
    public let chapters: [AudiobookChapter]
    public let tracks: [AudiobookTrack]
    public let totalDuration: TimeInterval
    public let title: String?
    public let author: String?

    public init(
        chapters: [AudiobookChapter],
        tracks: [AudiobookTrack] = [],
        totalDuration: TimeInterval,
        title: String?,
        author: String?,
    ) {
        self.chapters = chapters
        self.tracks = tracks
        self.totalDuration = totalDuration
        self.title = title
        self.author = author
    }
}

public struct AudiobookPlaybackState: Sendable {
    public let isPlaying: Bool
    public let currentTime: TimeInterval
    public let duration: TimeInterval
    public let currentChapterIndex: Int?
    public let playbackRate: Float
    public let volume: Float
    public let currentTrackHref: String?
    public let currentTrackType: String?
    public let currentTrackTime: TimeInterval

    public init(
        isPlaying: Bool,
        currentTime: TimeInterval,
        duration: TimeInterval,
        currentChapterIndex: Int?,
        playbackRate: Float,
        volume: Float,
        currentTrackHref: String? = nil,
        currentTrackType: String? = nil,
        currentTrackTime: TimeInterval = 0,
    ) {
        self.isPlaying = isPlaying
        self.currentTime = currentTime
        self.duration = duration
        self.currentChapterIndex = currentChapterIndex
        self.playbackRate = playbackRate
        self.volume = volume
        self.currentTrackHref = currentTrackHref
        self.currentTrackType = currentTrackType
        self.currentTrackTime = currentTrackTime
    }
}

@globalActor
public actor AudiobookActor {
    public static let shared = AudiobookActor()

    private var player: (any AudioPlaying)?
    private var metadata: AudiobookMetadata?
    private var currentPackageRootURL: URL?
    private var currentTrackIndex: Int = 0
    private var desiredPlaybackRate: Float = 1.0
    private var desiredVolume: Float = 1.0
    // AudioPlaying has no isPlaying accessor; the actor is the source of truth
    // for play/pause intent (players only emit events, never auto-pause).
    private var isPlaying = false
    private var rewind = AutomaticRewind()
    private var stateObservers: [UUID: @Sendable (AudiobookPlaybackState) -> Void] = [:]

    private init() {}

    public func validateAndLoadAudiobook(url: URL) async throws -> AudiobookMetadata {
        let source = try await loadManifestPackage(from: url)
        metadata = source
        currentPackageRootURL = try packageRootURL(for: url)
        currentTrackIndex = 0
        await player?.stop()
        player = nil
        isPlaying = false
        return source
    }

    private struct Manifest: Decodable {
        struct Metadata: Decodable {
            let title: String?
            let author: String?
            let narrator: String?
            let duration: Double?

            enum CodingKeys: String, CodingKey {
                case title
                case author
                case narrator
                case duration
            }

            init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                title = Self.decodeStringOrStringArray(container, forKey: .title)
                author = Self.decodeStringOrStringArray(container, forKey: .author)
                narrator = Self.decodeStringOrStringArray(container, forKey: .narrator)
                duration = try? container.decode(Double.self, forKey: .duration)
            }

            private static func decodeStringOrStringArray(
                _ container: KeyedDecodingContainer<CodingKeys>,
                forKey key: CodingKeys,
            ) -> String? {
                if let string = try? container.decode(String.self, forKey: key) {
                    return string
                }
                if let strings = try? container.decode([String].self, forKey: key) {
                    let joined =
                        strings
                        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        .filter { !$0.isEmpty }
                        .joined(separator: ", ")
                    return joined.isEmpty ? nil : joined
                }
                return nil
            }
        }

        struct Link: Decodable {
            let href: String
            let type: String?
            let title: String?
            let duration: Double?
        }

        let metadata: Metadata?
        let readingOrder: [Link]
        let toc: [Link]?
    }

    private func packageRootURL(for url: URL) throws -> URL {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw AudiobookError.fileNotFound
        }

        if url.hasDirectoryPath {
            return url
        }

        if url.lastPathComponent == "manifest.json" {
            return url.deletingLastPathComponent()
        }

        throw AudiobookError.invalidFileFormat(url.pathExtension)
    }

    private func loadManifestPackage(from url: URL) async throws -> AudiobookMetadata {
        let rootURL = try packageRootURL(for: url)
        let manifestURL = rootURL.appendingPathComponent("manifest.json", isDirectory: false)
        guard FileManager.default.fileExists(atPath: manifestURL.path) else {
            throw AudiobookError.fileNotFound
        }

        let data = try Data(contentsOf: manifestURL)
        let manifest = try JSONDecoder().decode(Manifest.self, from: data)
        guard !manifest.readingOrder.isEmpty else {
            throw AudiobookError.failedToLoadMetadata
        }

        var tracks: [AudiobookTrack] = []
        var cursor: TimeInterval = 0

        for item in manifest.readingOrder {
            let resourceURL = try resolveManifestHref(item.href, rootURL: rootURL)
            guard FileManager.default.fileExists(atPath: resourceURL.path) else {
                throw AudiobookError.fileNotFound
            }

            let duration: TimeInterval
            if let manifestDuration = item.duration {
                duration = manifestDuration
            } else if let probe = StorytellerPlatform.audioMetadata {
                duration = (try? await probe.duration(of: resourceURL)) ?? 0
            } else {
                duration = 0
            }
            tracks.append(
                AudiobookTrack(
                    href: stripFragment(from: item.href),
                    url: resourceURL,
                    type: item.type,
                    duration: duration,
                    startTime: cursor,
                )
            )
            cursor += duration
        }

        let totalDuration = manifest.metadata?.duration ?? cursor
        let chapters = await loadManifestChapters(
            from: manifest,
            tracks: tracks,
            totalDuration: totalDuration,
        )

        return AudiobookMetadata(
            chapters: chapters,
            tracks: tracks,
            totalDuration: totalDuration,
            title: manifest.metadata?.title,
            author: manifest.metadata?.author ?? manifest.metadata?.narrator,
        )
    }

    private func loadManifestChapters(
        from manifest: Manifest,
        tracks: [AudiobookTrack],
        totalDuration: TimeInterval,
    ) async -> [AudiobookChapter] {
        var chapters: [AudiobookChapter] = []
        let tocItems = manifest.toc ?? []

        for (index, item) in tocItems.enumerated() {
            guard let start = globalTime(for: item.href, tracks: tracks) else { continue }
            let title = item.title ?? "Chapter \(index + 1)"
            chapters.append(
                AudiobookChapter(
                    id: "toc-\(index)-\(item.href)",
                    title: title,
                    startTime: start,
                    duration: 0,
                    href: item.href,
                )
            )
        }

        chapters.sort { $0.startTime < $1.startTime }

        if chapters.isEmpty {
            for (index, track) in tracks.enumerated() {
                chapters.append(
                    AudiobookChapter(
                        id: "track-\(index)-\(track.href)",
                        title: fallbackChapterTitle(for: track.href, index: index),
                        startTime: track.startTime,
                        duration: track.duration,
                        href: "\(track.href)#t=0",
                    )
                )
            }
        } else {
            chapters = chapters.enumerated().map { index, chapter in
                let nextStart =
                    index + 1 < chapters.count
                    ? chapters[index + 1].startTime
                    : totalDuration
                return AudiobookChapter(
                    id: chapter.id,
                    title: chapter.title,
                    startTime: chapter.startTime,
                    duration: max(0, nextStart - chapter.startTime),
                    href: chapter.href,
                )
            }
        }

        if chapters.isEmpty {
            chapters.append(
                AudiobookChapter(
                    id: "chapter-0",
                    title: "Full Book",
                    startTime: 0,
                    duration: totalDuration,
                    href: tracks.first.map { "\($0.href)#t=0" } ?? "chapter-0",
                )
            )
        }

        return normalizedChapterTitles(chapters, tracks: tracks)
    }

    private func normalizedChapterTitles(
        _ chapters: [AudiobookChapter],
        tracks: [AudiobookTrack],
    ) -> [AudiobookChapter] {
        let uniqueTitles = Set(
            chapters
                .map { $0.title.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        )
        guard chapters.count > 1, uniqueTitles.count <= 1 else { return chapters }

        return chapters.enumerated().map { index, chapter in
            let title =
                track(for: chapter, tracks: tracks)
                .map { fallbackChapterTitle(for: $0.href, index: index) }
                ?? "Chapter \(index + 1)"

            return AudiobookChapter(
                id: chapter.id,
                title: title,
                startTime: chapter.startTime,
                duration: chapter.duration,
                href: chapter.href,
            )
        }
    }

    private func track(for chapter: AudiobookChapter, tracks: [AudiobookTrack]) -> AudiobookTrack? {
        tracks.last { $0.startTime <= chapter.startTime + 0.25 }
    }

    private func fallbackChapterTitle(for href: String, index: Int) -> String {
        let path = stripFragment(from: href).removingPercentEncoding ?? stripFragment(from: href)
        let title = URL(fileURLWithPath: path)
            .deletingPathExtension()
            .lastPathComponent
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? "Chapter \(index + 1)" : title
    }

    private func resolveManifestHref(_ href: String, rootURL: URL) throws -> URL {
        let path = stripFragment(from: href)
        if let url = URL(string: path), url.isFileURL {
            return url
        }
        let decoded = path.removingPercentEncoding ?? path
        guard !decoded.isEmpty else {
            throw AudiobookError.failedToLoadMetadata
        }
        if decoded.hasPrefix("/") {
            return URL(fileURLWithPath: decoded)
        }
        return rootURL.appendingPathComponent(decoded, isDirectory: false)
    }

    private func stripFragment(from href: String) -> String {
        href.split(separator: "#", maxSplits: 1).first.map(String.init) ?? href
    }

    private func fragmentTime(from href: String) -> TimeInterval {
        guard let fragment = href.split(separator: "#", maxSplits: 1).dropFirst().first else {
            return 0
        }
        let fragmentString = String(fragment)
        guard fragmentString.hasPrefix("t=") else { return 0 }
        return TimeInterval(fragmentString.dropFirst(2)) ?? 0
    }

    private func globalTime(for href: String, tracks: [AudiobookTrack]) -> TimeInterval? {
        let trackHref = stripFragment(from: href)
        guard let track = tracks.first(where: { $0.href == trackHref }) else {
            return nil
        }
        return track.startTime + fragmentTime(from: href)
    }

    private func loadChapters(fromTrackAt url: URL, totalDuration: TimeInterval)
        async throws -> [AudiobookChapter]
    {
        let fullBook = [
            AudiobookChapter(
                title: "Full Book",
                startTime: 0,
                duration: totalDuration,
                href: "chapter-0",
            )
        ]

        guard let probe = StorytellerPlatform.audioMetadata else {
            return fullBook
        }

        let probed = try await probe.chapters(of: url)
        guard !probed.isEmpty else {
            return fullBook
        }

        return probed.enumerated().map { index, chapter in
            AudiobookChapter(
                title: chapter.title ?? "Chapter \(index + 1)",
                startTime: chapter.start,
                duration: chapter.duration,
                href: "chapter-\(index)",
            )
        }
    }

    public func preparePlayer(at globalTime: TimeInterval? = nil) async throws {
        guard let metadata, !metadata.tracks.isEmpty else {
            throw AudiobookError.failedToLoadMetadata
        }
        guard let factory = StorytellerPlatform.audioPlayerFactory else {
            throw AudiobookError.playbackUnavailable
        }

        let clampedTime = globalTime.map { min(max($0, 0), metadata.totalDuration) }
        if let clampedTime {
            currentTrackIndex = trackIndex(for: clampedTime, in: metadata.tracks)
        }
        guard metadata.tracks.indices.contains(currentTrackIndex) else {
            throw AudiobookError.failedToLoadMetadata
        }

        try? await factory.prepareSession(longForm: true)

        let track = metadata.tracks[currentTrackIndex]
        let player = self.player ?? factory.makePlayer(profile: .audiobookTrack)
        do {
            _ = try await player.load(url: track.url)
        } catch {
            throw AudiobookError.playbackFailed(error.localizedDescription)
        }
        await player.setRate(Double(desiredPlaybackRate))
        await player.setVolume(Double(desiredVolume))
        await player.setEventHandler { event in
            Task { @AudiobookActor in
                await AudiobookActor.shared.handlePlayerEvent(event)
            }
        }
        if let clampedTime {
            await player.seek(to: max(0, clampedTime - track.startTime))
        }
        self.player = player

        await SMILPlayerActor.shared.setActiveAudioPlayer(.audiobook)
    }

    public func play(automaticRewind: Bool = false) async throws {
        if player == nil {
            try await preparePlayer()
            guard player != nil else {
                throw AudiobookError.playbackFailed("Player not initialized")
            }
        }

        if automaticRewind {
            let seconds = rewind.secondsOnResume(
                config: await SettingsActor.shared.config.playback
            )
            if seconds > 0 {
                await skipBackward(seconds)
            }
        }

        try? await StorytellerPlatform.audioPlayerFactory?.prepareSession(longForm: true)
        await player?.play()
        isPlaying = true
        await notifyStateChange()
    }

    public func pause() async {
        debugLog("[AudiobookActor] pause() called")
        await player?.pause()
        isPlaying = false
        rewind.recordPause()
        await notifyStateChange()
    }

    public func togglePlayPause(automaticRewind: Bool = true) async throws {
        if isPlaying {
            await pause()
        } else {
            try await play(automaticRewind: automaticRewind)
        }
    }

    public func seek(to time: TimeInterval) async {
        guard let metadata, !metadata.tracks.isEmpty else { return }
        rewind.reset()
        let clampedTime = min(max(time, 0), metadata.totalDuration)
        let trackIndex = trackIndex(for: clampedTime, in: metadata.tracks)
        let requiresReload = player == nil || trackIndex != currentTrackIndex
        let wasPlaying = isPlaying
        currentTrackIndex = trackIndex
        do {
            if requiresReload {
                try await preparePlayer()
            }
            if let track = metadata.tracks[safe: trackIndex] {
                await player?.seek(to: max(0, clampedTime - track.startTime))
            }
            if requiresReload, wasPlaying {
                await player?.play()
            }
        } catch {
            debugLog("[AudiobookActor] seek failed: \(error)")
            if requiresReload {
                isPlaying = false
            }
        }
        await notifyStateChange()
    }

    public func skipForward(_ seconds: TimeInterval = 15) async {
        let state = await getCurrentState()
        let newTime = min((state?.currentTime ?? 0) + seconds, metadata?.totalDuration ?? 0)
        await seek(to: newTime)
    }

    public func skipBackward(_ seconds: TimeInterval = 15) async {
        let state = await getCurrentState()
        let newTime = max((state?.currentTime ?? 0) - seconds, 0)
        await seek(to: newTime)
    }

    public func setPlaybackRate(_ rate: Double) async {
        desiredPlaybackRate = Float(rate)
        await player?.setRate(rate)
        await notifyStateChange()
    }

    public func setVolume(_ volume: Double) async {
        desiredVolume = Float(volume)
        await player?.setVolume(volume)
        await notifyStateChange()
    }

    public func seekToChapter(href: String) async {
        guard let chapters = metadata?.chapters else { return }
        guard
            let chapter = chapters.first(where: { $0.id == href })
                ?? chapters.first(where: { $0.href == href })
        else { return }
        await seek(to: chapter.startTime)
    }

    public func getCurrentChapterIndex() async -> Int? {
        guard let chapters = metadata?.chapters else { return nil }
        let currentTime = await currentGlobalTime()

        for (index, chapter) in chapters.enumerated() {
            let chapterEnd = chapter.startTime + chapter.duration
            if currentTime >= chapter.startTime && currentTime < chapterEnd {
                return index
            }
        }

        return chapters.isEmpty ? nil : chapters.count - 1
    }

    public func getCurrentState() async -> AudiobookPlaybackState? {
        guard let metadata else { return nil }

        var trackTime: TimeInterval = 0
        if let player {
            trackTime = await player.currentTime
        }

        return AudiobookPlaybackState(
            isPlaying: isPlaying,
            currentTime: await currentGlobalTime(),
            duration: metadata.totalDuration,
            currentChapterIndex: await getCurrentChapterIndex(),
            playbackRate: desiredPlaybackRate,
            volume: desiredVolume,
            currentTrackHref: metadata.tracks[safe: currentTrackIndex]?.href,
            currentTrackType: metadata.tracks[safe: currentTrackIndex]?.type,
            currentTrackTime: trackTime,
        )
    }

    public func addStateObserver(
        id: UUID = UUID(),
        observer: @escaping @Sendable (AudiobookPlaybackState) -> Void,
    ) async -> UUID {
        debugLog("[AudiobookActor] addStateObserver called, id=\(id)")
        stateObservers[id] = observer
        debugLog("[AudiobookActor] Observer stored, count=\(stateObservers.count)")
        if let state = await getCurrentState() {
            observer(state)
        }
        return id
    }

    public func removeStateObserver(id: UUID) async {
        stateObservers.removeValue(forKey: id)
    }

    private func notifyStateChange() async {
        guard let state = await getCurrentState() else {
            debugLog("[AudiobookActor] notifyStateChange: no current state")
            return
        }

        debugLog(
            "[AudiobookActor] notifyStateChange: isPlaying=\(state.isPlaying), observers=\(stateObservers.count)"
        )

        for observer in stateObservers.values {
            observer(state)
        }
    }

    private func currentGlobalTime() async -> TimeInterval {
        guard let metadata else { return 0 }
        let trackStart = metadata.tracks[safe: currentTrackIndex]?.startTime ?? 0
        var trackTime: TimeInterval = 0
        if let player {
            trackTime = await player.currentTime
        }
        return trackStart + trackTime
    }

    private func trackIndex(for globalTime: TimeInterval, in tracks: [AudiobookTrack]) -> Int {
        guard !tracks.isEmpty else { return 0 }
        for (index, track) in tracks.enumerated() {
            let end = track.startTime + track.duration
            if globalTime >= track.startTime && globalTime < end {
                return index
            }
        }
        return tracks.count - 1
    }

    private func handlePlayerEvent(_ event: AudioPlayerEvent) async {
        switch event {
            case .didFinishPlaying:
                await advanceToNextTrack()
            case .interruptionBegan:
                debugLog("[AudiobookActor] Audio session interrupted - pausing")
                await pause()
            case .interruptionEnded(let shouldResume):
                if shouldResume {
                    debugLog("[AudiobookActor] Audio session interruption ended - resuming")
                    do {
                        try await play(automaticRewind: true)
                    } catch {
                        debugLog("[AudiobookActor] Failed to resume after interruption: \(error)")
                    }
                } else {
                    debugLog("[AudiobookActor] Audio session interruption ended - no resume")
                }
            case .routeChanged(let shouldPause):
                if shouldPause {
                    debugLog("[AudiobookActor] Audio route lost (device unavailable) - pausing")
                    await pause()
                }
        }
    }

    private func advanceToNextTrack() async {
        guard isPlaying, let metadata else { return }

        let nextIndex = currentTrackIndex + 1
        guard metadata.tracks.indices.contains(nextIndex) else {
            isPlaying = false
            await notifyStateChange()
            return
        }

        currentTrackIndex = nextIndex
        do {
            try await preparePlayer()
            await player?.play()
            await notifyStateChange()
        } catch {
            debugLog("[AudiobookActor] Failed to advance track: \(error)")
            isPlaying = false
        }
    }

    public func seekToTotalProgressFraction(_ fraction: Double) async {
        guard let duration = metadata?.totalDuration else { return }
        let targetTime = duration * fraction
        await seek(to: targetTime)
    }

    public func cleanup() async {
        debugLog("[AudiobookActor] Cleanup called")
        await player?.stop()
        player = nil
        metadata = nil
        currentPackageRootURL = nil
        currentTrackIndex = 0
        isPlaying = false

        if await SMILPlayerActor.shared.activeAudioPlayer == .audiobook {
            await SMILPlayerActor.shared.setActiveAudioPlayer(.none)
        }
        await StorytellerPlatform.audioPlayerFactory?.deactivateSession()
    }
}
