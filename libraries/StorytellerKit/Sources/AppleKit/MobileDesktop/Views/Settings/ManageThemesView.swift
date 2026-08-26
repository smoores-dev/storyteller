#if os(iOS) || os(macOS)
import SwiftUI

struct ManageThemesView: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.readerPalette) private var readerPalette
    @State private var editingTheme: ReaderTheme? = nil
    @State private var renamingThemeId: String? = nil
    @State private var renameText: String = ""
    @State private var deleteConfirmThemeId: String? = nil

    var body: some View {
        themeListContent
            #if os(iOS)
            .fullScreenCover(item: $editingTheme) { theme in
                ThemeEditorView(settingsVM: settingsVM, theme: theme)
            }
            #else
            .sheet(item: $editingTheme) { theme in
                ThemeEditorView(settingsVM: settingsVM, theme: theme)
            }
            #endif
    }

    private var paletteRowBackground: Color? {
        #if os(macOS)
        return nil
        #else
        return readerPalette.map { $0.resolved(for: colorScheme).cardBackground }
        #endif
    }

    private var activeTheme: ReaderTheme {
        settingsVM.resolveTheme(id: settingsVM.activeThemeId(for: colorScheme))
            ?? (colorScheme == .dark ? .builtInDark : .builtInLight)
    }

    private var newThemeMenu: some View {
        Menu {
            ForEach(settingsVM.allThemes) { theme in
                Button("From \"\(theme.name)\"") {
                    let newTheme = settingsVM.duplicateTheme(theme)
                    editingTheme = newTheme
                }
            }
        } label: {
            Label("New Theme", systemImage: "plus")
                .font(.caption)
        }
        .textCase(nil)
    }

    private var themeListContent: some View {
        List {
            Section {
                ThemePreviewCard(
                    theme: activeTheme,
                    previewUserColor: activeTheme.userHighlightColor1,
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } header: {
                Text("Preview")
            } footer: {
                Text("Showing \"\(activeTheme.name)\", the active theme right now.")
            }

            Section {
                ForEach(settingsVM.effectiveBuiltInThemes) { theme in
                    themeRow(theme)
                }
            } header: {
                HStack {
                    Text("Built-in Themes")
                    Spacer()
                    newThemeMenu
                }
            }
            .listRowBackground(paletteRowBackground)

            if !settingsVM.customThemes.isEmpty {
                Section("Custom Themes") {
                    ForEach(settingsVM.customThemes) { theme in
                        themeRow(theme)
                            #if os(iOS)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    deleteTheme(id: theme.id)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            #else
                            .contextMenu {
                                Button(role: .destructive) {
                                    deleteConfirmThemeId = theme.id
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            #endif
                    }
                }
                .listRowBackground(paletteRowBackground)
            }
        }
        .alert(
            "Delete Theme?",
            isPresented: Binding(
                get: { deleteConfirmThemeId != nil },
                set: { if !$0 { deleteConfirmThemeId = nil } },
            ),
        ) {
            Button("Cancel", role: .cancel) { deleteConfirmThemeId = nil }
            Button("Delete", role: .destructive) {
                if let id = deleteConfirmThemeId {
                    deleteTheme(id: id)
                }
                deleteConfirmThemeId = nil
            }
        } message: {
            Text("This theme will be permanently deleted.")
        }
    }

    @ViewBuilder
    private func themeRow(_ theme: ReaderTheme) -> some View {
        HStack(spacing: 12) {
            Button {
                editingTheme = theme
            } label: {
                HStack(spacing: 12) {
                    themePreviewSwatch(theme)

                    VStack(alignment: .leading, spacing: 2) {
                        if renamingThemeId == theme.id {
                            TextField("Theme Name", text: $renameText)
                                .textFieldStyle(.roundedBorder)
                                .onSubmit {
                                    commitRename(theme)
                                }
                        } else {
                            Text(theme.name)
                                .fontWeight(.medium)
                        }
                        HStack(spacing: 4) {
                            Text(theme.readaloudHighlightMode.capitalized + " highlight")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if !theme.isBuiltIn {
                                Text(appearanceLabel(theme.appearance))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(3)
                            }
                            if theme.isBuiltIn, settingsVM.isBuiltInEdited(id: theme.id) {
                                Text("Edited")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(3)
                            }
                        }
                    }

                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            statusBadges(for: theme)

            themeContextMenu(theme)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func statusBadges(for theme: ReaderTheme) -> some View {
        let activeLight = settingsVM.selectedLightThemeId == theme.id
        let activeDark = settingsVM.selectedDarkThemeId == theme.id
        if activeLight {
            activeBadge("Light", icon: "sun.max.fill", tint: .orange)
        }
        if activeDark {
            activeBadge("Dark", icon: "moon.fill", tint: .indigo)
        }
        let light = theme.availableFor(colorScheme: "light")
        let dark = theme.availableFor(colorScheme: "dark")
        let fullyActive = (!light || activeLight) && (!dark || activeDark)
        if !fullyActive {
            useThemeControl(theme)
        }
    }

    @ViewBuilder
    private func useThemeControl(_ theme: ReaderTheme) -> some View {
        let light = theme.availableFor(colorScheme: "light")
        let dark = theme.availableFor(colorScheme: "dark")
        if light && dark {
            Button {
                settingsVM.selectTheme(id: theme.id, for: .light)
                settingsVM.selectTheme(id: theme.id, for: .dark)
            } label: {
                useThemeLabel
            }
            .buttonStyle(.plain)
        } else {
            Button {
                settingsVM.selectTheme(id: theme.id, for: light ? .light : .dark)
            } label: {
                useThemeLabel
            }
            .buttonStyle(.plain)
        }
    }

    private var useThemeLabel: some View {
        Text("Use Theme")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .overlay(
                Capsule()
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 2.5]))
                    .foregroundStyle(.secondary)
            )
            .contentShape(Capsule())
    }

    private func activeBadge(_ label: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
            Text(label)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Capsule().fill(tint.opacity(0.15)))
    }

    private func themePreviewSwatch(_ theme: ReaderTheme) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(swatchColor(theme.backgroundColor, role: .background, in: theme) ?? .white)
                .frame(width: 32, height: 32)
            Text("Aa")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(
                    swatchColor(theme.foregroundColor, role: .foreground, in: theme) ?? .black
                )
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 1)
        )
    }

    private func swatchColor(
        _ raw: String,
        role: CoverReaderChrome.Role,
        in theme: ReaderTheme,
    ) -> Color? {
        let tone = readerPalette?.chromeHSB ?? CoverPaletteAdjustment.fallbackSurfaceHSB
        guard
            let hex = CoverReaderChrome.resolvedHex(
                raw,
                role: role,
                tone: tone,
                dark: theme.appearance == .dark
                    || (theme.appearance == .any && colorScheme == .dark),
            )
        else { return nil }
        return Color(hex: hex)
    }

    @ViewBuilder
    private func themeContextMenu(_ theme: ReaderTheme) -> some View {
        Menu {
            if theme.availableFor(colorScheme: "light") {
                Button {
                    settingsVM.selectTheme(id: theme.id, for: .light)
                } label: {
                    Label("Use for Light Mode", systemImage: "sun.max")
                }
            }
            if theme.availableFor(colorScheme: "dark") {
                Button {
                    settingsVM.selectTheme(id: theme.id, for: .dark)
                } label: {
                    Label("Use for Dark Mode", systemImage: "moon")
                }
            }
            Divider()
            Button {
                let newTheme = settingsVM.duplicateTheme(theme)
                editingTheme = newTheme
            } label: {
                Label("Duplicate", systemImage: "doc.on.doc")
            }
            if theme.isBuiltIn, settingsVM.isBuiltInEdited(id: theme.id) {
                Button {
                    settingsVM.resetBuiltInTheme(id: theme.id, for: colorScheme)
                } label: {
                    Label("Reset to Stock", systemImage: "arrow.counterclockwise")
                }
            }
            if !theme.isBuiltIn {
                Button {
                    renamingThemeId = theme.id
                    renameText = theme.name
                } label: {
                    Label("Rename", systemImage: "pencil")
                }
                Divider()
                Button(role: .destructive) {
                    deleteConfirmThemeId = theme.id
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .foregroundStyle(.secondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .fixedSize()
    }

    private func appearanceLabel(_ appearance: ThemeAppearance) -> String {
        switch appearance {
            case .light: return "Light only"
            case .dark: return "Dark only"
            case .any: return "Both"
        }
    }

    // Deleting the active theme falls the selection back to a built-in; the
    // reader renders from the flat mirror values, so they must be re-applied
    // or it keeps drawing with the deleted theme's styling.
    private func deleteTheme(id: String) {
        settingsVM.deleteCustomTheme(id: id)
        settingsVM.applyActiveTheme(for: colorScheme)
    }

    private func commitRename(_ theme: ReaderTheme) {
        let trimmed = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !theme.isBuiltIn else {
            renamingThemeId = nil
            return
        }
        var updated = theme
        updated.name = trimmed
        settingsVM.updateCustomTheme(updated)
        renamingThemeId = nil
    }
}

#endif
