#if os(iOS) || os(macOS)
import SwiftUI

struct ThemeEditorView: View {
    @Bindable var settingsVM: SettingsViewModel
    let theme: ReaderTheme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var draft: ReaderTheme
    @State private var originalFlatValues: FlatColorSnapshot?
    @State private var tab: ThemeEditorTab = .theme
    @State private var previewUserIndex = 0
    @State private var expandedPicker: String? = nil

    init(settingsVM: SettingsViewModel, theme: ReaderTheme) {
        self.settingsVM = settingsVM
        self.theme = theme
        self._draft = State(initialValue: theme)
    }

    private var isBuiltInEdit: Bool { theme.isBuiltIn }

    var body: some View {
        #if os(iOS)
        NavigationStack {
            editorContent
                .navigationTitle(isBuiltInEdit ? theme.name : "Edit Theme")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { cancelEditing() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { saveEditing() }
                    }
                }
        }
        .onAppear { captureOriginalValues() }
        #else
        VStack(spacing: 0) {
            editorContent
                .frame(minWidth: 600, minHeight: 500)
            Divider()
            HStack {
                Button("Cancel") { cancelEditing() }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Save") { saveEditing() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(12)
        }
        .onAppear { captureOriginalValues() }
        #endif
    }

    private var editorContent: some View {
        VStack(spacing: 12) {
            ThemePreviewCard(theme: draft, previewUserColor: previewUserColor)
                .padding(.horizontal)
                .padding(.top, 8)

            Picker("Section", selection: $tab) {
                ForEach(ThemeEditorTab.allCases) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch tab {
                        case .theme: themeTab
                        case .readaloud: readaloudSection
                        case .highlights: userHighlightsSection
                        case .advanced: customCSSSection
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
        }
        .onChange(of: draft) { _, newDraft in
            pushLivePreview(newDraft)
        }
    }

    @ViewBuilder
    private var themeTab: some View {
        if isBuiltInEdit {
            Text(
                "This built-in theme stays available in its appearance mode. "
                    + "Restore the stock look anytime with Reset to Stock in Manage Themes."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
            nameField
            appearanceField
        }

        readerColorsSection
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Theme Name")
                .font(.headline)
            TextField("Theme Name", text: $draft.name)
                .textFieldStyle(.roundedBorder)
                #if os(macOS)
            .frame(maxWidth: 300)
                #endif
        }
    }

    private var appearanceField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Show In")
                .font(.headline)
            Picker("Show In", selection: $draft.appearance) {
                Text("Light & Dark").tag(ThemeAppearance.any)
                Text("Light Only").tag(ThemeAppearance.light)
                Text("Dark Only").tag(ThemeAppearance.dark)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            #if os(macOS)
            .frame(maxWidth: 300)
            #endif
        }
    }

    private var readerColorsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Reader Colors")
                .font(.headline)

            colorRow(label: "Background", key: "background", hex: $draft.backgroundColor)
            colorRow(label: "Text", key: "text", hex: $draft.foregroundColor)
        }
    }

    private var readaloudSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Style")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Style", selection: $draft.readaloudHighlightMode) {
                    Text("Background").tag("background")
                    Text("Text").tag("text")
                    Text("Underline").tag("underline")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                #if os(macOS)
                .frame(maxWidth: 300)
                #endif
            }

            Text("Highlight Color")
                .font(.headline)
            InlineColorPicker(hex: $draft.highlightColor)

            if draft.readaloudHighlightMode == "background" {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Highlight Height: \(String(format: "%.1fx", draft.highlightThickness))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Slider(value: $draft.highlightThickness, in: 0.6...4.0, step: 0.1)
                        #if os(macOS)
                    .frame(maxWidth: 300)
                        #endif
                }
            }
        }
    }

    private var userHighlightsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("User Highlight Colors")
                .font(.headline)

            VStack(alignment: .leading, spacing: 4) {
                Text("Highlight Style")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Style", selection: $draft.userHighlightMode) {
                    Text("Background").tag("background")
                    Text("Text").tag("text")
                    Text("Underline").tag("underline")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                #if os(macOS)
                .frame(maxWidth: 300)
                #endif
            }

            highlightRow(
                index: 0,
                label: $draft.userHighlightLabel1,
                hex: $draft.userHighlightColor1,
            )
            highlightRow(
                index: 1,
                label: $draft.userHighlightLabel2,
                hex: $draft.userHighlightColor2,
            )
            highlightRow(
                index: 2,
                label: $draft.userHighlightLabel3,
                hex: $draft.userHighlightColor3,
            )
            highlightRow(
                index: 3,
                label: $draft.userHighlightLabel4,
                hex: $draft.userHighlightColor4,
            )
            highlightRow(
                index: 4,
                label: $draft.userHighlightLabel5,
                hex: $draft.userHighlightColor5,
            )
            highlightRow(
                index: 5,
                label: $draft.userHighlightLabel6,
                hex: $draft.userHighlightColor6,
            )
        }
        .onChange(of: draft.userHighlightColor1) { _, _ in previewUserIndex = 0 }
        .onChange(of: draft.userHighlightColor2) { _, _ in previewUserIndex = 1 }
        .onChange(of: draft.userHighlightColor3) { _, _ in previewUserIndex = 2 }
        .onChange(of: draft.userHighlightColor4) { _, _ in previewUserIndex = 3 }
        .onChange(of: draft.userHighlightColor5) { _, _ in previewUserIndex = 4 }
        .onChange(of: draft.userHighlightColor6) { _, _ in previewUserIndex = 5 }
    }

    private var customCSSSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Custom CSS")
                .font(.headline)
            TextEditor(
                text: Binding(
                    get: { draft.customCSS ?? "" },
                    set: { draft.customCSS = $0.isEmpty ? nil : $0 },
                )
            )
            .font(.system(.body, design: .monospaced))
            .frame(height: 100)
            .scrollContentBackground(.hidden)
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.secondary.opacity(0.4), lineWidth: 1)
            )
        }
    }

    private var previewUserColor: String {
        switch previewUserIndex {
            case 1: return draft.userHighlightColor2
            case 2: return draft.userHighlightColor3
            case 3: return draft.userHighlightColor4
            case 4: return draft.userHighlightColor5
            case 5: return draft.userHighlightColor6
            default: return draft.userHighlightColor1
        }
    }

    @ViewBuilder
    private func colorRow(label: String, key: String, hex: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    expandedPicker = expandedPicker == key ? nil : key
                }
            } label: {
                HStack(spacing: 12) {
                    Text(label)
                        .foregroundStyle(.primary)
                    Spacer()
                    Text(hex.wrappedValue.uppercased())
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Circle()
                        .fill(Color(hex: hex.wrappedValue) ?? .clear)
                        .frame(width: 32, height: 32)
                        .overlay(
                            Circle().strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1)
                        )
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expandedPicker == key {
                InlineColorPicker(hex: hex)
                    .padding(.top, 10)
            }
        }
    }

    @ViewBuilder
    private func highlightRow(index: Int, label: Binding<String>, hex: Binding<String>) -> some View
    {
        let key = "user\(index)"
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        expandedPicker = expandedPicker == key ? nil : key
                    }
                    if expandedPicker == key {
                        previewUserIndex = index
                    }
                } label: {
                    Circle()
                        .fill(Color(hex: hex.wrappedValue) ?? .clear)
                        .frame(width: 36, height: 36)
                        .overlay(
                            Circle().strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)

                TextField("Label", text: label)
                    .textFieldStyle(.roundedBorder)
            }

            if expandedPicker == key {
                InlineColorPicker(hex: hex)
                    .padding(.top, 10)
            }
        }
    }

    private func captureOriginalValues() {
        originalFlatValues = FlatColorSnapshot(
            backgroundColor: settingsVM.backgroundColor,
            foregroundColor: settingsVM.foregroundColor,
            highlightColor: settingsVM.highlightColor,
            highlightThickness: settingsVM.highlightThickness,
            readaloudHighlightMode: settingsVM.readaloudHighlightMode,
            userHighlightColor1: settingsVM.userHighlightColor1,
            userHighlightColor2: settingsVM.userHighlightColor2,
            userHighlightColor3: settingsVM.userHighlightColor3,
            userHighlightColor4: settingsVM.userHighlightColor4,
            userHighlightColor5: settingsVM.userHighlightColor5,
            userHighlightColor6: settingsVM.userHighlightColor6,
            userHighlightLabel1: settingsVM.userHighlightLabel1,
            userHighlightLabel2: settingsVM.userHighlightLabel2,
            userHighlightLabel3: settingsVM.userHighlightLabel3,
            userHighlightLabel4: settingsVM.userHighlightLabel4,
            userHighlightLabel5: settingsVM.userHighlightLabel5,
            userHighlightLabel6: settingsVM.userHighlightLabel6,
            userHighlightMode: settingsVM.userHighlightMode,
            customCSS: settingsVM.customCSS,
        )
    }

    private func pushLivePreview(_ theme: ReaderTheme) {
        let isActive =
            settingsVM.activeThemeId(for: colorScheme) == theme.id
        guard isActive else { return }

        settingsVM.backgroundColor = theme.backgroundColor
        settingsVM.foregroundColor = theme.foregroundColor
        settingsVM.highlightColor = theme.highlightColor
        settingsVM.highlightThickness = theme.highlightThickness
        settingsVM.readaloudHighlightMode = theme.readaloudHighlightMode
        settingsVM.userHighlightColor1 = theme.userHighlightColor1
        settingsVM.userHighlightColor2 = theme.userHighlightColor2
        settingsVM.userHighlightColor3 = theme.userHighlightColor3
        settingsVM.userHighlightColor4 = theme.userHighlightColor4
        settingsVM.userHighlightColor5 = theme.userHighlightColor5
        settingsVM.userHighlightColor6 = theme.userHighlightColor6
        settingsVM.userHighlightLabel1 = theme.userHighlightLabel1
        settingsVM.userHighlightLabel2 = theme.userHighlightLabel2
        settingsVM.userHighlightLabel3 = theme.userHighlightLabel3
        settingsVM.userHighlightLabel4 = theme.userHighlightLabel4
        settingsVM.userHighlightLabel5 = theme.userHighlightLabel5
        settingsVM.userHighlightLabel6 = theme.userHighlightLabel6
        settingsVM.userHighlightMode = theme.userHighlightMode
        settingsVM.customCSS = theme.customCSS
        settingsVM.save()
    }

    private func saveEditing() {
        if isBuiltInEdit {
            settingsVM.updateBuiltInTheme(draft)
        } else {
            settingsVM.updateCustomTheme(draft)
        }
        let isActive = settingsVM.activeThemeId(for: colorScheme) == draft.id
        if isActive {
            settingsVM.applyThemeValues(draft)
        }
        dismiss()
    }

    private func cancelEditing() {
        if let snap = originalFlatValues {
            settingsVM.backgroundColor = snap.backgroundColor
            settingsVM.foregroundColor = snap.foregroundColor
            settingsVM.highlightColor = snap.highlightColor
            settingsVM.highlightThickness = snap.highlightThickness
            settingsVM.readaloudHighlightMode = snap.readaloudHighlightMode
            settingsVM.userHighlightColor1 = snap.userHighlightColor1
            settingsVM.userHighlightColor2 = snap.userHighlightColor2
            settingsVM.userHighlightColor3 = snap.userHighlightColor3
            settingsVM.userHighlightColor4 = snap.userHighlightColor4
            settingsVM.userHighlightColor5 = snap.userHighlightColor5
            settingsVM.userHighlightColor6 = snap.userHighlightColor6
            settingsVM.userHighlightLabel1 = snap.userHighlightLabel1
            settingsVM.userHighlightLabel2 = snap.userHighlightLabel2
            settingsVM.userHighlightLabel3 = snap.userHighlightLabel3
            settingsVM.userHighlightLabel4 = snap.userHighlightLabel4
            settingsVM.userHighlightLabel5 = snap.userHighlightLabel5
            settingsVM.userHighlightLabel6 = snap.userHighlightLabel6
            settingsVM.userHighlightMode = snap.userHighlightMode
            settingsVM.customCSS = snap.customCSS
            settingsVM.save()
        }
        dismiss()
    }
}

private struct FlatColorSnapshot {
    let backgroundColor: String?
    let foregroundColor: String?
    let highlightColor: String?
    let highlightThickness: Double
    let readaloudHighlightMode: String
    let userHighlightColor1: String
    let userHighlightColor2: String
    let userHighlightColor3: String
    let userHighlightColor4: String
    let userHighlightColor5: String
    let userHighlightColor6: String
    let userHighlightLabel1: String
    let userHighlightLabel2: String
    let userHighlightLabel3: String
    let userHighlightLabel4: String
    let userHighlightLabel5: String
    let userHighlightLabel6: String
    let userHighlightMode: String
    let customCSS: String?
}

#endif
