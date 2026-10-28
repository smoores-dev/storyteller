import Foundation

/// Loads tracks and chapters from an audiobook manifest.
public struct AudiobookLoader: Sendable {
    public init() {}

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

    public func load(from url: URL) async throws -> AudiobookMetadata {
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

}
