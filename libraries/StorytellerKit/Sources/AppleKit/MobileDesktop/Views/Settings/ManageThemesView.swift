#if os(iOS) || os(macOS)
import SwiftUI

struct ManageThemesView: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @State private var editingTheme: ReaderTheme? = nil
    @State private var renamingThemeId: String? = nil
    @State private var renameText: String = ""
    @State private var deleteConfirmThemeId: String? = nil

    var body: some View {
        #if os(iOS)
        themeListContent
            .navigationTitle("Manage Themes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    newThemeMenu
                }
            }
            .fullScreenCover(item: $editingTheme) { theme in
                ThemeEditorView(settingsVM: settingsVM, theme: theme)
            }
        #else
        VStack(spacing: 0) {
            themeListContent
                .frame(minWidth: 500, minHeight: 400)
            Divider()
            HStack {
                newThemeMenu
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(12)
        }
        .sheet(item: $editingTheme) { theme in
            ThemeEditorView(settingsVM: settingsVM, theme: theme)
        }
        #endif
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
        }
    }

    private var themeListContent: some View {
        List {
            Section("Built-in Themes") {
                ForEach(settingsVM.effectiveBuiltInThemes) { theme in
                    themeRow(theme)
                }
            }

            if !settingsVM.customThemes.isEmpty {
                Section("Custom Themes") {
                    ForEach(settingsVM.customThemes) { theme in
                        themeRow(theme)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    settingsVM.deleteCustomTheme(id: theme.id)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
            }
        }
        #if os(macOS)
        .listStyle(.inset(alternatesRowBackgrounds: true))
        #endif
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
                    settingsVM.deleteCustomTheme(id: id)
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

                    statusBadges(for: theme)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            themeContextMenu(theme)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func statusBadges(for theme: ReaderTheme) -> some View {
        if settingsVM.selectedLightThemeId == theme.id {
            Image(systemName: "sun.max.fill")
                .font(.caption)
                .foregroundStyle(.orange)
                .help("Active light mode theme")
        }
        if settingsVM.selectedDarkThemeId == theme.id {
            Image(systemName: "moon.fill")
                .font(.caption)
                .foregroundStyle(.indigo)
                .help("Active dark mode theme")
        }
    }

    private func themePreviewSwatch(_ theme: ReaderTheme) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color(hex: theme.backgroundColor) ?? .white)
                .frame(width: 32, height: 32)
            Text("Aa")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color(hex: theme.foregroundColor) ?? .black)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 1)
        )
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
        #if os(macOS)
        .menuStyle(.borderlessButton)
        #endif
        .fixedSize()
    }

    private func appearanceLabel(_ appearance: ThemeAppearance) -> String {
        switch appearance {
            case .light: return "Light only"
            case .dark: return "Dark only"
            case .any: return "Both"
        }
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
