import Foundation

public actor CoverCacheActor {
    public static let shared = CoverCacheActor()

    public enum Ask: Sendable {
        case sized(width: Int, height: Int)
        case full
    }

    nonisolated(unsafe) public static var deriveColorsFromData:
        (@Sendable (_ bookID: BookID, _ audio: Bool, _ data: Data) async -> Void)?

    private let colorStoreURL: URL
    private var colors: [String: [OkmainColor]] = [:]
    private var colorsLoaded = false
    private var colorSaveTask: Task<Void, Never>?

    private static let maxPersistedColorEntries = 20_000

    public init(directory: URL? = nil) {
        let base =
            directory
            ?? StorytellerPlatform.applicationSupportDirectory()
            .appendingPathComponent("CoverColors", isDirectory: true)
        colorStoreURL = base.appendingPathComponent(
            "derived_v\(CoverColorDerivation.algorithmVersion).json"
        )
    }

    private static func sizedVariant(audio: Bool) -> String {
        audio ? "audioSquare" : "standard"
    }

    private static func fullVariant(audio: Bool) -> String {
        audio ? "fullAudioSquare" : "fullStandard"
    }

    public func cover(
        for bookID: BookID,
        audio: Bool,
        ask: Ask,
        version: String?,
        allowNetwork: Bool,
        policy: CoverLoadPolicy,
    ) async -> CoverLoadResponse {
        ensureColorsLoaded()

        if policy == .forceRefresh {
            try? await FilesystemActor.shared.removeCoverImage(
                bookID: bookID,
                variant: Self.fullVariant(audio: audio),
            )
            try? await FilesystemActor.shared.removeCoverImage(
                bookID: bookID,
                variant: Self.sizedVariant(audio: audio),
            )
            removeColors(bookID: bookID, audio: audio)
            prioritizeFullCover(for: bookID, audio: audio, version: version)
        }

        if policy == .cachedThenFetch {
            if let full = await cachedFullCoverData(for: bookID, audio: audio) {
                return .cached(full)
            }
            if let sized = await cachedSizedCoverData(for: bookID, audio: audio) {
                return .cached(sized)
            }
            if await BookServiceActor.shared.sourceKind(for: bookID.sourceID) == .localFolder {
                guard let cover = await fetchFull(for: bookID, audio: audio, version: version)
                else { return .missing }
                return .fetched(cover)
            }
        }

        guard allowNetwork else { return .skippedOffline }

        switch ask {
            case .full:
                if let cover = await fetchFull(for: bookID, audio: audio, version: version) {
                    return .fetched(cover)
                }
            case .sized(let width, let height):
                if let cover = await BookServiceActor.shared.fetchCoverImage(
                    for: bookID,
                    audio: audio,
                    width: width,
                    height: height,
                    version: version,
                ) {
                    await persistSizedCover(bookID: bookID, audio: audio, data: cover.data)
                    return .fetched(cover)
                }
                if let cover = await fetchFull(for: bookID, audio: audio, version: version) {
                    return .fetched(cover)
                }
        }
        return .missing
    }

    public func cachedSizedCoverData(for bookID: BookID, audio: Bool) async -> Data? {
        await FilesystemActor.shared.loadCoverImage(
            bookID: bookID,
            variant: Self.sizedVariant(audio: audio),
        )
    }

    public func cachedFullCoverData(for bookID: BookID, audio: Bool) async -> Data? {
        await FilesystemActor.shared.loadCoverImage(
            bookID: bookID,
            variant: Self.fullVariant(audio: audio),
        )
    }

    public func persistSizedCover(bookID: BookID, audio: Bool, data: Data) async {
        try? await FilesystemActor.shared.saveCoverImage(
            bookID: bookID,
            data: data,
            variant: Self.sizedVariant(audio: audio),
        )
    }

    public func fullCover(
        for bookID: BookID,
        audio: Bool,
        version: String? = nil,
        allowNetwork: Bool = true,
    ) async -> Data? {
        ensureColorsLoaded()
        if let data = await cachedFullCoverData(for: bookID, audio: audio) {
            return data
        }
        guard allowNetwork else { return nil }
        return await fetchFull(for: bookID, audio: audio, version: version)?.data
    }

    private func fetchFull(
        for bookID: BookID,
        audio: Bool,
        version: String?,
    ) async -> BookCover? {
        var cover = await BookServiceActor.shared.fetchCoverImage(
            for: bookID,
            audio: audio,
            width: nil,
            height: nil,
            version: version,
        )
        if cover == nil {
            cover = await BookServiceActor.shared.fetchCoverImage(
                for: bookID,
                audio: audio,
                width: 1600,
                height: audio ? 1600 : 2400,
                version: version,
            )
        }
        guard let cover else { return nil }
        try? await FilesystemActor.shared.saveCoverImage(
            bookID: bookID,
            data: cover.data,
            variant: Self.fullVariant(audio: audio),
        )
        return cover
    }

    public func invalidate(bookID: BookID) async {
        try? await FilesystemActor.shared.removeCoverImages(bookID: bookID)
        removeColors(bookID: bookID)
    }

    public func removeAll() async {
        try? await FilesystemActor.shared.removeAllCoverImages()
        ensureColorsLoaded()
        colors = [:]
        CoverColorDerivation.clearMirror()
        colorSaveTask?.cancel()
        colorSaveTask = nil
        try? FileManager.default.removeItem(at: colorStoreURL)
    }

    private struct CrawlItem {
        let bookID: BookID
        let audio: Bool
        let version: String?

        var key: String {
            "\(bookID.sourceID)|\(bookID.uuid)|\(audio)|\(version ?? "")"
        }
    }

    private var priorityFullQueue: [CrawlItem] = []
    private var sizedQueue: [CrawlItem] = []
    private var sizedQueuedKeys: Set<String> = []
    private var sizedAttempted: Set<String> = []
    private var crawlQueue: [CrawlItem] = []
    private var crawlQueuedKeys: Set<String> = []
    private var crawlAttempted: Set<String> = []
    private var crawlDraining = false

    public nonisolated func noteLibrary(books: [BookMetadata]) {
        Task(priority: .utility) { await self.enqueue(books) }
    }

    private func enqueue(_ books: [BookMetadata]) {
        ensureColorsLoaded()
        for book in books {
            var variants: [Bool] = []
            if book.hasAvailableEbook || !book.hasAvailableAudiobook {
                variants.append(false)
            }
            if book.hasAvailableAudiobook {
                variants.append(true)
            }
            for audio in variants {
                let item = CrawlItem(bookID: book.id, audio: audio, version: book.updatedAt)
                if !sizedAttempted.contains(item.key), !sizedQueuedKeys.contains(item.key) {
                    sizedQueuedKeys.insert(item.key)
                    sizedQueue.append(item)
                }
                guard !crawlAttempted.contains(item.key), !crawlQueuedKeys.contains(item.key)
                else { continue }
                crawlQueuedKeys.insert(item.key)
                crawlQueue.append(item)
            }
        }
        guard !crawlDraining, !sizedQueue.isEmpty || !crawlQueue.isEmpty else { return }
        crawlDraining = true
        Task(priority: .utility) { await self.drainCrawl() }
    }

    private func drainCrawl() async {
        while !priorityFullQueue.isEmpty || !sizedQueue.isEmpty || !crawlQueue.isEmpty {
            if !priorityFullQueue.isEmpty {
                let item = priorityFullQueue.removeFirst()
                crawlQueuedKeys.remove(item.key)
                await crawlFull(item)
                continue
            }

            if !sizedQueue.isEmpty {
                let item = sizedQueue.removeFirst()
                sizedQueuedKeys.remove(item.key)
                await crawlSized(item)
                continue
            }

            let item = crawlQueue.removeFirst()
            crawlQueuedKeys.remove(item.key)
            await crawlFull(item)
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        crawlDraining = false
    }

    private func crawlFull(_ item: CrawlItem) async {
        if let cached = await cachedFullCoverData(for: item.bookID, audio: item.audio) {
            crawlAttempted.insert(item.key)
            await deriveIfNeeded(item, data: cached)
            return
        }

        if await BookServiceActor.shared.sourceKind(for: item.bookID.sourceID) != .localFolder {
            guard
                await BookServiceActor.shared.connectionStatus(
                    sourceID: item.bookID.sourceID
                ) == .connected
            else { return }
        }

        let cover = await fetchFull(for: item.bookID, audio: item.audio, version: item.version)
        crawlAttempted.insert(item.key)
        if let cover {
            await deriveIfNeeded(item, data: cover.data)
        }
    }

    private func crawlSized(_ item: CrawlItem) async {
        if await cachedSizedCoverData(for: item.bookID, audio: item.audio) != nil {
            sizedAttempted.insert(item.key)
            return
        }
        if await cachedFullCoverData(for: item.bookID, audio: item.audio) != nil {
            sizedAttempted.insert(item.key)
            return
        }

        guard await BookServiceActor.shared.sourceKind(for: item.bookID.sourceID) != .localFolder
        else {
            sizedAttempted.insert(item.key)
            return
        }
        guard
            await BookServiceActor.shared.connectionStatus(
                sourceID: item.bookID.sourceID
            ) == .connected
        else { return }

        if let cover = await BookServiceActor.shared.fetchCoverImage(
            for: item.bookID,
            audio: item.audio,
            width: 209,
            height: item.audio ? 209 : 320,
            version: item.version,
        ) {
            await persistSizedCover(bookID: item.bookID, audio: item.audio, data: cover.data)
        }
        sizedAttempted.insert(item.key)
    }

    private func deriveIfNeeded(_ item: CrawlItem, data: Data) async {
        await deriveFromDataIfNeeded(bookID: item.bookID, audio: item.audio, data: data)
    }

    private func deriveFromDataIfNeeded(bookID: BookID, audio: Bool, data: Data) async {
        guard let derive = Self.deriveColorsFromData else { return }
        ensureColorsLoaded()
        let key = CoverColorDerivation.key(bookID: bookID, audio: audio)
        guard colors[key] == nil else { return }
        await derive(bookID, audio, data)
    }

    public func prioritizeFullCover(
        for bookID: BookID,
        audio: Bool,
        version: String? = nil,
    ) {
        ensureColorsLoaded()
        let item = CrawlItem(bookID: bookID, audio: audio, version: version)
        crawlQueue.removeAll { $0.key == item.key }
        priorityFullQueue.removeAll { $0.key == item.key }
        crawlQueuedKeys.insert(item.key)
        crawlAttempted.remove(item.key)
        priorityFullQueue.insert(item, at: 0)
        guard !crawlDraining else { return }
        crawlDraining = true
        Task(priority: .utility) { await self.drainCrawl() }
    }

    public func hasFullCover(for bookID: BookID, audio: Bool) async -> Bool {
        await cachedFullCoverData(for: bookID, audio: audio) != nil
    }

    public func cachedColors(bookID: BookID, audio: Bool) -> [OkmainColor]? {
        ensureColorsLoaded()
        return colors[CoverColorDerivation.key(bookID: bookID, audio: audio)]
    }

    private var deriveTail: Task<[OkmainColor]?, Never>?

    @discardableResult
    public func deriveColors(
        bookID: BookID,
        audio: Bool,
        width: Int,
        height: Int,
        rgb: [UInt8],
    ) async -> [OkmainColor]? {
        ensureColorsLoaded()
        let key = CoverColorDerivation.key(bookID: bookID, audio: audio)
        if let existing = colors[key] { return existing }

        let previous = deriveTail
        let compute = Task.detached(priority: .utility) { () -> [OkmainColor]? in
            _ = await previous?.value
            return Okmain.colors(width: width, height: height, rgb: rgb)
        }
        deriveTail = compute
        let derived = await compute.value
        if deriveTail == compute { deriveTail = nil }

        if let existing = colors[key] { return existing }
        guard let derived, !derived.isEmpty else { return nil }

        colors[key] = derived
        CoverColorDerivation.setCachedColors(derived, forKey: key)
        scheduleColorSave()
        return derived
    }

    private func removeColors(bookID: BookID) {
        removeColors(keys: CoverColorDerivation.keys(bookID: bookID))
    }

    private func removeColors(bookID: BookID, audio: Bool) {
        removeColors(keys: [CoverColorDerivation.key(bookID: bookID, audio: audio)])
    }

    private func removeColors(keys: [String]) {
        ensureColorsLoaded()
        for key in keys {
            colors.removeValue(forKey: key)
        }
        CoverColorDerivation.removeMirror(keys: keys)
        scheduleColorSave()
    }

    public func flushPendingColorSave() {
        colorSaveTask?.cancel()
        colorSaveTask = nil
        saveColors()
    }

    private func ensureColorsLoaded() {
        guard !colorsLoaded else { return }
        colorsLoaded = true
        removeStaleColorStores()
        guard
            let data = try? Data(contentsOf: colorStoreURL),
            let stored = try? JSONDecoder().decode([String: [UInt8]].self, from: data)
        else { return }

        for (key, channels) in stored where channels.count.isMultiple(of: 3) {
            var entry = [OkmainColor]()
            entry.reserveCapacity(channels.count / 3)
            for offset in stride(from: 0, to: channels.count, by: 3) {
                entry.append(
                    OkmainColor(
                        red: channels[offset],
                        green: channels[offset + 1],
                        blue: channels[offset + 2],
                    )
                )
            }
            colors[key] = entry
        }
        CoverColorDerivation.mergeMirror(with: colors)
    }

    private func removeStaleColorStores() {
        let directory = colorStoreURL.deletingLastPathComponent()
        let current = colorStoreURL.lastPathComponent
        let stale = (try? FileManager.default.contentsOfDirectory(atPath: directory.path))?
            .filter { $0.hasPrefix("derived_v") && $0 != current }
        for name in stale ?? [] {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    private func scheduleColorSave() {
        guard colorSaveTask == nil else { return }
        colorSaveTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await self.completeScheduledColorSave()
        }
    }

    private func completeScheduledColorSave() {
        colorSaveTask = nil
        saveColors()
    }

    private func saveColors() {
        if colors.count > Self.maxPersistedColorEntries {
            for key in colors.keys.prefix(colors.count - Self.maxPersistedColorEntries) {
                colors.removeValue(forKey: key)
            }
        }

        var stored = [String: [UInt8]]()
        stored.reserveCapacity(colors.count)
        for (key, entry) in colors {
            stored[key] = entry.flatMap { [$0.red, $0.green, $0.blue] }
        }

        guard let data = try? JSONEncoder().encode(stored) else { return }
        try? FileManager.default.createDirectory(
            at: colorStoreURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
        )
        try? data.write(to: colorStoreURL, options: .atomic)
    }
}
