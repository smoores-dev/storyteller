import Foundation

/// Section info combining TOC data and SMIL metadata
public struct SectionInfo: Codable, Identifiable, Sendable {
    public let index: Int
    public let id: String
    public let label: String?
    public let level: Int?
    public let mediaOverlay: [SMILEntry]

    public init(
        index: Int,
        id: String,
        label: String?,
        level: Int?,
        mediaOverlay: [SMILEntry],
    ) {
        self.index = index
        self.id = id
        self.label = label
        self.level = level
        self.mediaOverlay = mediaOverlay
    }
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
