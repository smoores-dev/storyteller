#if os(iOS) || os(macOS)
import SwiftUI

/// Keybindings help popover showing keyboard shortcuts and mouse controls
struct EbookKeybindingsHelp: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Keyboard Shortcuts")
                .font(.headline)

            VStack(alignment: .leading, spacing: 12) {
                keybindingRow(keys: "← / →", description: "Turn pages")
                keybindingRow(keys: "↑ / ↓", description: "Skip sentences")
                keybindingRow(keys: "Space", description: "Play/pause audio playback")
            }

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                Text("Mouse")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                keybindingRow(keys: "Double-click", description: "Select playback location")
            }
        }
    }

    private func keybindingRow(keys: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(keys)
                .font(.system(.body, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 70, alignment: .leading)
            Text(description)
                .font(.body)
        }
    }
}

#endif
