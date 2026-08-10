#if os(iOS)
import SwiftUI

struct ReadaloudHighlightCard: View {
    @Bindable var settingsVM: SettingsViewModel
    let hasAudioNarration: Bool
    @Environment(\.colorScheme) private var colorScheme

    @State private var showThemeEditor = false

    var body: some View {
        CustomizeCardContainer(title: "Readaloud", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                CustomizePreviewLabel()

                ReadaloudPreviewPane(settingsVM: settingsVM)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                List {
                    styleSection
                    focusSection
                    if settingsVM.experimentalSettings {
                        visibilitySection
                    }
                    playbackSection
                }
            }
        }
        .onAppear {
            guard !settingsVM.experimentalSettings,
                settingsVM.readaloudHighlightVisibility != "paused"
            else { return }
            settingsVM.readaloudHighlightVisibility = "paused"
            settingsVM.save()
        }
        .fullScreenCover(isPresented: $showThemeEditor) {
            ThemeEditorView(
                settingsVM: settingsVM,
                theme: activeTheme,
                initialTab: .readaloud,
            )
        }
    }

    private var activeTheme: ReaderTheme {
        settingsVM.resolveTheme(id: settingsVM.activeThemeId(for: colorScheme))
            ?? (colorScheme == .dark ? .builtInDark : .builtInLight)
    }

    private func resetToDefaults() {
        settingsVM.readaloudDimOthers = kDefaultReadaloudDimOthers
        settingsVM.readaloudDimAmount = kDefaultReadaloudDimAmount
        settingsVM.readaloudHighlightVisibility = kDefaultReadaloudHighlightVisibility
        settingsVM.doubleTapPlay = kDefaultDoubleTapPlay
        settingsVM.freeBrowseMode = kDefaultFreeBrowseMode
        settingsVM.defaultPlaybackSpeed = kDefaultPlaybackSpeed
        settingsVM.save()
    }

    private func setting<T>(
        get: @escaping () -> T,
        set: @escaping (T) -> Void,
    ) -> Binding<T> {
        Binding(
            get: get,
            set: { newValue in
                set(newValue)
                settingsVM.save()
            },
        )
    }

    private func segmentedRow<T: Hashable>(
        caption: String,
        selection: Binding<T>,
        options: [(String, T)],
        description: (T) -> String,
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(caption)
                .font(.caption)
                .foregroundStyle(.secondary)
            Picker(caption, selection: selection) {
                ForEach(options, id: \.1) { label, value in
                    Text(label).tag(value)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            Text(description(selection.wrappedValue))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var styleSection: some View {
        Section {
            Button {
                showThemeEditor = true
            } label: {
                HStack {
                    Label("Edit Readaloud Style...", systemImage: "highlighter")
                        .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
        } header: {
            Text("Style")
        } footer: {
            Text(
                "Highlight color, style, and thickness belong to the theme. "
                    + "This opens \"\(activeTheme.name)\" with the readaloud section."
            )
        }
    }

    private var focusSection: some View {
        Section {
            Toggle(
                isOn: setting(
                    get: { settingsVM.readaloudDimOthers },
                    set: { settingsVM.readaloudDimOthers = $0 },
                )
            ) {
                Label("Auto-dim on Play", systemImage: "circle.lefthalf.filled")
            }

            if settingsVM.readaloudDimOthers {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Dim Amount: \(Int(settingsVM.readaloudDimAmount * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: setting(
                            get: { settingsVM.readaloudDimAmount },
                            set: { settingsVM.readaloudDimAmount = $0 },
                        ),
                        in: 0.1...0.9,
                        step: 0.05,
                    )
                }
            }

        } header: {
            Text("Focus")
        }
    }

    private var visibilityOptions: [(String, String)] {
        [("Paused", "paused"), ("Always", "always"), ("Playing", "playing")]
    }

    private var visibilitySection: some View {
        Section {
            segmentedRow(
                caption: "Show Highlight",
                selection: setting(
                    get: { settingsVM.readaloudHighlightVisibility },
                    set: { settingsVM.readaloudHighlightVisibility = $0 },
                ),
                options: visibilityOptions,
                description: { value in
                    switch value {
                        case "always":
                            return "Highlight stays on pause and re-marks after page turns."
                        case "playing":
                            return "Highlight clears whenever audio stops."
                        default:
                            return "Highlight stays on pause and clears when you turn the page."
                    }
                },
            )
        } header: {
            Text("Position Highlight")
        }
    }

    private var playbackSection: some View {
        Section {
            if hasAudioNarration {
                segmentedRow(
                    caption: "Play Audio on Double Tap",
                    selection: setting(
                        get: { settingsVM.doubleTapPlay },
                        set: { settingsVM.doubleTapPlay = $0 },
                    ),
                    options: [
                        ("Never", "never"), ("Headphones", "headphones"), ("Always", "always"),
                    ],
                    description: { value in
                        switch value {
                            case "always":
                                return "Double tap moves the playhead and starts audio."
                            case "never":
                                return "Double tap moves the playhead without starting audio."
                            default:
                                return "Double tap starts audio only with headphones connected."
                        }
                    },
                )

                segmentedRow(
                    caption: "Free Browse",
                    selection: setting(
                        get: { settingsVM.freeBrowseMode },
                        set: { settingsVM.freeBrowseMode = $0 },
                    ),
                    options: [
                        ("Never", "never"), ("Paused", "paused"),
                    ],
                    description: { value in
                        switch value {
                            case "paused":
                                return "While paused, page turns leave the playhead behind."
                            case "always":
                                return "Page turns never move the playhead; audio plays on. "
                                    + "Set by the Free Browse Lock complication."
                            default:
                                return "Page turns move the playhead with you."
                        }
                    },
                )
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(
                    "Readaloud Speed: \(String(format: "%.2fx", settingsVM.defaultPlaybackSpeed))"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Slider(
                    value: setting(
                        get: { settingsVM.defaultPlaybackSpeed },
                        set: { settingsVM.defaultPlaybackSpeed = $0 },
                    ),
                    in: 0.5...3.0,
                    step: 0.05,
                )
            }
        } header: {
            Text("Playback")
        }
    }
}

/// Animated sample paragraph rendering the current readaloud settings: the
/// theme's highlight style plus dim, text fade, and visibility behavior. The
/// play button walks the highlight through the sentences.
private struct ReadaloudPreviewPane: View {
    let settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme

    @State private var activeIndex = 1
    @State private var isPlaying = false

    private static let sentences: [String] = [
        "The Mole had been working very hard all the morning. ",
        "Spring was moving in the air above and in the earth below. ",
        "It was small wonder that he suddenly flung down his brush. ",
        "Something up above was calling him imperiously. ",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(Self.sentences.enumerated()), id: \.offset) { index, _ in
                sentenceText(at: index)
                    .font(.system(.subheadline, design: .serif))
                    .lineSpacing(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                    .onTapGesture(count: 2) { handleDoubleTap(index) }
            }
        }
        .padding(14)
        .padding(.bottom, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(pageBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1)
        )
        .overlay(alignment: .bottomLeading) {
            Text("Double tap a sentence to try it")
                .font(.caption2)
                .foregroundStyle(pageForeground.opacity(0.45))
                .padding(.horizontal, 14)
                .padding(.bottom, 6)
        }
        .overlay(alignment: .bottomTrailing) {
            Button {
                isPlaying.toggle()
            } label: {
                Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
                    .background(Circle().fill(pageBackground))
            }
            .buttonStyle(.plain)
            .padding(8)
        }
        .animation(.easeInOut(duration: 0.25), value: activeIndex)
        .animation(.easeInOut(duration: 0.25), value: isPlaying)
        .task(id: isPlaying) {
            guard isPlaying else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                guard !Task.isCancelled else { return }
                activeIndex = (activeIndex + 1) % Self.sentences.count
            }
        }
    }

    // Mirrors the reader's double-tap seek; the demo assumes headphones are
    // connected, so "headphones" behaves like "always" here.
    private func handleDoubleTap(_ index: Int) {
        activeIndex = index
        if !isPlaying && settingsVM.doubleTapPlay != "never" {
            isPlaying = true
        }
    }

    private var highlightVisible: Bool {
        isPlaying || settingsVM.readaloudHighlightVisibility != "playing"
    }

    @ViewBuilder
    private func sentenceText(at index: Int) -> some View {
        let decorated =
            index == activeIndex && highlightVisible
            && settingsVM.readaloudHighlightMode == "underline"
            && settingsVM.readaloudUnderlineStyle != "solid"
        if decorated {
            styledText(at: index)
                .customAttribute(ReadaloudUnderlineMark())
                .textRenderer(
                    UnderlineDecorationRenderer(
                        style: settingsVM.readaloudUnderlineStyle,
                        color: Color(hex: settingsVM.highlightColor ?? "") ?? .yellow,
                    )
                )
        } else {
            styledText(at: index)
        }
    }

    private func styledText(at index: Int) -> Text {
        var text = Text(attributedSentence(at: index))
        if index == activeIndex && highlightVisible
            && settingsVM.readaloudHighlightMode == "text"
        {
            if settingsVM.readaloudTextItalic { text = text.italic() }
            if settingsVM.readaloudTextBold { text = text.bold() }
        }
        return text
    }

    private func attributedSentence(at index: Int) -> AttributedString {
        let fg = pageForeground
        let highlight = Color(hex: settingsVM.highlightColor ?? "") ?? .yellow
        let dimming = isPlaying && settingsVM.readaloudDimOthers
        let dimmedOpacity = max(0.05, 1 - settingsVM.readaloudDimAmount)

        var span = AttributedString(Self.sentences[index])
        if index == activeIndex && highlightVisible {
            switch settingsVM.readaloudHighlightMode {
                case "text":
                    span.foregroundColor = highlight
                case "underline":
                    span.foregroundColor = fg
                    if settingsVM.readaloudUnderlineStyle == "solid" {
                        span.underlineStyle = Text.LineStyle(pattern: .solid, color: highlight)
                    }
                default:
                    span.foregroundColor = fg
                    span.backgroundColor =
                        highlight.opacity(1 - settingsVM.readaloudHighlightFade)
            }
        } else {
            span.foregroundColor = dimming ? fg.opacity(dimmedOpacity) : fg
        }
        return span
    }

    private var pageBackground: Color { settingsVM.pageBackground(for: colorScheme) }
    private var pageForeground: Color { settingsVM.pageForeground(for: colorScheme) }
}
#endif
