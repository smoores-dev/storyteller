import Foundation

public struct FontFileTraits: Sendable {
    public var familyName: String?
    /// CSS-style weight (100-900).
    public var weight: Int
    public var isItalic: Bool

    public init(familyName: String?, weight: Int, isItalic: Bool) {
        self.familyName = familyName
        self.weight = weight
        self.isItalic = isItalic
    }
}

public protocol FontMetadataProbing: Sendable {
    /// Returns nil when the file cannot be parsed; callers fall back to
    /// filename-derived family, weight 400, upright.
    func traits(ofFontAt url: URL) -> FontFileTraits?
}
