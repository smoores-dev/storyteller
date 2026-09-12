#if os(iOS) || os(macOS)
import SwiftUI

// Sample paragraph rendering the readaloud and user highlight spans in the
// theme's actual modes and colors.
// Background-mode thickness is not simulated; the span shows at line height.
struct ThemePreviewCard: View {
    let theme: ReaderTheme
    let previewUserColor: String

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.readerPalette) private var readerPalette

    private static let lead = "A soft rain traced the window as "
    private static let readaloud = "the narrator read this sentence aloud"
    private static let mid = ". You can also "
    private static let user = "mark favorite passages"
    private static let tail = " with your own highlights."

    var body: some View {
        sampleText
            .font(.system(.subheadline, design: .serif))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(resolved(theme.backgroundColor, role: .background) ?? .white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1)
            )
    }

    private func resolved(_ raw: String, role: CoverReaderChrome.Role) -> Color? {
        let strength =
            switch role {
                case .background: theme.coverStrengthBackground
                case .foreground: theme.coverStrengthForeground
                case .highlight: theme.coverStrengthHighlight
            }
        guard
            let hex = CoverReaderChrome.resolvedHex(
                raw,
                role: role,
                tone: readerPalette?.chromeHSB ?? CoverPaletteAdjustment.fallbackSurfaceHSB,
                dark: theme.appearance == .dark
                    || (theme.appearance == .any && colorScheme == .dark),
                strength: strength,
            )
        else { return nil }
        return Color(hex: hex)
    }

    private var needsDecoration: Bool {
        guard #available(iOS 18.0, *) else { return false }
        return theme.readaloudHighlightMode == "underline"
            && theme.readaloudUnderlineStyle != "solid"
    }

    @ViewBuilder
    private var sampleText: some View {
        if #available(iOS 18.0, *), needsDecoration {
            combinedText.textRenderer(
                UnderlineDecorationRenderer(
                    style: theme.readaloudUnderlineStyle,
                    color: resolved(theme.highlightColor, role: .highlight) ?? .yellow,
                )
            )
        } else {
            combinedText
        }
    }

    private var combinedText: Text {
        let foreground = resolved(theme.foregroundColor, role: .foreground) ?? .black

        var lead = AttributedString(Self.lead)
        lead.foregroundColor = foreground

        var readaloudSpan = AttributedString(Self.readaloud)
        readaloudSpan.foregroundColor = foreground
        applyHighlight(
            mode: theme.readaloudHighlightMode,
            color: resolved(theme.highlightColor, role: .highlight),
            fade: theme.readaloudHighlightFade,
            underlineAttribute: !needsDecoration,
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

        var readaloudText = Text(readaloudSpan)
        if #available(iOS 18.0, *), needsDecoration {
            readaloudText = readaloudText.customAttribute(ReadaloudUnderlineMark())
        }
        if theme.readaloudHighlightMode == "text" {
            if theme.readaloudTextItalic { readaloudText = readaloudText.italic() }
            if theme.readaloudTextBold { readaloudText = readaloudText.bold() }
        }

        return Text(lead) + readaloudText + Text(mid) + Text(userSpan) + Text(tail)
    }

    private func applyHighlight(
        mode: String,
        color: Color?,
        fade: Double = 0,
        underlineAttribute: Bool = true,
        to span: inout AttributedString,
    ) {
        guard let color else { return }
        switch mode {
            case "text":
                span.foregroundColor = color
            case "underline":
                if underlineAttribute {
                    span.underlineStyle = Text.LineStyle(pattern: .solid, color: color)
                }
            default:
                span.backgroundColor = color.opacity(1 - fade)
        }
    }
}

struct ReadaloudUnderlineMark: TextAttribute {}

struct UnderlineDecorationRenderer: TextRenderer {
    let style: String
    let color: Color

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            for run in line {
                context.draw(run)
                guard run[ReadaloudUnderlineMark.self] != nil else { continue }
                let rect = run.typographicBounds.rect
                let y = rect.maxY - 2
                var path = Path()
                if style == "double" {
                    path.move(to: CGPoint(x: rect.minX, y: y - 2.5))
                    path.addLine(to: CGPoint(x: rect.maxX, y: y - 2.5))
                    path.move(to: CGPoint(x: rect.minX, y: y))
                    path.addLine(to: CGPoint(x: rect.maxX, y: y))
                    context.stroke(path, with: .color(color), lineWidth: 1)
                } else {
                    var x = rect.minX
                    var up = true
                    path.move(to: CGPoint(x: x, y: y))
                    while x < rect.maxX {
                        x = min(x + 2.5, rect.maxX)
                        path.addLine(to: CGPoint(x: x, y: up ? y - 2 : y))
                        up.toggle()
                    }
                    context.stroke(path, with: .color(color), lineWidth: 1.2)
                }
            }
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
