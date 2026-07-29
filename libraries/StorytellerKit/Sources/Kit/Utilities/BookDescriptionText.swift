import Foundation

/// Book descriptions arrive as HTML, markdown, plain text, or a mix depending
/// on the metadata source, so display paths must flatten both syntaxes.
public enum BookDescriptionText {
    public static func plain(from raw: String) -> String {
        #if canImport(Darwin)
        return String(attributed(from: raw).characters)
        #else
        return paragraphPreservingText(from: raw)
        #endif
    }

    #if canImport(Darwin)
    public static func attributed(from raw: String) -> AttributedString {
        let text = paragraphPreservingText(from: raw)
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: text, options: options))
            ?? AttributedString(text)
    }
    #endif

    // Private-use character: SwiftSoup's text extraction collapses real
    // newlines, so block boundaries are marked with something it won't touch.
    private static let breakSentinel = "\u{E000}"

    private static func paragraphPreservingText(from raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.range(of: "<[a-zA-Z/!][^>]*>", options: .regularExpression) != nil else {
            return trimmed
        }
        let withSentinels =
            trimmed
            .replacingOccurrences(
                of: "(?i)<br[^>]*>",
                with: breakSentinel,
                options: .regularExpression,
            )
            .replacingOccurrences(
                of: "(?i)</(p|div|h[1-6]|li|blockquote|ul|ol|table|tr)>",
                with: breakSentinel + breakSentinel,
                options: .regularExpression,
            )
        return EPUBContentLoader.stripHTML(withSentinels)
            .replacingOccurrences(
                of: "\\s*\(breakSentinel)(?:\\s*\(breakSentinel))+\\s*",
                with: "\n\n",
                options: .regularExpression,
            )
            .replacingOccurrences(
                of: "\\s*\(breakSentinel)\\s*",
                with: "\n",
                options: .regularExpression,
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
