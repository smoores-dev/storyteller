import Foundation

public enum BookImageKind: String, Codable, Sendable, CaseIterable {
    case map
    case photo
    case diagram
    case plate
    case figure

    static func inferred(from text: String) -> BookImageKind {
        let lowered = text.lowercased()
        if lowered.contains("map") || lowered.contains("plan of") {
            return .map
        }
        if lowered.contains("photo") || lowered.contains("portrait") {
            return .photo
        }
        if lowered.contains("diagram") || lowered.contains("chart")
            || lowered.contains("graph") || lowered.contains("schematic")
        {
            return .diagram
        }
        if lowered.contains("plate") {
            return .plate
        }
        return .figure
    }
}

public struct BookImageItem: Identifiable, Hashable, Codable, Sendable {
    public let sectionIndex: Int
    public let sectionId: String
    public let imagePath: String
    public let elementId: String?
    public let altText: String?
    public let caption: String?
    public let kind: BookImageKind
    public let pageLabel: String?

    public var id: String { "\(sectionIndex):\(imagePath)" }

    public var displayTitle: String {
        if let caption, !caption.isEmpty {
            return caption
        }
        if let altText, !altText.isEmpty {
            return altText
        }
        return ((imagePath as NSString).lastPathComponent as NSString).deletingPathExtension
    }

    public init(
        sectionIndex: Int,
        sectionId: String,
        imagePath: String,
        elementId: String?,
        altText: String?,
        caption: String?,
        kind: BookImageKind,
        pageLabel: String?,
    ) {
        self.sectionIndex = sectionIndex
        self.sectionId = sectionId
        self.imagePath = imagePath
        self.elementId = elementId
        self.altText = altText
        self.caption = caption
        self.kind = kind
        self.pageLabel = pageLabel
    }
}
