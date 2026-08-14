#if os(iOS) || os(macOS)
import SwiftUI
import UniformTypeIdentifiers

struct EbookPlayerSettings: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme

    @State private var fontSizeInput: String = "20"
    @State private var customFamilies: [CustomFontFamily] = []
    @State private var showFontManager = false

    var body: some View {
        CustomizeCardContainer(title: "Text & Layout", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                CustomizePreviewLabel()

                TextSettingsPreviewPane(settingsVM: settingsVM)
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                List {
                    fontSection
                    alignmentAndSpacingSection
                    pageAnimationsSection
                }
            }
        }
        .onAppear {
            fontSizeInput = String(Int(settingsVM.fontSize))
            Task {
                await loadCustomFonts()
            }
        }
        .sheet(isPresented: $showFontManager) {
            FontManagerView(
                customFamilies: $customFamilies,
                selectedFont: $settingsVM.fontFamily,
                onSave: { settingsVM.save() },
            )
            #if os(macOS)
            .frame(width: 420, height: 480)
            #endif
        }
    }

    private var fontSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text("Font Size: \(Int(settingsVM.fontSize))pt")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Slider(value: $settingsVM.fontSize, in: 8...60, step: 1)
                        .onChange(of: settingsVM.fontSize) { _, newValue in
                            fontSizeInput = String(Int(newValue))
                            settingsVM.save()
                        }
                    TextField("Size", text: $fontSizeInput)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        .multilineTextAlignment(.trailing)
                        #if os(iOS)
                        .keyboardType(.numberPad)
                        #endif
                        .onSubmit {
                            if let val = Double(fontSizeInput), val >= 8, val <= 60 {
                                settingsVM.fontSize = val
                                settingsVM.save()
                            } else {
                                fontSizeInput = String(Int(settingsVM.fontSize))
                            }
                        }
                }
            }

            Picker(selection: $settingsVM.fontFamily) {
                ForEach(CustomFontsActor.bundledFamilies, id: \.self) { family in
                    Text(family).tag(family)
                }

                if !customFamilies.isEmpty {
                    Divider()
                    ForEach(customFamilies) { family in
                        Text(family.name).tag(family.name)
                    }
                }

                if isCustomFont(settingsVM.fontFamily)
                    && !customFamilies.contains(where: { $0.name == settingsVM.fontFamily })
                {
                    Text(settingsVM.fontFamily).tag(settingsVM.fontFamily)
                }
            } label: {
                Label("Font", systemImage: "textformat")
            }
            .pickerStyle(.menu)
            .onChange(of: settingsVM.fontFamily) { _, _ in
                settingsVM.save()
            }

            Button {
                showFontManager = true
            } label: {
                HStack {
                    Label("Manage Fonts...", systemImage: "plus.circle")
                        .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
        } header: {
            Text("Font")
        } footer: {
            Text("Fonts you import with Manage Fonts show up in the Font menu.")
        }
    }

    private var alignmentAndSpacingSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text("Text Alignment")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Text Alignment", selection: $settingsVM.textAlignment) {
                    Image(systemName: "text.alignleft").tag("left")
                    Image(systemName: "text.justify").tag("justify")
                    Image(systemName: "text.alignright").tag("right")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .onChange(of: settingsVM.textAlignment) { _, _ in
                    settingsVM.save()
                }
            }

            labeledSlider(
                label: "Margins (Left/Right)",
                value: $settingsVM.marginLeftRight,
                range: 0...30,
                step: 1,
                formatter: { "\(Int($0))%" },
            )

            labeledSlider(
                label: "Margin (Top)",
                value: $settingsVM.marginTop,
                range: 0...30,
                step: 1,
                formatter: { "\(Int($0))%" },
            )

            labeledSlider(
                label: "Margin (Bottom)",
                value: $settingsVM.marginBottom,
                range: 0...30,
                step: 1,
                formatter: { "\(Int($0))%" },
            )

            labeledSlider(
                label: "Paragraph Spacing",
                value: $settingsVM.paragraphSpacing,
                range: 0...2.0,
                step: 0.1,
                formatter: { $0 == 0 ? "Book Default" : String(format: "%.1fem", $0) },
                systemImage: "paragraphsign",
            )

            Toggle("First Line Indent", isOn: $settingsVM.firstLineIndent)
                .onChange(of: settingsVM.firstLineIndent) { _, _ in
                    settingsVM.save()
                }

            labeledSlider(
                label: "Line Spacing",
                value: $settingsVM.lineSpacing,
                range: 1.0...2.5,
                step: 0.1,
                formatter: { String(format: "%.1f", $0) },
                systemImage: "arrow.up.and.down.text.horizontal",
            )

            labeledSlider(
                label: "Word Spacing",
                value: $settingsVM.wordSpacing,
                range: -0.5...2.0,
                step: 0.1,
                formatter: { String(format: "%.1fem", $0) },
                systemImage: "arrow.left.and.right.text.vertical",
            )

            labeledSlider(
                label: "Letter Spacing",
                value: $settingsVM.letterSpacing,
                range: -0.1...0.5,
                step: 0.01,
                formatter: { String(format: "%.2fem", $0) },
                systemImage: "textformat.abc",
            )
        } header: {
            Text("Alignment and Spacing")
        } footer: {
            Text(
                "Margins are how far the text sits from the edges of the screen. "
                    + "Raise the bottom margin to keep text clear of a tall miniplayer. "
                    + "Word and letter spacing add extra room on top of what the font "
                    + "provides. Paragraph spacing above zero replaces the book's own "
                    + "paragraph gaps."
            )
        }
    }

    private var pageAnimationsSection: some View {
        Section {
            Toggle("Scrolling Mode", isOn: $settingsVM.scrollingMode)
                .onChange(of: settingsVM.scrollingMode) { _, _ in
                    settingsVM.save()
                }

            Toggle("Single Column", isOn: singleColumnBinding)
                .onChange(of: settingsVM.singleColumnMode) { _, _ in
                    settingsVM.save()
                }
                .disabled(settingsVM.scrollingMode)

            Toggle("Margin Tap to Turn Pages", isOn: $settingsVM.enableMarginClickNavigation)
                .onChange(of: settingsVM.enableMarginClickNavigation) { _, _ in
                    settingsVM.save()
                }
        } header: {
            Text("Page Animations")
        } footer: {
            Text(
                "Scrolling Mode reads the book as one continuous scroll instead of "
                    + "pages, always in a single column. Single Column keeps one column "
                    + "of text on screens wide enough for two. Margin Tap turns the page "
                    + "when you tap near the left or right edge of the screen."
            )
        }
    }

    private func loadCustomFonts() async {
        await CustomFontsActor.shared.refreshFonts()
        customFamilies = await CustomFontsActor.shared.availableFamilies
    }

    @ViewBuilder
    private func labeledSlider(
        label: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double,
        formatter: (Double) -> String,
        systemImage: String? = nil,
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text("\(label): \(formatter(value.wrappedValue))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: range, step: step)
                .onChange(of: value.wrappedValue) { _, _ in
                    settingsVM.save()
                }
        }
    }

    private func resetToDefaults() {
        settingsVM.fontSize = kDefaultFontSize
        settingsVM.fontFamily = kDefaultFontFamily
        settingsVM.lineSpacing = kDefaultLineSpacing
        #if os(iOS)
        settingsVM.marginLeftRight = kDefaultMarginLeftRightIOS
        #else
        settingsVM.marginLeftRight = kDefaultMarginLeftRightMac
        #endif
        settingsVM.marginTop = kDefaultMarginTop
        settingsVM.marginBottom = kDefaultMarginBottom
        settingsVM.wordSpacing = kDefaultWordSpacing
        settingsVM.letterSpacing = kDefaultLetterSpacing
        settingsVM.paragraphSpacing = kDefaultParagraphSpacing
        settingsVM.firstLineIndent = kDefaultFirstLineIndent
        settingsVM.textAlignment = kDefaultTextAlignment
        settingsVM.enableMarginClickNavigation = kDefaultEnableMarginClickNavigation
        settingsVM.scrollingMode = kDefaultScrollingMode
        settingsVM.singleColumnMode = kDefaultSingleColumnMode
        fontSizeInput = String(Int(kDefaultFontSize))
        settingsVM.save()
    }

    private func isCustomFont(_ fontFamily: String) -> Bool {
        !CustomFontsActor.bundledFamilies.contains(fontFamily)
    }

    private var singleColumnBinding: Binding<Bool> {
        Binding(
            get: { settingsVM.singleColumnMode || settingsVM.scrollingMode },
            set: { settingsVM.singleColumnMode = $0 },
        )
    }
}

/// Fixed-height sample page rendering the current text settings: font, size,
/// spacing, alignment, and margins, on the active theme's page colors. Sized in
/// screen points, so it slightly overstates the reader's CSS-pixel sizing but
/// tracks every change proportionally.
private struct TextSettingsPreviewPane: View {
    let settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme

    private static let sample =
        "The Mole had been working very hard all the morning, spring-cleaning "
        + "his little home. Spring was moving in the air above and in the earth "
        + "below, calling him imperiously; and small wonder that he suddenly "
        + "flung down his brush and said \"Bother!\""

    private static let sampleContinuation =
        "Something up above was calling him imperiously, and he made for the "
        + "steep little tunnel which answered in his case to the gravelled "
        + "carriage-drive owned by animals whose residences are nearer to the "
        + "sun and air."

    var body: some View {
        GeometryReader { geometry in
            VStack(
                alignment: settingsVM.textAlignment == "right" ? .trailing : .leading,
                spacing: paragraphGap,
            ) {
                Text(attributed(Self.sample))
                Text(attributed(Self.sampleContinuation))
            }
            .font(previewFont)
            .lineSpacing(extraLineSpacing)
            .multilineTextAlignment(settingsVM.textAlignment == "right" ? .trailing : .leading)
            .foregroundStyle(pageForeground)
            .frame(
                maxWidth: .infinity,
                alignment: settingsVM.textAlignment == "right" ? .trailing : .leading,
            )
            .padding(.horizontal, geometry.size.width * settingsVM.marginLeftRight / 100)
            .padding(.top, 10 + geometry.size.height * settingsVM.marginTop / 100)
        }
        .frame(height: 170)
        .background(pageBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1)
        )
    }

    private var previewFont: Font {
        let size = settingsVM.fontSize
        switch settingsVM.fontFamily {
            case "System Default", "serif":
                return .system(size: size, design: .serif)
            case "sans-serif":
                return .system(size: size)
            case "monospace":
                return .system(size: size, design: .monospaced)
            default:
                let family = settingsVM.fontFamily
                #if os(iOS)
                let familyExists =
                    UIFont(name: family, size: size) != nil
                    || !UIFont.fontNames(forFamilyName: family).isEmpty
                #else
                let familyExists =
                    NSFont(name: family, size: size) != nil
                    || NSFontManager.shared.availableMembers(ofFontFamily: family)?.isEmpty
                        == false
                #endif
                if familyExists {
                    return .custom(family, size: size)
                }
                return .system(size: size, design: .serif)
        }
    }

    // SwiftUI lineSpacing adds to the natural line height (~1.2em); the
    // reader's setting is a CSS line-height multiplier of the font size.
    private var extraLineSpacing: CGFloat {
        max(0, (settingsVM.lineSpacing - 1.2) * settingsVM.fontSize)
    }

    private var paragraphGap: CGFloat {
        (settingsVM.paragraphSpacing > 0 ? settingsVM.paragraphSpacing : 1.0)
            * settingsVM.fontSize
    }

    private func attributed(_ text: String) -> AttributedString {
        var sample = AttributedString(text)
        let letterKern = settingsVM.letterSpacing * settingsVM.fontSize
        let wordKern = settingsVM.wordSpacing * settingsVM.fontSize
        sample.kern = letterKern
        if wordKern != 0 {
            var index = sample.startIndex
            while index < sample.endIndex {
                let next = sample.index(afterCharacter: index)
                if sample.characters[index] == " " {
                    sample[index..<next].kern = letterKern + wordKern
                }
                index = next
            }
        }
        if settingsVM.firstLineIndent {
            // SwiftUI Text ignores NSParagraphStyle and CoreText drops
            // zero-width glyphs with their kern; the space is ~0.25em itself.
            var indent = AttributedString(" ")
            indent.kern = 1.15 * settingsVM.fontSize
            sample.insert(indent, at: sample.startIndex)
        }
        return sample
    }

    private var pageBackground: Color { settingsVM.pageBackground(for: colorScheme) }
    private var pageForeground: Color { settingsVM.pageForeground(for: colorScheme) }
}

private struct FontManagerView: View {
    @Binding var customFamilies: [CustomFontFamily]
    @Binding var selectedFont: String
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var showFontImporter = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        showFontImporter = true
                    } label: {
                        Label("Import Font", systemImage: "plus.circle")
                    }
                    .fileImporter(
                        isPresented: $showFontImporter,
                        allowedContentTypes: [
                            UTType(filenameExtension: "ttf") ?? .data,
                            UTType(filenameExtension: "otf") ?? .data,
                            UTType.font,
                        ],
                        allowsMultipleSelection: true,
                    ) { result in
                        Task {
                            switch result {
                                case .success(let urls):
                                    for url in urls {
                                        try? await CustomFontsActor.shared.importFont(from: url)
                                    }
                                    await refreshFonts()
                                case .failure:
                                    break
                            }
                        }
                    }
                }

                Section("Custom Fonts") {
                    if customFamilies.isEmpty {
                        Text("No custom fonts imported")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(customFamilies) { family in
                            DisclosureGroup {
                                ForEach(family.variants) { variant in
                                    HStack {
                                        Text(variant.styleDescription)
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                        Spacer()
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            deleteVariant(variant, from: family)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                    #if os(macOS)
                                    .contextMenu {
                                        Button(role: .destructive) {
                                            deleteVariant(variant, from: family)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                    #endif
                                }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(family.name)
                                        Text(
                                            "\(family.variants.count) variant\(family.variants.count == 1 ? "" : "s")"
                                        )
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if selectedFont == family.name {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.blue)
                                    }
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    deleteFamily(family)
                                } label: {
                                    Label("Delete All", systemImage: "trash")
                                }
                            }
                            #if os(macOS)
                            .contextMenu {
                                Button(role: .destructive) {
                                    deleteFamily(family)
                                } label: {
                                    Label("Delete All", systemImage: "trash")
                                }
                            }
                            #endif
                        }
                    }
                }
            }
            .navigationTitle("Manage Fonts")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await refreshFonts()
        }
    }

    private func refreshFonts() async {
        await CustomFontsActor.shared.refreshFonts()
        customFamilies = await CustomFontsActor.shared.availableFamilies
    }

    private func deleteFamily(_ family: CustomFontFamily) {
        Task {
            if selectedFont == family.name {
                selectedFont = kDefaultFontFamily
                onSave()
            }
            try? await CustomFontsActor.shared.deleteFamily(family)
            await MainActor.run {
                customFamilies.removeAll { $0.id == family.id }
            }
        }
    }

    private func deleteVariant(_ variant: CustomFontVariant, from family: CustomFontFamily) {
        Task {
            try? await CustomFontsActor.shared.deleteVariant(variant)
            await MainActor.run {
                if let familyIndex = customFamilies.firstIndex(where: { $0.id == family.id }) {
                    customFamilies[familyIndex].variants.removeAll { $0.id == variant.id }
                    if customFamilies[familyIndex].variants.isEmpty {
                        if selectedFont == family.name {
                            selectedFont = kDefaultFontFamily
                            onSave()
                        }
                        customFamilies.remove(at: familyIndex)
                    }
                }
            }
        }
    }
}

#endif
