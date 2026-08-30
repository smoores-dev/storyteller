import Foundation

/// Section info combining TOC data and SMIL metadata
public struct SectionInfo: Codable, Identifiable, Sendable {
    public let index: Int
    public let id: String
    public let label: String?
    public let level: Int?
    public let linear: String?
    public let mediaOverlay: [SMILEntry]

    public init(
        index: Int,
        id: String,
        label: String?,
        level: Int?,
        linear: String? = nil,
        mediaOverlay: [SMILEntry],
    ) {
        self.index = index
        self.id = id
        self.label = label
        self.level = level
        self.linear = linear
        self.mediaOverlay = mediaOverlay
    }
}

/// A section reduced to what a chapter list needs.
public struct SMILChapterSummary: Sendable, Equatable {
    public let id: String
    public let title: String
    public let duration: Double
    public let sectionIndex: Int

    public init(id: String, title: String, duration: Double, sectionIndex: Int) {
        self.id = id
        self.title = title
        self.duration = duration
        self.sectionIndex = sectionIndex
    }
}

public struct SMILChapterListing: Sendable, Equatable {
    public let chapters: [SMILChapterSummary]
    public let currentChapterID: String?

    public init(chapters: [SMILChapterSummary], currentChapterID: String?) {
        self.chapters = chapters
        self.currentChapterID = currentChapterID
    }
}

/// Book-time landing point for a skip of `delta` seconds; only the ends of
/// the book clamp. The epsilon keeps a forward skip inside the final entry
/// rather than past it, where nothing plays.
public func skipTarget(
    fromBookElapsed elapsed: Double,
    by delta: Double,
    bookTotal: Double,
) -> Double {
    guard bookTotal > 0 else { return 0 }
    return min(max(elapsed + delta, 0), max(0, bookTotal - 0.01))
}

/// Locates the entry playing at `targetTime` seconds into the book, along with
/// how far into that entry the time falls.
///
/// At an exact boundary the time belongs to the entry starting there, not the
/// one ending there: a scrub to the top of a chapter must not land on the last
/// syllable of the previous one. Times at or past the end clamp to the final
/// entry.
public func findEntry(
    atTotalTime targetTime: Double,
    in sections: [SectionInfo],
) -> (sectionIndex: Int, entryIndex: Int, offsetIntoEntry: Double)? {
    for (sectionIndex, section) in sections.enumerated() {
        for (entryIndex, entry) in section.mediaOverlay.enumerated() where
            entry.cumSumAtEnd > targetTime
        {
            let duration = max(0, entry.end - entry.begin)
            let entryStart = entry.cumSumAtEnd - duration
            return (sectionIndex, entryIndex, min(max(targetTime - entryStart, 0), duration))
        }
    }

    for (sectionIndex, section) in sections.enumerated().reversed() {
        guard let entryIndex = section.mediaOverlay.indices.last else { continue }
        let entry = section.mediaOverlay[entryIndex]
        return (sectionIndex, entryIndex, max(0, entry.end - entry.begin))
    }

    return nil
}

/// Find section index matching a locator href, handling legacy hrefs without OEBPS prefix
public func findSectionIndex(for locatorHref: String, in sections: [SectionInfo]) -> Int? {
    if let exactMatch = sections.firstIndex(where: { $0.id == locatorHref }) {
        return exactMatch
    }

    for (index, section) in sections.enumerated() {
        if section.id.hasSuffix("/\(locatorHref)") {
            return index
        }
        let sectionFilename = (section.id as NSString).lastPathComponent
        let locatorFilename = (locatorHref as NSString).lastPathComponent
        if sectionFilename == locatorFilename {
            let sectionDir = (section.id as NSString).deletingLastPathComponent
            let locatorDir = (locatorHref as NSString).deletingLastPathComponent
            if sectionDir.hasSuffix(locatorDir) || locatorDir.isEmpty {
                return index
            }
        }
    }

    return nil
}

public enum LocatorSeekPlan: Equatable, Sendable {
    case fragment(sectionIndex: Int, textId: String)
    case totalProgression(Double)
    case none
}

/// Falls back to totalProgression when the href or fragment does not match
/// this device's parse, e.g. locators written by other clients.
public func resolveLocatorSeek(locator: BookLocator, sections: [SectionInfo]) -> LocatorSeekPlan {
    if let fragment = locator.locations?.fragments?.first,
        let sectionIndex = findSectionIndex(for: locator.href, in: sections),
        sections[sectionIndex].mediaOverlay.contains(where: { $0.textId == fragment })
    {
        return .fragment(sectionIndex: sectionIndex, textId: fragment)
    }
    if let progression = locator.locations?.totalProgression, progression > 0, progression <= 1 {
        return .totalProgression(progression)
    }
    return .none
}

public struct TocEntry: Sendable {
    public let label: String
    public let href: String
    public let level: Int
    public let sectionIndex: Int

    public init(label: String, href: String, level: Int, sectionIndex: Int) {
        self.label = label
        self.href = href
        self.level = level
        self.sectionIndex = sectionIndex
    }
}

/// SMIL media overlay entry with cumulative timing
public struct SMILEntry: Codable, Sendable {
    public let textId: String
    public let textHref: String
    public let audioFile: String
    public let begin: Double
    public let end: Double
    public let cumSumAtEnd: Double

    public init(
        textId: String,
        textHref: String,
        audioFile: String,
        begin: Double,
        end: Double,
        cumSumAtEnd: Double,
    ) {
        self.textId = textId
        self.textHref = textHref
        self.audioFile = audioFile
        self.begin = begin
        self.end = end
        self.cumSumAtEnd = cumSumAtEnd
    }
}
