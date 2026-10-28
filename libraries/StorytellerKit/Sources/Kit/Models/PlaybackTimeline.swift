import Foundation

/// Audio clips and chapter ranges measured in elapsed book time.
public struct PlaybackTimeline: Sendable {
    public struct Alignment: Sendable, Equatable {
        public let section: Int
        public let entry: Int
        public let href: String
        public let fragment: String
    }

    public struct Span: Sendable {
        public let source: String
        public let url: URL?
        public let sourceStart: Double
        public let sourceEnd: Double
        public let bookStart: Double
        public let alignment: Alignment?
        public var duration: Double { sourceEnd - sourceStart }
        public var bookEnd: Double { bookStart + duration }
    }

    public struct Chapter: Sendable {
        public let id: String
        public let title: String
        public let start: Double
        public let duration: Double
        public let section: Int?
    }

    public let spans: [Span]
    public let chapters: [Chapter]
    public var duration: Double { spans.last?.bookEnd ?? 0 }
    public var hasTextAlignment: Bool { spans.contains { $0.alignment != nil } }

    init(spans: [Span], chapters: [Chapter]) {
        self.spans = spans
        self.chapters = chapters
    }

    public init(sections: [SectionInfo]) {
        var spans: [Span] = []
        var chapters: [Chapter] = []
        var cursor = 0.0
        for (sectionIndex, section) in sections.enumerated() {
            let start = cursor
            for (entryIndex, entry) in section.mediaOverlay.enumerated() {
                guard entry.begin.isFinite, entry.end.isFinite, entry.end > entry.begin else {
                    continue
                }
                spans.append(
                    Span(
                        source: entry.audioFile,
                        url: nil,
                        sourceStart: entry.begin,
                        sourceEnd: entry.end,
                        bookStart: cursor,
                        alignment: Alignment(
                            section: sectionIndex,
                            entry: entryIndex,
                            href: entry.textHref,
                            fragment: entry.textId,
                        ),
                    )
                )
                cursor += entry.end - entry.begin
            }
            if cursor > start {
                chapters.append(
                    Chapter(
                        id: section.id,
                        title: section.label ?? "Chapter \(chapters.count + 1)",
                        start: start,
                        duration: cursor - start,
                        section: sectionIndex,
                    )
                )
            }
        }
        self.spans = spans
        self.chapters = chapters
    }

    public init(audiobook: AudiobookMetadata) {
        var cursor = 0.0
        var spans: [Span] = []
        for track in audiobook.tracks where track.duration.isFinite && track.duration > 0 {
            spans.append(
                Span(
                    source: track.href,
                    url: track.url,
                    sourceStart: 0,
                    sourceEnd: track.duration,
                    bookStart: cursor,
                    alignment: nil,
                )
            )
            cursor += track.duration
        }
        self.spans = spans
        self.chapters = audiobook.chapters.compactMap { chapter in
            guard chapter.startTime.isFinite, chapter.duration.isFinite,
                chapter.startTime >= 0, chapter.startTime < cursor
            else { return nil }
            return Chapter(
                id: chapter.id,
                title: chapter.title,
                start: chapter.startTime,
                duration: min(max(0, chapter.duration), cursor - chapter.startTime),
                section: nil,
            )
        }
    }

    public func landing(at time: Double) -> (index: Int, sourceTime: Double)? {
        guard time.isFinite, !spans.isEmpty else { return nil }
        let time = min(max(0, time), duration)
        let index = spans.firstIndex { $0.bookEnd > time } ?? spans.count - 1
        let span = spans[index]
        return (index, span.sourceStart + min(max(0, time - span.bookStart), span.duration))
    }

    public func chapterIndex(at time: Double) -> Int? {
        chapters.lastIndex { $0.start <= time }
    }
}
