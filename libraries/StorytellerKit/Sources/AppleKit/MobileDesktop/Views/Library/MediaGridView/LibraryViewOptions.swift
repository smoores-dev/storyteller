#if os(iOS) || os(macOS)
import SwiftUI

func menuRowLabel(text: String, isSelected: Bool) -> some View {
    HStack {
        Text(text)
        Spacer()
        if isSelected {
            Image(systemName: "checkmark")
                .imageScale(.small)
        }
    }
}

/// The card-appearance options shared by the library grids and the home shelves.
/// `header` and `footer` carry the sections unique to one caller.
struct LibraryViewOptions<Header: View, Footer: View>: View {
    @Binding var coverPrefRaw: String
    @Binding var coverSizeValue: Double
    @Binding var gridSpacingRaw: String
    @Binding var showAudioIndicator: Bool
    @Binding var showSourceBadge: Bool
    @Binding var showSeriesPositionBadge: Bool
    @Binding var progressStyleRaw: String
    @Binding var showOnItemRaw: String
    var showsSizeOptions = true
    var showsShowOnItem = true
    var onReset: () -> Void = {}
    @ViewBuilder var header: () -> Header
    @ViewBuilder var footer: () -> Footer

    @State private var lastProgressStyle: ProgressIndicatorStyle = .circle

    private var coverPreference: CoverPreference {
        CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook
    }

    private var progressStyle: ProgressIndicatorStyle {
        ProgressIndicatorStyle(rawValue: progressStyleRaw) ?? .circle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header()
            coverStyleSection

            if showsSizeOptions {
                coverSizeSection
                spacingSection
                displaySection
            }

            if showsShowOnItem {
                showOnItemSection
            }

            footer()

            Divider()

            Button("Reset to Defaults") {
                coverPrefRaw = CoverPreference.storytellerDouble.rawValue
                coverSizeValue = CoverSizeRange.defaultValue
                gridSpacingRaw = GridSpacing.defaultValue.rawValue
                showAudioIndicator = true
                showSourceBadge = false
                showSeriesPositionBadge = false
                progressStyleRaw = ProgressIndicatorStyle.circle.rawValue
                showOnItemRaw = ShowOnItemField.auto.rawValue
                onReset()
            }
            .font(.subheadline)
        }
        .padding()
        #if os(macOS)
        .frame(width: 200)
        #else
        .frame(minWidth: 220)
        #endif
    }

    private func optionButton(
        isSelected: Bool,
        action: @escaping () -> Void,
        @ViewBuilder label: () -> some View,
    ) -> some View {
        Button(action: action) {
            label()
                .frame(width: 32, height: 28)
        }
        .buttonStyle(.bordered)
        .tint(isSelected ? .accentColor : .secondary)
    }

    private var coverStyleSection: some View {
        optionSection("Cover Style") {
            HStack(spacing: 8) {
                ForEach(CoverPreference.allCases) { preference in
                    optionButton(
                        isSelected: coverPreference == preference,
                        action: { coverPrefRaw = preference.rawValue },
                    ) {
                        if preference == .storytellerDouble {
                            Image("readalong")
                                .renderingMode(.template)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 18, height: 18)
                        } else {
                            Image(
                                systemName: preference == .preferEbook
                                    ? "book.fill" : "headphones"
                            )
                        }
                    }
                }
            }
        }
    }

    private var coverSizeSection: some View {
        optionSection("Cover Size") {
            HStack(spacing: 8) {
                Image(systemName: "square.grid.3x3")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Slider(
                    value: $coverSizeValue,
                    in: Double(CoverSizeRange.min)...Double(CoverSizeRange.max),
                    step: 5,
                )
                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var spacingSection: some View {
        optionSection("Spacing") {
            HStack(spacing: 8) {
                ForEach(GridSpacing.allCases) { spacing in
                    optionButton(
                        isSelected: gridSpacingRaw == spacing.rawValue,
                        action: { gridSpacingRaw = spacing.rawValue },
                    ) {
                        Image(systemName: spacing.iconName)
                    }
                    #if os(macOS)
                    .help(spacing.label)
                    #endif
                    .accessibilityLabel(spacing.label)
                }
            }
        }
    }

    private var displaySection: some View {
        optionSection("Display") {
            Toggle("Audio Indicator", isOn: $showAudioIndicator)
            Toggle("Source Badge", isOn: $showSourceBadge)
            Toggle("Series Position", isOn: $showSeriesPositionBadge)
            Toggle(
                "Progress",
                isOn: Binding(
                    get: { progressStyle != .none },
                    set: { show in
                        if show {
                            progressStyleRaw = lastProgressStyle.rawValue
                        } else {
                            lastProgressStyle = progressStyle
                            progressStyleRaw = ProgressIndicatorStyle.none.rawValue
                        }
                    },
                ),
            )

            if progressStyle != .none {
                HStack(spacing: 8) {
                    ForEach(ProgressIndicatorStyle.selectableStyles) { style in
                        optionButton(
                            isSelected: progressStyle == style,
                            action: { progressStyleRaw = style.rawValue },
                        ) {
                            Image(systemName: style.iconName)
                        }
                    }
                }
            }
        }
    }

    private var showOnItemSection: some View {
        let selection = ShowOnItemField.decodeSelection(showOnItemRaw)
        return optionSection("Show on Item") {
            Menu {
                Button {
                    showOnItemRaw = ShowOnItemField.encodeSelection([.auto])
                } label: {
                    menuRowLabel(
                        text: ShowOnItemField.auto.label,
                        isSelected: selection.contains(.auto),
                    )
                }
                Button {
                    showOnItemRaw = ShowOnItemField.encodeSelection([.none])
                } label: {
                    menuRowLabel(
                        text: ShowOnItemField.none.label,
                        isSelected: selection.contains(.none),
                    )
                }

                Divider()

                ForEach(ShowOnItemField.explicitFields, id: \.self) { field in
                    Button {
                        showOnItemRaw = ShowOnItemField.encodeSelection(
                            ShowOnItemField.toggling(field, in: selection)
                        )
                    } label: {
                        menuRowLabel(text: field.label, isSelected: selection.contains(field))
                    }
                }
            } label: {
                Text(ShowOnItemField.selectionSummary(selection))
                    .lineLimit(1)
            }
        }
    }

    private func optionSection(
        _ title: String,
        @ViewBuilder content: () -> some View,
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
            content()
        }
    }
}

extension LibraryViewOptions where Header == EmptyView, Footer == EmptyView {
    init(
        coverPrefRaw: Binding<String>,
        coverSizeValue: Binding<Double>,
        gridSpacingRaw: Binding<String>,
        showAudioIndicator: Binding<Bool>,
        showSourceBadge: Binding<Bool>,
        showSeriesPositionBadge: Binding<Bool>,
        progressStyleRaw: Binding<String>,
        showOnItemRaw: Binding<String>,
    ) {
        self.init(
            coverPrefRaw: coverPrefRaw,
            coverSizeValue: coverSizeValue,
            gridSpacingRaw: gridSpacingRaw,
            showAudioIndicator: showAudioIndicator,
            showSourceBadge: showSourceBadge,
            showSeriesPositionBadge: showSeriesPositionBadge,
            progressStyleRaw: progressStyleRaw,
            showOnItemRaw: showOnItemRaw,
            header: { EmptyView() },
            footer: { EmptyView() },
        )
    }
}

#endif
