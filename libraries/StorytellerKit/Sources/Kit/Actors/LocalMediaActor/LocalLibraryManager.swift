import Foundation
import SwiftSoup
import ZIPFoundation

#if canImport(AVFoundation)
import AVFoundation
#endif

public final class LocalLibraryManager: Sendable {

    public init() {}

    private struct ScannedLocalFile: Sendable {
        let metadata: BookMetadata
        let category: LocalMediaCategory
        let fileURL: URL
    }

    private struct AudiobookManifestMetadata: Decodable {
        let metadata: Metadata?

        struct Metadata: Decodable {
            let title: String?
        }
    }

    public func extractMetadata(
        from fileURL: URL,
        category: LocalMediaCategory,
        sourceID: BookSourceID,
    ) async throws -> BookMetadata {
        switch category {
            case .ebook, .synced:
                if fileURL.pathExtension.lowercased() == "cbz" {
                    return try extractComicMetadata(from: fileURL, sourceID: sourceID)
                }
                return try await extractEpubMetadata(from: fileURL, sourceID: sourceID)
            case .audio:
                return try await extractAudioMetadata(from: fileURL, sourceID: sourceID)
        }
    }

    public struct ScanResult: Sendable {
        public let metadata: [BookMetadata]
        public let paths: [String: MediaPaths]
    }

    public func scanLocalMedia(
        folderURL localDir: URL,
        sourceID: BookSourceID,
    ) async throws -> ScanResult {
        let fm = FileManager.default

        guard
            let bookFolders = try? fm.contentsOfDirectory(
                at: localDir,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles],
            )
        else {
            return ScanResult(metadata: [], paths: [:])
        }

        var allMetadata: [BookMetadata] = []
        var allPaths: [String: MediaPaths] = [:]
        var seenFiles: Set<String> = []
        var seenBookFoldersByUUID: [String: String] = [:]

        for bookFolder in bookFolders {
            guard let values = try? bookFolder.resourceValues(forKeys: [.isDirectoryKey]),
                values.isDirectory == true
            else {
                continue
            }

            let existingFolderUUID = uuidSuffix(fromFolderName: bookFolder.lastPathComponent)
            let bookUUID = existingFolderUUID ?? UUID().uuidString
            if let existingFolder = seenBookFoldersByUUID[bookUUID] {
                debugLog(
                    "[LocalLibraryManager] Duplicate local folder book UUID \(bookUUID): '\(existingFolder)' and '\(bookFolder.lastPathComponent)'"
                )
            } else {
                seenBookFoldersByUUID[bookUUID] = bookFolder.lastPathComponent
            }
            var scannedFiles: [ScannedLocalFile] = []

            for category in LocalMediaCategory.allCases {
                let categoryDir = bookFolder.appendingPathComponent(
                    category.rawValue,
                    isDirectory: true,
                )
                guard
                    let files = try? fm.contentsOfDirectory(
                        at: categoryDir,
                        includingPropertiesForKeys: [.isRegularFileKey],
                        options: [.skipsHiddenFiles],
                    )
                else {
                    continue
                }

                for fileURL in files {
                    guard shouldScan(fileURL, category: category) else { continue }

                    let fullPath = fileURL.path
                    if seenFiles.contains(fullPath) {
                        continue
                    }
                    seenFiles.insert(fullPath)

                    do {
                        let extracted = try await extractMetadata(
                            from: fileURL,
                            category: category,
                            sourceID: sourceID,
                        )
                        let metadata = metadata(extracted, withUUID: bookUUID)
                        scannedFiles.append(
                            ScannedLocalFile(
                                metadata: metadata,
                                category: category,
                                fileURL: fileURL,
                            )
                        )
                    } catch {
                        debugLog(
                            "[LocalLibraryManager] Failed to extract metadata from \(fileURL.lastPathComponent): \(error)"
                        )
                    }
                }
            }

            guard !scannedFiles.isEmpty else { continue }

            let effectiveBookFolder: URL
            if existingFolderUUID == nil {
                effectiveBookFolder =
                    normalizedBookFolder(
                        currentFolder: bookFolder,
                        rootFolder: localDir,
                        title: scannedFiles[0].metadata.title,
                        uuid: bookUUID,
                    ) ?? bookFolder
            } else {
                effectiveBookFolder = bookFolder
            }

            for scanned in scannedFiles {
                merge(scanned.metadata, into: &allMetadata)

                let finalFileURL =
                    effectiveBookFolder
                    .appendingPathComponent(scanned.category.rawValue, isDirectory: true)
                    .appendingPathComponent(scanned.fileURL.lastPathComponent, isDirectory: false)
                var mediaPaths = allPaths[scanned.metadata.uuid] ?? MediaPaths()

                if scanned.metadata.hasAvailableReadaloud {
                    mediaPaths.syncedPath = finalFileURL
                } else if scanned.metadata.hasAvailableAudiobook {
                    mediaPaths.audioPath = finalFileURL
                } else {
                    mediaPaths.ebookPath = finalFileURL
                }
                allPaths[scanned.metadata.uuid] = mediaPaths

                debugLogVerbose(
                    "[LocalLibraryManager] Discovered local file: \(finalFileURL.lastPathComponent) (readaloud: \(scanned.metadata.hasAvailableReadaloud))"
                )
            }
        }

        return ScanResult(metadata: allMetadata, paths: allPaths)
    }

    private func merge(_ metadata: BookMetadata, into metadataList: inout [BookMetadata]) {
        guard let index = metadataList.firstIndex(where: { $0.uuid == metadata.uuid }) else {
            metadataList.append(metadata)
            return
        }

        let existing = metadataList[index]
        let merged = BookMetadata(
            bookID: existing.id,
            title: existing.title,
            subtitle: existing.subtitle ?? metadata.subtitle,
            description: existing.description ?? metadata.description,
            language: existing.language ?? metadata.language,
            createdAt: existing.createdAt ?? metadata.createdAt,
            updatedAt: existing.updatedAt ?? metadata.updatedAt,
            publicationDate: existing.publicationDate ?? metadata.publicationDate,
            authors: existing.authors ?? metadata.authors,
            narrators: existing.narrators ?? metadata.narrators,
            creators: existing.creators ?? metadata.creators,
            series: existing.series ?? metadata.series,
            tags: existing.tags ?? metadata.tags,
            collections: existing.collections ?? metadata.collections,
            ebook: existing.ebook ?? metadata.ebook,
            audiobook: existing.audiobook ?? metadata.audiobook,
            readaloud: existing.readaloud ?? metadata.readaloud,
            status: existing.status ?? metadata.status,
            position: existing.position ?? metadata.position,
            rating: existing.rating ?? metadata.rating,
            pageCount: existing.pageCount ?? metadata.pageCount,
            duration: existing.duration ?? metadata.duration,
            alignedAt: existing.alignedAt ?? metadata.alignedAt,
            alignedByStorytellerVersion: existing.alignedByStorytellerVersion
                ?? metadata.alignedByStorytellerVersion,
            alignedWith: existing.alignedWith ?? metadata.alignedWith,
            source: existing.source ?? metadata.source,
        )
        metadataList[index] = merged
    }

    private func uuidSuffix(fromFolderName folderName: String) -> String? {
        guard let range = folderName.range(of: " - ", options: .backwards) else { return nil }
        let suffix = String(folderName[range.upperBound...])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return UUID(uuidString: suffix)?.uuidString
    }

    private func normalizedBookFolder(
        currentFolder: URL,
        rootFolder: URL,
        title: String,
        uuid: String,
    ) -> URL? {
        let destination = rootFolder.appendingPathComponent(
            folderName(title: title, uuid: uuid),
            isDirectory: true,
        )
        guard destination.standardizedFileURL.path != currentFolder.standardizedFileURL.path else {
            return currentFolder
        }

        let fm = FileManager.default
        guard !fm.fileExists(atPath: destination.path) else {
            debugLog(
                "[LocalLibraryManager] Cannot normalize \(currentFolder.lastPathComponent): destination exists"
            )
            return nil
        }

        do {
            try fm.moveItem(at: currentFolder, to: destination)
            debugLog(
                "[LocalLibraryManager] Normalized local folder \(currentFolder.lastPathComponent) -> \(destination.lastPathComponent)"
            )
            return destination
        } catch {
            debugLog(
                "[LocalLibraryManager] Failed to normalize local folder \(currentFolder.lastPathComponent): \(error)"
            )
            return nil
        }
    }

    private func folderName(title: String, uuid: String) -> String {
        let sanitizedTitle = sanitizedPathComponent(title)
        let sanitizedUUID = sanitizedPathComponent(uuid)
        guard !sanitizedTitle.isEmpty else { return sanitizedUUID.isEmpty ? "Book" : sanitizedUUID }
        guard !sanitizedUUID.isEmpty else { return sanitizedTitle }
        if sanitizedTitle.caseInsensitiveCompare(sanitizedUUID) == .orderedSame {
            return sanitizedTitle
        }
        return "\(sanitizedTitle) - \(sanitizedUUID)"
    }

    private func sanitizedPathComponent(_ input: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\?%*|\"<>:")
            .union(.newlines)
            .union(.controlCharacters)
        let sanitized =
            input
            .components(separatedBy: invalid)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return sanitized.isEmpty ? "Book" : sanitized
    }

    private func metadata(_ metadata: BookMetadata, withUUID uuid: String) -> BookMetadata {
        BookMetadata(
            bookID: BookID(sourceID: metadata.sourceID, uuid: uuid),
            title: metadata.title,
            subtitle: metadata.subtitle,
            description: metadata.description,
            language: metadata.language,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
            publicationDate: metadata.publicationDate,
            authors: metadata.authors,
            narrators: metadata.narrators,
            creators: metadata.creators,
            series: metadata.series,
            tags: metadata.tags,
            collections: metadata.collections,
            ebook: metadata.ebook.map { asset in
                BookAsset(
                    uuid: uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    isEpub2: asset.isEpub2,
                    isEpub3: asset.isEpub3,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            audiobook: metadata.audiobook.map { asset in
                BookAsset(
                    uuid: uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    isEpub2: asset.isEpub2,
                    isEpub3: asset.isEpub3,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            readaloud: metadata.readaloud.map { asset in
                BookReadaloud(
                    uuid: uuid,
                    filepath: asset.filepath,
                    missing: asset.missing,
                    status: asset.status,
                    currentStage: asset.currentStage,
                    stageProgress: asset.stageProgress,
                    queuePosition: asset.queuePosition,
                    restartPending: asset.restartPending,
                    createdAt: asset.createdAt,
                    updatedAt: asset.updatedAt,
                )
            },
            status: metadata.status,
            position: metadata.position,
            rating: metadata.rating,
            pageCount: metadata.pageCount,
            duration: metadata.duration,
            alignedAt: metadata.alignedAt,
            alignedByStorytellerVersion: metadata.alignedByStorytellerVersion,
            alignedWith: metadata.alignedWith,
            source: metadata.source,
        )
    }

    public func isReadaloudEpub(at epubURL: URL) -> Bool {
        let archive: Archive
        do {
            archive = try Archive(url: epubURL, accessMode: .read)
        } catch {
            return false
        }

        for entry in archive {
            if entry.path.lowercased().hasSuffix(".smil") {
                return true
            }
        }
        return false
    }

    private func extractEpubMetadata(
        from epubURL: URL,
        sourceID: BookSourceID,
    ) async throws -> BookMetadata {
        let archive: Archive
        do {
            archive = try Archive(url: epubURL, accessMode: .read)
        } catch {
            throw LocalLibraryError.failedToOpenArchive(epubURL.path)
        }

        let opfPath = try findOPFPath(in: archive)
        let opfData = try extractFile(archive: archive, path: opfPath)

        guard let opfString = String(data: opfData, encoding: .utf8) else {
            throw LocalLibraryError.invalidOPFEncoding
        }

        let parsed = parseOPF(opfString)
        let isReadaloud = isReadaloudEpub(at: epubURL)

        let bookUUID = UUID().uuidString
        let title = parsed.title ?? epubURL.deletingPathExtension().lastPathComponent

        let authors: [BookCreator]? =
            parsed.creators.isEmpty
            ? nil
            : parsed.creators.map { name in
                BookCreator(
                    uuid: nil,
                    id: nil,
                    name: name,
                    fileAs: nil,
                    role: "author",
                    createdAt: nil,
                    updatedAt: nil,
                )
            }

        let ebookAsset: BookAsset?
        let readaloudAsset: BookReadaloud?

        if isReadaloud {
            ebookAsset = nil
            readaloudAsset = BookReadaloud(
                uuid: bookUUID,
                filepath: epubURL.lastPathComponent,
                missing: 0,
                status: "aligned",
                currentStage: nil,
                stageProgress: nil,
                queuePosition: nil,
                restartPending: nil,
                createdAt: nil,
                updatedAt: nil,
            )
        } else {
            ebookAsset = BookAsset(
                uuid: bookUUID,
                filepath: epubURL.lastPathComponent,
                missing: 0,
                createdAt: nil,
                updatedAt: nil,
            )
            readaloudAsset = nil
        }

        return BookMetadata(
            bookID: BookID(sourceID: sourceID, uuid: bookUUID),
            title: title,
            subtitle: nil,
            description: parsed.description,
            language: parsed.language,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: parsed.date,
            authors: authors,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: ebookAsset,
            audiobook: nil,
            readaloud: readaloudAsset,
            status: nil,
            position: nil,
            rating: nil,
        )
    }

    // Matches the image formats foliate-js's comic-book renderer accepts.
    private static let comicImageExtensions: Set<String> = [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "jxl", "avif",
    ]

    private func comicImagePaths(in archive: Archive) -> [String] {
        var paths: [String] = []
        for entry in archive {
            let ext = (entry.path as NSString).pathExtension.lowercased()
            if Self.comicImageExtensions.contains(ext) {
                paths.append(entry.path)
            }
        }
        return paths.sorted()
    }

    private func extractComicMetadata(
        from comicURL: URL,
        sourceID: BookSourceID,
    ) throws -> BookMetadata {
        let archive: Archive
        do {
            archive = try Archive(url: comicURL, accessMode: .read)
        } catch {
            throw LocalLibraryError.failedToOpenArchive(comicURL.path)
        }

        let pageCount = comicImagePaths(in: archive).count
        let bookUUID = UUID().uuidString

        return BookMetadata(
            bookID: BookID(sourceID: sourceID, uuid: bookUUID),
            title: comicURL.deletingPathExtension().lastPathComponent,
            subtitle: nil,
            description: nil,
            language: nil,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: nil,
            authors: nil,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: BookAsset(
                uuid: bookUUID,
                filepath: comicURL.lastPathComponent,
                missing: 0,
                pageCount: pageCount > 0 ? pageCount : nil,
                createdAt: nil,
                updatedAt: nil,
            ),
            audiobook: nil,
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
        )
    }

    public func extractCoverFromComicArchive(at comicURL: URL) -> Data? {
        let archive: Archive
        do {
            archive = try Archive(url: comicURL, accessMode: .read)
        } catch {
            debugLog(
                "[LocalLibraryManager] extractCoverFromComicArchive: failed to open archive at \(comicURL.lastPathComponent): \(error)"
            )
            return nil
        }

        guard let firstPage = comicImagePaths(in: archive).first else {
            debugLog("[LocalLibraryManager] extractCoverFromComicArchive: no images in archive")
            return nil
        }
        return try? extractFile(archive: archive, path: firstPage)
    }

    private func extractAudioMetadata(
        from audioURL: URL,
        sourceID: BookSourceID,
    ) async throws -> BookMetadata {
        if audioURL.lastPathComponent == "manifest.json" {
            return try extractManifestAudioMetadata(from: audioURL, sourceID: sourceID)
        }

        let bookUUID = UUID().uuidString
        var title = audioURL.deletingPathExtension().lastPathComponent
        var authorName: String?

        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: audioURL)
        let metadata = try await asset.load(.commonMetadata)

        for item in metadata {
            guard let key = item.commonKey else { continue }

            switch key {
                case .commonKeyTitle:
                    if let value = try? await item.load(.stringValue) {
                        title = value
                    }
                case .commonKeyArtist, .commonKeyAuthor:
                    if let value = try? await item.load(.stringValue) {
                        authorName = value
                    }
                default:
                    break
            }
        }
        #endif

        let authors: [BookCreator]? = authorName.map { name in
            [
                BookCreator(
                    uuid: nil,
                    id: nil,
                    name: name,
                    fileAs: nil,
                    role: "author",
                    createdAt: nil,
                    updatedAt: nil,
                )
            ]
        }

        let audiobookAsset = BookAsset(
            uuid: bookUUID,
            filepath: audioURL.lastPathComponent,
            missing: 0,
            createdAt: nil,
            updatedAt: nil,
        )

        return BookMetadata(
            bookID: BookID(sourceID: sourceID, uuid: bookUUID),
            title: title,
            subtitle: nil,
            description: nil,
            language: nil,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: nil,
            authors: authors,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: nil,
            audiobook: audiobookAsset,
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
        )
    }

    private func shouldScan(_ fileURL: URL, category: LocalMediaCategory) -> Bool {
        switch category {
            case .ebook, .synced:
                return fileURL.pathExtension.lowercased() == "epub"
            case .audio:
                return fileURL.lastPathComponent == "manifest.json"
        }
    }

    private func extractManifestAudioMetadata(
        from manifestURL: URL,
        sourceID: BookSourceID,
    ) throws -> BookMetadata {
        let bookUUID = UUID().uuidString
        let data = try Data(contentsOf: manifestURL)
        let manifest = try JSONDecoder().decode(AudiobookManifestMetadata.self, from: data)
        let title =
            manifest.metadata?.title
            ?? manifestURL.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent

        let audiobookAsset = BookAsset(
            uuid: bookUUID,
            filepath: manifestURL.lastPathComponent,
            missing: 0,
            createdAt: nil,
            updatedAt: nil,
        )

        return BookMetadata(
            bookID: BookID(sourceID: sourceID, uuid: bookUUID),
            title: title,
            subtitle: nil,
            description: nil,
            language: nil,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: nil,
            authors: nil,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: nil,
            audiobook: audiobookAsset,
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
        )
    }

    private func findOPFPath(in archive: Archive) throws -> String {
        let containerPath = "META-INF/container.xml"
        let containerData = try extractFile(archive: archive, path: containerPath)

        guard let containerString = String(data: containerData, encoding: .utf8) else {
            throw LocalLibraryError.invalidContainerXML
        }

        guard
            let rootfileMatch = containerString.range(
                of: "full-path=\"[^\"]+\"",
                options: .regularExpression,
            ),
            let pathStart = containerString.range(of: "\"", range: rootfileMatch),
            let pathEnd = containerString.range(
                of: "\"",
                range: pathStart.upperBound..<rootfileMatch.upperBound,
            )
        else {
            throw LocalLibraryError.opfPathNotFound
        }

        return String(containerString[pathStart.upperBound..<pathEnd.lowerBound])
    }

    private func extractFile(archive: Archive, path: String) throws -> Data {
        guard let entry = archive[path] else {
            throw LocalLibraryError.fileNotFoundInArchive(path)
        }

        var data = Data()
        _ = try archive.extract(entry, skipCRC32: true) { chunk in
            data.append(chunk)
        }
        return data
    }

    private struct ParsedOPF {
        var title: String?
        var creators: [String] = []
        var description: String?
        var language: String?
        var date: String?
    }

    private func parseOPF(_ opfString: String) -> ParsedOPF {
        var result = ParsedOPF()

        result.title = extractDCElement(from: opfString, element: "title")
        result.description = extractDCElement(from: opfString, element: "description")
        result.language = extractDCElement(from: opfString, element: "language")
        result.date = extractDCElement(from: opfString, element: "date")

        result.creators = extractAllDCElements(from: opfString, element: "creator")

        return result
    }

    private func extractDCElement(from xml: String, element: String) -> String? {
        let patterns = [
            "<dc:\(element)[^>]*>([^<]+)</dc:\(element)>",
            "<dc:\(element)[^>]*><!\\[CDATA\\[([^\\]]+)\\]\\]></dc:\(element)>",
        ]

        for pattern in patterns {
            if let range = xml.range(of: pattern, options: .regularExpression) {
                let match = String(xml[range])
                if let contentStart = match.firstIndex(of: ">"),
                    let contentEnd = match.lastIndex(of: "<")
                {
                    var content = String(match[match.index(after: contentStart)..<contentEnd])
                    content = content.replacingOccurrences(of: "<![CDATA[", with: "")
                    content = content.replacingOccurrences(of: "]]>", with: "")
                    let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        return decodedXMLText(trimmed)
                    }
                }
            }
        }
        return nil
    }

    private func extractAllDCElements(from xml: String, element: String) -> [String] {
        var results: [String] = []
        let pattern = "<dc:\(element)[^>]*>([^<]+)</dc:\(element)>"

        var searchRange = xml.startIndex..<xml.endIndex
        while let range = xml.range(of: pattern, options: .regularExpression, range: searchRange) {
            let match = String(xml[range])
            if let contentStart = match.firstIndex(of: ">"),
                let contentEnd = match.lastIndex(of: "<")
            {
                let content = String(match[match.index(after: contentStart)..<contentEnd])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !content.isEmpty {
                    results.append(decodedXMLText(content))
                }
            }
            searchRange = range.upperBound..<xml.endIndex
        }

        return results
    }

    private func decodedXMLText(_ text: String) -> String {
        (try? Entities.unescape(text)) ?? text
    }

    public func extractCoverFromEpub(at epubURL: URL) -> Data? {
        let archive: Archive
        do {
            archive = try Archive(url: epubURL, accessMode: .read)
        } catch {
            debugLog(
                "[LocalLibraryManager] extractCoverFromEpub: failed to open archive at \(epubURL.lastPathComponent): \(error)"
            )
            return nil
        }

        guard let opfPath = try? findOPFPath(in: archive),
            let opfData = try? extractFile(archive: archive, path: opfPath),
            let opfString = String(data: opfData, encoding: .utf8)
        else {
            debugLog("[LocalLibraryManager] extractCoverFromEpub: failed to read OPF")
            return nil
        }

        let opfDir = (opfPath as NSString).deletingLastPathComponent

        if let coverHref = findCoverHref(in: opfString) {
            debugLog("[LocalLibraryManager] extractCoverFromEpub: found coverHref=\(coverHref)")
            let coverPath = opfDir.isEmpty ? coverHref : "\(opfDir)/\(coverHref)"
            if let data = try? extractFile(archive: archive, path: coverPath) {
                return data
            }
            if let data = try? extractFile(archive: archive, path: coverHref) {
                return data
            }
            debugLog("[LocalLibraryManager] extractCoverFromEpub: coverHref not extractable")
        } else {
            debugLog("[LocalLibraryManager] extractCoverFromEpub: no coverHref in OPF")
        }

        let commonCoverPaths = [
            "cover.jpg", "cover.jpeg", "cover.png",
            "images/cover.jpg", "images/cover.jpeg", "images/cover.png",
            "OEBPS/cover.jpg", "OEBPS/cover.jpeg", "OEBPS/cover.png",
            "OEBPS/images/cover.jpg", "OEBPS/images/cover.jpeg", "OEBPS/images/cover.png",
            "OPS/cover.jpg", "OPS/cover.jpeg", "OPS/cover.png",
            "OPS/images/cover.jpg", "OPS/images/cover.jpeg", "OPS/images/cover.png",
        ]

        for path in commonCoverPaths {
            if let data = try? extractFile(archive: archive, path: path) {
                debugLog("[LocalLibraryManager] extractCoverFromEpub: found at common path \(path)")
                return data
            }
        }

        debugLog("[LocalLibraryManager] extractCoverFromEpub: no cover found in any location")
        return nil
    }

    private func findCoverHref(in opfString: String) -> String? {
        var coverId: String?
        let metaPattern = "<meta[^>]*name=[\"']cover[\"'][^>]*content=[\"']([^\"']+)[\"']"
        let metaPatternAlt = "<meta[^>]*content=[\"']([^\"']+)[\"'][^>]*name=[\"']cover[\"']"

        for pattern in [metaPattern, metaPatternAlt] {
            if let range = opfString.range(of: pattern, options: .regularExpression) {
                let match = String(opfString[range])
                if let contentStart = match.range(of: "content=\"")?.upperBound
                    ?? match.range(of: "content='")?.upperBound,
                    let contentEnd = match[contentStart...].firstIndex(where: {
                        $0 == "\"" || $0 == "'"
                    })
                {
                    coverId = String(match[contentStart..<contentEnd])
                    break
                }
            }
        }

        if let coverId = coverId {
            let itemPattern = "<item[^>]*id=[\"']\(coverId)[\"'][^>]*href=[\"']([^\"']+)[\"']"
            let itemPatternAlt = "<item[^>]*href=[\"']([^\"']+)[\"'][^>]*id=[\"']\(coverId)[\"']"

            for pattern in [itemPattern, itemPatternAlt] {
                if let range = opfString.range(of: pattern, options: .regularExpression) {
                    let match = String(opfString[range])
                    if let hrefStart = match.range(of: "href=\"")?.upperBound
                        ?? match.range(of: "href='")?.upperBound,
                        let hrefEnd = match[hrefStart...].firstIndex(where: {
                            $0 == "\"" || $0 == "'"
                        })
                    {
                        return String(match[hrefStart..<hrefEnd])
                    }
                }
            }
        }

        let coverItemPattern =
            "<item[^>]*properties=[\"'][^\"']*cover-image[^\"']*[\"'][^>]*href=[\"']([^\"']+)[\"']"
        if let range = opfString.range(of: coverItemPattern, options: .regularExpression) {
            let match = String(opfString[range])
            if let hrefStart = match.range(of: "href=\"")?.upperBound
                ?? match.range(of: "href='")?.upperBound,
                let hrefEnd = match[hrefStart...].firstIndex(where: { $0 == "\"" || $0 == "'" })
            {
                return String(match[hrefStart..<hrefEnd])
            }
        }

        return nil
    }

    public func extractCoverFromAudiobook(at audioURL: URL) async -> Data? {
        #if canImport(AVFoundation)
        let asset = AVURLAsset(url: audioURL)
        guard let metadata = try? await asset.load(.commonMetadata) else {
            return nil
        }

        for item in metadata {
            guard item.commonKey == .commonKeyArtwork else { continue }
            if let data = try? await item.load(.dataValue) {
                return data
            }
        }
        #endif
        return nil
    }
}

public enum LocalLibraryError: Error, LocalizedError {
    case failedToOpenArchive(String)
    case invalidContainerXML
    case opfPathNotFound
    case fileNotFoundInArchive(String)
    case invalidOPFEncoding

    public var errorDescription: String? {
        switch self {
            case .failedToOpenArchive(let path):
                return "Failed to open archive: \(path)"
            case .invalidContainerXML:
                return "Invalid container.xml encoding"
            case .opfPathNotFound:
                return "OPF path not found in container.xml"
            case .fileNotFoundInArchive(let path):
                return "File not found in archive: \(path)"
            case .invalidOPFEncoding:
                return "Invalid OPF file encoding"
        }
    }
}
