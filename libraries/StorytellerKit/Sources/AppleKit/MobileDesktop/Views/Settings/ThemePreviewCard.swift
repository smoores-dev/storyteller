#if os(iOS) || os(macOS)
import SwiftUI

// Sample paragraph rendering the readaloud and user highlight spans in the
// theme's actual modes and colors, mirroring the Android editor's preview.
// Background-mode thickness is not simulated; the span shows at line height.
struct ThemePreviewCard: View {
    let theme: ReaderTheme
    let previewUserColor: String

    private static let lead = "A soft rain traced the window as "
    private static let readaloud = "the narrator read this sentence aloud"
    private static let mid = ". You can also "
    private static let user = "mark favorite passages"
    private static let tail = " with your own highlights."

    var body: some View {
        Text(attributedSample)
            .font(.system(.subheadline, design: .serif))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(hex: theme.backgroundColor) ?? .white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1)
            )
    }

    private var attributedSample: AttributedString {
        let foreground = Color(hex: theme.foregroundColor) ?? .black

        var lead = AttributedString(Self.lead)
        lead.foregroundColor = foreground

        var readaloudSpan = AttributedString(Self.readaloud)
        readaloudSpan.foregroundColor = foreground
        applyHighlight(
            mode: theme.readaloudHighlightMode,
            color: Color(hex: theme.highlightColor),
            to: &readaloudSpan,
        )

        var mid = AttributedString(Self.mid)
        mid.foregroundColor = foreground

        var userSpan = AttributedString(Self.user)
        userSpan.foregroundColor = foreground
        applyHighlight(
            mode: theme.userHighlightMode,
            color: Color(hex: previewUserColor),
            to: &userSpan,
        )

        var tail = AttributedString(Self.tail)
        tail.foregroundColor = foreground

        return lead + readaloudSpan + mid + userSpan + tail
    }

    private func applyHighlight(
        mode: String,
        color: Color?,
        to span: inout AttributedString,
    ) {
        guard let color else { return }
        switch mode {
            case "text":
                span.foregroundColor = color
            case "underline":
                span.underlineStyle = Text.LineStyle(pattern: .solid, color: color)
            default:
                span.backgroundColor = color
        }
    }
}

enum ThemeEditorTab: String, CaseIterable, Identifiable {
    case theme = "Theme"
    case readaloud = "Readaloud"
    case highlights = "Highlights"
    case advanced = "Advanced"

    var id: String { rawValue }
}

#endif
