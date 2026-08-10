#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVReaderDisplayView: View {
    @Binding var fontFamily: String
    @Binding var subtitleFontSize: Double
    @Binding var tvReaderAppearance: StorytellerGlobalConfig.Reading.TVReaderAppearance
    @State private var customFontFamilies: [CustomFontFamily] = []

    var body: some View {
        NavigationStack {
            TVReaderDisplayMenu(
                fontFamily: $fontFamily,
                subtitleFontSize: $subtitleFontSize,
                tvReaderAppearance: tvReaderAppearance,
                customFontFamilies: customFontFamilies,
                resetToDefaults: resetToDefaults,
            )
            .navigationDestination(for: TVReaderDisplayDestination.self) { destination in
                switch destination {
                    case .font:
                        TVReaderStringOptionList(
                            title: "Font",
                            options: fontOptions,
                            selection: $fontFamily,
                            saveSelection: saveFontFamily,
                        )
                    case .size:
                        TVReaderDoubleOptionList(
                            title: "Size",
                            options: TVReaderDisplayOption.subtitleSizes,
                            selection: $subtitleFontSize,
                            saveSelection: saveSubtitleFontSize,
                        )
                    case .theme:
                        TVReaderStringOptionList(
                            title: "Background",
                            options: TVReaderDisplayOption.themes,
                            selection: tvAppearanceBinding(\.backgroundStyle),
                            saveSelection: saveAppearance,
                        )
                    case .activeSentence:
                        TVReaderStringOptionList(
                            title: "Active Sentence",
                            options: TVReaderDisplayOption.activeSentenceStyles,
                            selection: tvAppearanceBinding(\.activeSentenceStyle),
                            saveSelection: saveAppearance,
                        )
                    case .highlightColor:
                        TVReaderStringOptionList(
                            title: "Highlight Color",
                            options: TVReaderDisplayOption.highlightColors,
                            selection: tvAppearanceBinding(\.highlightColor),
                            saveSelection: saveAppearance,
                        )
                    case .inactiveText:
                        TVReaderStringOptionList(
                            title: "Inactive Text",
                            options: TVReaderDisplayOption.inactiveTextIntensities,
                            selection: tvAppearanceBinding(\.inactiveTextIntensity),
                            saveSelection: saveAppearance,
                        )
                    case .textWidth:
                        TVReaderStringOptionList(
                            title: "Text Width",
                            options: TVReaderDisplayOption.textWidths,
                            selection: tvAppearanceBinding(\.textWidth),
                            saveSelection: saveAppearance,
                        )
                    case .lineSpacing:
                        TVReaderStringOptionList(
                            title: "Line Spacing",
                            options: TVReaderDisplayOption.lineSpacings,
                            selection: tvAppearanceBinding(\.lineSpacing),
                            saveSelection: saveAppearance,
                        )
                    case .textAlignment:
                        TVReaderStringOptionList(
                            title: "Text Alignment",
                            options: TVReaderDisplayOption.textAlignments,
                            selection: tvAppearanceBinding(\.textAlignment),
                            saveSelection: saveAppearance,
                        )
                    case .scrollMode:
                        TVReaderStringOptionList(
                            title: "Scroll Mode",
                            options: TVReaderDisplayOption.scrollModes,
                            selection: tvAppearanceBinding(\.scrollMode),
                            saveSelection: saveAppearance,
                        )
                }
            }
            .navigationTitle("Reader Display")
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await loadCustomFonts()
            }
        }
    }
}

private enum TVReaderDisplayDestination: Hashable {
    case font
    case size
    case theme
    case activeSentence
    case highlightColor
    case inactiveText
    case textWidth
    case lineSpacing
    case textAlignment
    case scrollMode
}

private enum TVReaderDisplayOption {
    static let builtInFonts: [(label: String, value: String)] =
        CustomFontsActor.bundledFamilies.map { ($0, $0) }

    static let subtitleSizes: [(label: String, value: Double)] = [
        ("Small", 36.0),
        ("Medium", 48.0),
        ("Large", 64.0),
        ("Extra Large", 80.0),
    ]

    static let themes: [(label: String, value: String)] = [
        ("Blurred Cover", "cover"),
        ("Black", "highContrast"),
        ("White", "white"),
        ("Paper", "paper"),
        ("Warm Gray", "warmGray"),
        ("Sepia", "sepia"),
        ("Dim Blue", "dimBlue"),
    ]

    static let activeSentenceStyles: [(label: String, value: String)] = [
        ("White Text", "whiteText"),
        ("Highlight Background", "highlightBackground"),
        ("Underline", "underline"),
        ("Color Text", "colorText"),
    ]

    static let highlightColors: [(label: String, value: String)] = [
        ("Yellow", "yellow"),
        ("Amber", "amber"),
        ("Blue", "blue"),
        ("Green", "green"),
        ("Pink", "pink"),
        ("Gray", "gray"),
        ("White", "white"),
    ]

    static let inactiveTextIntensities: [(label: String, value: String)] = [
        ("Dim", "dim"),
        ("Medium", "medium"),
        ("Bright", "bright"),
    ]

    static let textWidths: [(label: String, value: String)] = [
        ("Narrow", "narrow"),
        ("Medium", "medium"),
        ("Wide", "wide"),
    ]

    static let lineSpacings: [(label: String, value: String)] = [
        ("Compact", "compact"),
        ("Medium", "medium"),
        ("Relaxed", "relaxed"),
    ]

    static let textAlignments: [(label: String, value: String)] = [
        ("Left", "leading"),
        ("Centered", "center"),
        ("Justified", "justified"),
    ]

    static let scrollModes: [(label: String, value: String)] = [
        ("By Paragraph", "paragraph"),
        ("By Sentence", "sentence"),
    ]
}

private struct TVReaderDisplayMenu: View {
    @Binding var fontFamily: String
    @Binding var subtitleFontSize: Double
    let tvReaderAppearance: StorytellerGlobalConfig.Reading.TVReaderAppearance
    let customFontFamilies: [CustomFontFamily]
    let resetToDefaults: () async -> Void

    var body: some View {
        TVReaderDisplayMenuShell {
            TVReaderDisplaySection(title: "Text") {
                NavigationLink(value: TVReaderDisplayDestination.font) {
                    TVReaderDisplayRowContent(
                        title: "Font",
                        value: fontLabel,
                        systemName: "textformat",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.size) {
                    TVReaderDisplayRowContent(
                        title: "Size",
                        value: sizeLabel,
                        systemName: "textformat.size",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))
            }

            TVReaderDisplaySection(title: "Appearance") {
                NavigationLink(value: TVReaderDisplayDestination.theme) {
                    TVReaderDisplayRowContent(
                        title: "Background",
                        value: backgroundLabel,
                        systemName: "paintpalette",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.activeSentence) {
                    TVReaderDisplayRowContent(
                        title: "Active Sentence",
                        value: activeSentenceLabel,
                        systemName: "text.badge.checkmark",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.inactiveText) {
                    TVReaderDisplayRowContent(
                        title: "Inactive Text",
                        value: inactiveTextLabel,
                        systemName: "textformat",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.highlightColor) {
                    TVReaderDisplayRowContent(
                        title: "Highlight Color",
                        value: highlightColorLabel,
                        systemName: "circle.fill",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))
            }

            TVReaderDisplaySection(title: "Layout") {
                NavigationLink(value: TVReaderDisplayDestination.textWidth) {
                    TVReaderDisplayRowContent(
                        title: "Text Width",
                        value: textWidthLabel,
                        systemName: "arrow.left.and.right",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.lineSpacing) {
                    TVReaderDisplayRowContent(
                        title: "Line Spacing",
                        value: lineSpacingLabel,
                        systemName: "arrow.up.and.down.text.horizontal",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.textAlignment) {
                    TVReaderDisplayRowContent(
                        title: "Text Alignment",
                        value: textAlignmentLabel,
                        systemName: "text.alignleft",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))

                NavigationLink(value: TVReaderDisplayDestination.scrollMode) {
                    TVReaderDisplayRowContent(
                        title: "Scroll Mode",
                        value: scrollModeLabel,
                        systemName: "arrow.up.arrow.down",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 106))
            }

            TVReaderDisplaySection(title: "Reset") {
                Button {
                    Task {
                        await resetToDefaults()
                    }
                } label: {
                    TVReaderDisplayActionRowContent(
                        title: "Reset to Defaults",
                        systemName: "arrow.counterclockwise",
                    )
                }
                .buttonStyle(TVReaderDisplayRowButtonStyle(height: 92))
            }
        }
    }

    private var fontLabel: String {
        if let builtIn = TVReaderDisplayOption.builtInFonts.first(where: { $0.value == fontFamily })
        {
            return builtIn.label
        }
        return customFontFamilies.first { $0.name == fontFamily }?.name ?? fontFamily
    }

    private var sizeLabel: String {
        TVReaderDisplayOption.subtitleSizes.first { abs($0.value - subtitleFontSize) < 0.01 }?
            .label ?? "\(Int(subtitleFontSize))"
    }

    private var backgroundLabel: String {
        TVReaderDisplayOption.themes.first { $0.value == tvReaderAppearance.backgroundStyle }?
            .label ?? "Blurred Cover"
    }

    private var activeSentenceLabel: String {
        TVReaderDisplayOption.activeSentenceStyles
            .first { $0.value == tvReaderAppearance.activeSentenceStyle }?.label ?? "White Text"
    }

    private var highlightColorLabel: String {
        TVReaderDisplayOption.highlightColors
            .first { $0.value == tvReaderAppearance.highlightColor }?.label ?? "Yellow"
    }

    private var inactiveTextLabel: String {
        TVReaderDisplayOption.inactiveTextIntensities
            .first { $0.value == tvReaderAppearance.inactiveTextIntensity }?.label ?? "Dim"
    }

    private var textWidthLabel: String {
        TVReaderDisplayOption.textWidths.first { $0.value == tvReaderAppearance.textWidth }?.label
            ?? "Medium"
    }

    private var lineSpacingLabel: String {
        TVReaderDisplayOption.lineSpacings.first { $0.value == tvReaderAppearance.lineSpacing }?
            .label ?? "Medium"
    }

    private var textAlignmentLabel: String {
        TVReaderDisplayOption.textAlignments
            .first { $0.value == tvReaderAppearance.textAlignment }?.label ?? "Left"
    }

    private var scrollModeLabel: String {
        TVReaderDisplayOption.scrollModes
            .first { $0.value == tvReaderAppearance.scrollMode }?.label ?? "By Paragraph"
    }
}

extension TVReaderDisplayView {
    private var fontOptions: [(label: String, value: String)] {
        TVReaderDisplayOption.builtInFonts
            + customFontFamilies.map { (label: $0.name, value: $0.name) }
    }

    private func loadCustomFonts() async {
        await CustomFontsActor.shared.refreshFonts()
        customFontFamilies = await CustomFontsActor.shared.availableFamilies
    }

    private func saveFontFamily(_ newValue: String) async {
        tvReaderAppearance.fontFamily = newValue
        do {
            try await SettingsActor.shared.updateConfig(tvReaderAppearance: tvReaderAppearance)
        } catch {
            debugLog("[TVReaderDisplayView] Failed to save font setting: \(error)")
        }
    }

    private func saveSubtitleFontSize(_ newValue: Double) async {
        do {
            try await SettingsActor.shared.updateConfig(tvSubtitleFontSize: newValue)
        } catch {
            debugLog("[TVReaderDisplayView] Failed to save subtitle font size: \(error)")
        }
    }

    private func tvAppearanceBinding(
        _ keyPath: WritableKeyPath<StorytellerGlobalConfig.Reading.TVReaderAppearance, String>
    ) -> Binding<String> {
        Binding(
            get: {
                tvReaderAppearance[keyPath: keyPath]
            },
            set: { newValue in
                tvReaderAppearance[keyPath: keyPath] = newValue
            },
        )
    }

    private func saveAppearance(_: String) async {
        do {
            try await SettingsActor.shared.updateConfig(tvReaderAppearance: tvReaderAppearance)
        } catch {
            debugLog("[TVReaderDisplayView] Failed to save tvOS appearance setting: \(error)")
        }
    }

    private func resetToDefaults() async {
        let defaultAppearance = StorytellerGlobalConfig.Reading.TVReaderAppearance()
        fontFamily = defaultAppearance.fontFamily
        subtitleFontSize = kDefaultTVSubtitleFontSize
        tvReaderAppearance = defaultAppearance

        do {
            try await SettingsActor.shared.updateConfig(
                tvSubtitleFontSize: kDefaultTVSubtitleFontSize,
                tvReaderAppearance: defaultAppearance,
            )
        } catch {
            debugLog("[TVReaderDisplayView] Failed to reset tvOS display settings: \(error)")
        }
    }
}

private struct TVReaderStringOptionList: View {
    let title: String
    let options: [(label: String, value: String)]
    @Binding var selection: String
    let saveSelection: (String) async -> Void
    @FocusState private var focusedValue: String?

    var body: some View {
        TVReaderDisplayMenuShell {
            TVReaderDisplaySection(title: title) {
                ForEach(options, id: \.value) { option in
                    Button {
                        selection = option.value
                        Task {
                            await saveSelection(option.value)
                        }
                    } label: {
                        TVReaderOptionRowContent(
                            title: option.label,
                            isSelected: option.value == selection,
                        )
                    }
                    .buttonStyle(TVReaderDisplayRowButtonStyle(height: 82))
                    .focused($focusedValue, equals: option.value)
                }
            }
        }
        .navigationTitle(title)
        .toolbar(.hidden, for: .navigationBar)
        .defaultFocus($focusedValue, selection)
    }
}

private struct TVReaderDoubleOptionList: View {
    let title: String
    let options: [(label: String, value: Double)]
    @Binding var selection: Double
    let saveSelection: (Double) async -> Void
    @FocusState private var focusedValue: Double?

    var body: some View {
        TVReaderDisplayMenuShell {
            TVReaderDisplaySection(title: title) {
                ForEach(options, id: \.value) { option in
                    Button {
                        selection = option.value
                        Task {
                            await saveSelection(option.value)
                        }
                    } label: {
                        TVReaderOptionRowContent(
                            title: option.label,
                            isSelected: abs(option.value - selection) < 0.01,
                        )
                    }
                    .buttonStyle(TVReaderDisplayRowButtonStyle(height: 82))
                    .focused($focusedValue, equals: option.value)
                }
            }
        }
        .navigationTitle(title)
        .toolbar(.hidden, for: .navigationBar)
        .defaultFocus($focusedValue, selection)
    }
}

private struct TVReaderDisplayMenuShell<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 36) {
                content
            }
            .frame(maxWidth: 1040, alignment: .leading)
            .padding(.horizontal, 64)
            .padding(.vertical, 56)
        }
    }
}

private struct TVReaderDisplaySection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.white.opacity(0.72))
                .padding(.horizontal, 8)

            VStack(spacing: 12) {
                content
            }
        }
    }
}

private struct TVReaderDisplayRowContent: View {
    let title: String
    let value: String
    let systemName: String

    var body: some View {
        HStack(spacing: 22) {
            Image(systemName: systemName)
                .font(.system(size: 32, weight: .regular))
                .frame(width: 54, height: 54)

            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.headline)

                Text(value)
                    .font(.subheadline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .opacity(0.72)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.right")
                .font(.headline)
                .opacity(0.7)
        }
    }
}

private struct TVReaderOptionRowContent: View {
    let title: String
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 18) {
            Text(title)
                .font(.headline)
                .lineLimit(2)
                .minimumScaleFactor(0.85)

            Spacer()

            if isSelected {
                Image(systemName: "checkmark")
                    .font(.headline)
            }
        }
    }
}

private struct TVReaderDisplayActionRowContent: View {
    let title: String
    let systemName: String

    var body: some View {
        HStack(spacing: 22) {
            Image(systemName: systemName)
                .font(.system(size: 32, weight: .regular))
                .frame(width: 54, height: 54)

            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct TVReaderDisplayRowButtonStyle: ButtonStyle {
    @Environment(\.isFocused) private var isFocused
    let height: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(isFocused ? .black : .white)
            .padding(.horizontal, 30)
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isFocused ? .white : .white.opacity(0.14))
            )
            .scaleEffect(isFocused ? 1.025 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isFocused)
    }
}
#endif
