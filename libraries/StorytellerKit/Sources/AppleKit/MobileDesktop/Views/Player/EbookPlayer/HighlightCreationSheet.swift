#if os(iOS) || os(macOS)
import SwiftUI

@available(macOS 14.0, iOS 17.0, *)
struct HighlightCreationSheet: View {
    let settingsVM: SettingsViewModel
    let selectedText: String
    let onSave: (HighlightColor?, String?) -> Void
    let onCancel: () -> Void
    var title: String = "Add Highlight"
    var initialColor: HighlightColor? = .yellow
    var initialNote: String = ""

    @State private var selectedColor: HighlightColor? = .yellow
    @State private var note: String = ""
    @State private var isBookmarkOnly: Bool = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                selectedTextPreview

                if !isBookmarkOnly {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Color")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        colorPicker
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Note")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Optional", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                        .textFieldStyle(.roundedBorder)
                }

                Toggle("Bookmark only (no highlight color)", isOn: $isBookmarkOnly)
                    .font(.subheadline)

                Spacer()
            }
            .padding()
            .onAppear {
                selectedColor = initialColor ?? .yellow
                note = initialNote
                isBookmarkOnly = initialColor == nil
            }
            .navigationTitle(title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let color = isBookmarkOnly ? nil : selectedColor
                        let noteText = note.isEmpty ? nil : note
                        onSave(color, noteText)
                    }
                }
            }
            #else
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let color = isBookmarkOnly ? nil : selectedColor
                        let noteText = note.isEmpty ? nil : note
                        onSave(color, noteText)
                    }
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }
            #endif
        }
        #if os(iOS)
        .presentationDetents([.medium])
        #else
        .frame(width: 400, height: 450)
        #endif
    }

    private var selectedTextPreview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Selected Text")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(selectedText)
                .font(.body)
                .foregroundStyle(.primary)
                .lineLimit(4)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 1)
                )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var colorPicker: some View {
        HStack(spacing: 12) {
            ForEach(HighlightColor.allCases, id: \.self) { color in
                Button {
                    selectedColor = color
                } label: {
                    VStack(spacing: 4) {
                        Circle()
                            .fill(colorForHighlight(color))
                            .frame(width: 32, height: 32)
                            .overlay {
                                if selectedColor == color {
                                    Image(systemName: "checkmark")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.primary)
                                }
                            }
                            .overlay {
                                Circle()
                                    .strokeBorder(
                                        selectedColor == color ? Color.primary : Color.clear,
                                        lineWidth: 2,
                                    )
                            }
                        Text(settingsVM.label(for: color))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func colorForHighlight(_ color: HighlightColor?) -> Color {
        guard let color else { return Color.yellow.opacity(0.4) }
        let hex = settingsVM.hexColor(for: color)
        return Color(hex: hex) ?? color.color
    }
}

#endif
