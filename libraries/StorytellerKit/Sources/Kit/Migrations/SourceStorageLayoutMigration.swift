import Foundation

#if canImport(AVFoundation)
import AVFoundation
#endif

extension FilesystemActor {
    private static let sourceStorageLayoutMigrationID = "source-storage-layout-v2"
    private static let legacyM4BAudiobookMigrationID = "legacy-m4b-audiobook-manifests-v1"
    private static let whisperModelStorageMigrationID = "whisper-model-storage-v1"

    func runStorageMigrations(for sources: [BookSourceRecord]) async throws {
        try runSourceStorageLayoutMigrationIfNeeded(for: sources)
        do {
            try await runLegacyM4BAudiobookMigrationIfNeeded(for: sources)
        } catch {
            debugLog("[StorytellerMigrations] Legacy M4B migration failed: \(error)")
        }
        do {
            try runWhisperModelStorageMigrationIfNeeded()
        } catch {
            debugLog("[StorytellerMigrations] Whisper model migration failed: \(error)")
        }
    }

    private func runLegacyM4BAudiobookMigrationIfNeeded(
        for sources: [BookSourceRecord]
    ) async throws {
        guard !migrationSentinelExists(Self.legacyM4BAudiobookMigrationID) else { return }

        var failed = false
        for source in sources {
            let directory: URL
            switch source.kind {
                case .storyteller:
                    directory = sourceCacheDirectory(sourceID: source.id)
                case .localFolder:
                    if let storagePath = source.storagePath, !storagePath.isEmpty {
                        directory = URL(fileURLWithPath: storagePath, isDirectory: true)
                    } else {
                        directory = internalFolderSourceDirectory()
                    }
            }

            do {
                try await migrateLegacyM4BAudiobooks(in: directory)
            } catch {
                failed = true
                debugLog(
                    "[FilesystemActor] Legacy M4B migration failed for source \(source.id): \(error)"
                )
            }
        }

        guard !failed else {
            return
        }

        try writeMigrationSentinel(Self.legacyM4BAudiobookMigrationID)
    }

    private func runSourceStorageLayoutMigrationIfNeeded(
        for sources: [BookSourceRecord]
    ) throws {
        guard !migrationSentinelExists(Self.sourceStorageLayoutMigrationID) else { return }

        let storytellerIDs = Set(
            sources
                .filter { $0.kind == .storyteller }
                .map(\.id)
        )
        if let sourceID = sources.first(where: { $0.kind == .storyteller })?.id {
            try migrateLegacyRoot(
                from: legacySourceCacheRootDirectory(),
                to: sourceCacheRootDirectory(),
                defaultDestination: sourceCacheDirectory(sourceID: sourceID),
                defaultSourceID: sourceID,
                configuredSourceIDs: storytellerIDs,
            )
        }

        let localFolderIDs = Set(
            sources
                .filter { $0.kind == .localFolder }
                .map(\.id)
        )
        if let sourceID = sources.first(where: { $0.kind == .localFolder })?.id {
            try migrateLegacyRoot(
                from: legacyLocalFolderRootDirectory(),
                to: internalFolderSourceRootDirectory(),
                defaultDestination: internalFolderSourceDirectory(),
                defaultSourceID: sourceID,
                configuredSourceIDs: localFolderIDs,
            )
        }

        try migrateCoverCacheDirectory()
        try writeMigrationSentinel(Self.sourceStorageLayoutMigrationID)
    }

    private func runWhisperModelStorageMigrationIfNeeded() throws {
        guard !migrationSentinelExists(Self.whisperModelStorageMigrationID) else { return }

        let appSupportDirectory = getConfigDirectory().deletingLastPathComponent()
        let legacyDirectory =
            appSupportDirectory
            .appendingPathComponent("StorytellerReader", isDirectory: true)
            .appendingPathComponent("WhisperModels", isDirectory: true)
        let targetDirectory = whisperModelsDirectory()
        let fm = FileManager.default

        if fm.fileExists(atPath: legacyDirectory.path) {
            if fm.fileExists(atPath: targetDirectory.path) {
                try moveDirectoryContents(from: legacyDirectory, to: targetDirectory)
                if (try? fm.contentsOfDirectory(atPath: legacyDirectory.path).isEmpty) == true {
                    try? fm.removeItem(at: legacyDirectory)
                }
            } else {
                try fm.moveItem(at: legacyDirectory, to: targetDirectory)
            }
        }

        let legacyParent = legacyDirectory.deletingLastPathComponent()
        if (try? fm.contentsOfDirectory(atPath: legacyParent.path).isEmpty) == true {
            try? fm.removeItem(at: legacyParent)
        }

        try writeMigrationSentinel(Self.whisperModelStorageMigrationID)
    }

    private func migrateCoverCacheDirectory() throws {
        let appSupportDirectory = getConfigDirectory().deletingLastPathComponent()
        let legacyDirectory =
            appSupportDirectory
            .appendingPathComponent("Covers", isDirectory: true)
        let cacheDirectory =
            appSupportDirectory
            .appendingPathComponent("CoversCache", isDirectory: true)
        let fm = FileManager.default

        guard fm.fileExists(atPath: legacyDirectory.path) else { return }
        if fm.fileExists(atPath: cacheDirectory.path) {
            try moveDirectoryContents(from: legacyDirectory, to: cacheDirectory)
            if (try? fm.contentsOfDirectory(atPath: legacyDirectory.path).isEmpty) == true {
                try? fm.removeItem(at: legacyDirectory)
            }
        } else {
            try fm.moveItem(at: legacyDirectory, to: cacheDirectory)
        }
    }

    func migrateLegacyRoot(
        from legacyRoot: URL,
        to modernRoot: URL,
        defaultDestination: URL,
        defaultSourceID: BookSourceID,
        configuredSourceIDs: Set<BookSourceID>,
    ) throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: legacyRoot.path) {
            try ensureDirectoryExists(at: modernRoot)
            let contents = try fm.contentsOfDirectory(
                at: legacyRoot,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [],
            )
            for item in contents {
                let target = modernRoot.appendingPathComponent(
                    item.lastPathComponent,
                    isDirectory: item.hasDirectoryPath,
                )
                if fm.fileExists(atPath: target.path) {
                    continue
                }
                try fm.moveItem(at: item, to: target)
            }
            if (try? fm.contentsOfDirectory(atPath: legacyRoot.path).isEmpty) == true {
                try? fm.removeItem(at: legacyRoot)
            }
        }

        try migrateLegacyTopLevelContents(
            root: modernRoot,
            destination: defaultDestination,
            sourceID: defaultSourceID,
            configuredSourceIDs: configuredSourceIDs,
        )
    }

    private func migrateLegacyTopLevelContents(
        root: URL,
        destination: URL,
        sourceID: BookSourceID,
        configuredSourceIDs: Set<BookSourceID>,
    ) throws {
        try ensureDirectoryExists(at: root)
        try ensureDirectoryExists(at: destination)

        let destinationMarker = destination.appendingPathComponent(
            BookSourceRecord.sourceIDFilename,
            isDirectory: false,
        )
        try sourceID.write(to: destinationMarker, atomically: true, encoding: .utf8)

        let fm = FileManager.default
        let contents = try fm.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [],
        )

        for item in contents {
            if item.lastPathComponent == BookSourceRecord.sourceIDFilename {
                try? fm.removeItem(at: item)
                continue
            }

            let isDirectory =
                (try? item.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            if item.standardizedFileURL == destination.standardizedFileURL {
                continue
            }
            if isDirectory, try isSourceDirectory(item, configuredSourceIDs: configuredSourceIDs) {
                if let markerID = try sourceIDMarker(in: item), markerID == sourceID {
                    try moveDirectoryContents(from: item, to: destination)
                    if (try? fm.contentsOfDirectory(atPath: item.path).isEmpty) == true {
                        try? fm.removeItem(at: item)
                    }
                }
                continue
            }

            let target = destination.appendingPathComponent(
                item.lastPathComponent,
                isDirectory: isDirectory,
            )

            if fm.fileExists(atPath: target.path) {
                if item.lastPathComponent == "library_metadata.json" {
                    try fm.removeItem(at: item)
                }
                continue
            }

            try fm.moveItem(at: item, to: target)
        }
    }

    private func moveDirectoryContents(from source: URL, to destination: URL) throws {
        let fm = FileManager.default
        try ensureDirectoryExists(at: destination)
        guard fm.fileExists(atPath: source.path) else { return }

        let contents = try fm.contentsOfDirectory(
            at: source,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [],
        )

        for item in contents {
            let target = destination.appendingPathComponent(
                item.lastPathComponent,
                isDirectory: item.hasDirectoryPath,
            )
            if fm.fileExists(atPath: target.path) {
                if item.lastPathComponent == "library_metadata.json"
                    || item.lastPathComponent == BookSourceRecord.sourceIDFilename
                {
                    try? fm.removeItem(at: item)
                }
                continue
            }
            try fm.moveItem(at: item, to: target)
        }
    }

    private func isSourceDirectory(
        _ directory: URL,
        configuredSourceIDs: Set<BookSourceID>,
    ) throws -> Bool {
        if configuredSourceIDs.contains(directory.lastPathComponent) {
            return true
        }

        let marker = directory.appendingPathComponent(
            BookSourceRecord.sourceIDFilename,
            isDirectory: false,
        )
        guard FileManager.default.fileExists(atPath: marker.path) else {
            return false
        }

        let markerID = try String(contentsOf: marker, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return !markerID.isEmpty
    }

    private func migrateLegacyM4BAudiobooks(in sourceDirectory: URL) async throws {
        let fm = FileManager.default
        guard fm.fileExists(atPath: sourceDirectory.path) else { return }

        let bookDirectories = try fm.contentsOfDirectory(
            at: sourceDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles],
        )

        for bookDirectory in bookDirectories {
            let values = try? bookDirectory.resourceValues(forKeys: [.isDirectoryKey])
            guard values?.isDirectory == true else { continue }

            let audioDirectory = bookDirectory.appendingPathComponent(
                LocalMediaCategory.audio.rawValue,
                isDirectory: true,
            )
            do {
                try await writeLegacyM4BManifestIfNeeded(in: audioDirectory)
            } catch {
                debugLog(
                    "[FilesystemActor] Legacy M4B migration failed for \(audioDirectory.path): \(error)"
                )
                throw error
            }
        }
    }

    private func writeLegacyM4BManifestIfNeeded(in audioDirectory: URL) async throws {
        let fm = FileManager.default
        let manifestURL = audioDirectory.appendingPathComponent(
            "manifest.json",
            isDirectory: false,
        )
        if fm.fileExists(atPath: manifestURL.path) {
            return
        }

        guard fm.fileExists(atPath: audioDirectory.path) else {
            return
        }

        let contents = try fm.contentsOfDirectory(
            at: audioDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles],
        )

        let m4bFiles = contents.filter { url in
            guard let values = try? url.resourceValues(forKeys: [.isDirectoryKey]),
                values.isDirectory != true
            else {
                return false
            }
            return url.pathExtension.lowercased() == "m4b"
        }

        guard m4bFiles.count == 1, let m4bURL = m4bFiles.first else {
            return
        }

        try await writeLegacyM4BManifest(for: m4bURL, manifestURL: manifestURL)
    }

    private func writeLegacyM4BManifest(for m4bURL: URL, manifestURL: URL) async throws {
        let duration = await audioDuration(for: m4bURL)
        let title =
            await audioTitle(for: m4bURL) ?? m4bURL.deletingPathExtension().lastPathComponent
        let mediaType = "audio/mp4"
        let href = m4bURL.lastPathComponent

        var readingOrderItem: [String: Any] = [
            "href": href,
            "type": mediaType,
        ]
        if let duration {
            readingOrderItem["duration"] = duration
        }
        let readingOrder = [readingOrderItem]

        let toc = await legacyM4BTOC(for: m4bURL)
        let manifest: [String: Any] = [
            "metadata": [
                "@type": "http://schema.org/Audiobook",
                "title": title,
            ],
            "links": [
                [
                    "rel": "self",
                    "href": "manifest.json",
                    "type": "application/audiobook+json",
                ]
            ],
            "readingOrder": readingOrder,
            "toc": toc.isEmpty
                ? [["href": "\(href)#t=0", "title": "Full Book"]]
                : toc,
        ]

        let data = try JSONSerialization.data(
            withJSONObject: manifest,
            options: [.prettyPrinted, .sortedKeys],
        )
        let tmpURL = manifestURL.appendingPathExtension("tmp")
        try data.write(to: tmpURL, options: .atomic)
        if FileManager.default.fileExists(atPath: manifestURL.path) {
            try FileManager.default.removeItem(at: manifestURL)
        }
        try FileManager.default.moveItem(at: tmpURL, to: manifestURL)
    }

    private func audioDuration(for url: URL) async -> Double? {
        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration) else { return nil }
        let seconds = CMTimeGetSeconds(duration)
        return seconds.isFinite && seconds > 0 ? seconds : nil
        #else
        return nil
        #endif
    }

    private func audioTitle(for url: URL) async -> String? {
        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: url)
        guard let metadata = try? await asset.load(.commonMetadata) else { return nil }
        for item in metadata where item.commonKey == .commonKeyTitle {
            if let value = try? await item.load(.stringValue), !value.isEmpty {
                return value
            }
        }
        return nil
        #else
        return nil
        #endif
    }

    private func legacyM4BTOC(for url: URL) async -> [[String: Any]] {
        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: url)
        guard
            let locales = try? await asset.load(.availableChapterLocales),
            let locale = locales.first,
            let groups = try? await asset.loadChapterMetadataGroups(
                withTitleLocale: locale,
                containingItemsWithCommonKeys: [.commonKeyTitle],
            ),
            !groups.isEmpty
        else {
            return []
        }

        var toc: [[String: Any]] = []
        for (index, group) in groups.enumerated() {
            let start = CMTimeGetSeconds(group.timeRange.start)
            guard start.isFinite else { continue }
            var title = "Chapter \(index + 1)"
            for item in group.items where item.commonKey == .commonKeyTitle {
                if let value = try? await item.load(.stringValue), !value.isEmpty {
                    title = value
                    break
                }
            }
            toc.append(["href": "\(url.lastPathComponent)#t=\(start)", "title": title])
        }
        return toc
        #else
        return []
        #endif
    }

    func migrationSentinelExists(_ migrationID: String) -> Bool {
        FileManager.default.fileExists(atPath: migrationSentinelURL(migrationID).path)
    }

    func writeMigrationSentinel(_ migrationID: String) throws {
        let sentinelDir = migrationSentinelDirectory()
        try ensureDirectoryExists(at: sentinelDir)
        let payload = "\(StorytellerDate.isoTimestamp(from: Date()))\n"
        try payload.write(
            to: migrationSentinelURL(migrationID),
            atomically: true,
            encoding: .utf8,
        )
    }

    private func migrationSentinelDirectory() -> URL {
        getConfigDirectory()
            .appendingPathComponent("MigrationSentinels", isDirectory: true)
    }

    private func migrationSentinelURL(_ migrationID: String) -> URL {
        migrationSentinelDirectory()
            .appendingPathComponent(migrationID, isDirectory: false)
    }
}
