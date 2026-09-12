#if os(macOS)
import AppKit
import SwiftUI

struct DebugLogView: View {
    @State private var logLines: [String] = []
    @State private var messageCount: Int = 0
    @State private var verbose = DebugLogBuffer.shared.isVerbose
    @State private var fileSizeText = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("\(messageCount) messages")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Toggle("Verbose", isOn: $verbose)
                    .toggleStyle(.checkbox)
                    .help("Include high-volume performance diagnostics in the log.")
                    .onChange(of: verbose) { _, newValue in
                        DebugLogBuffer.shared.setVerbose(newValue)
                    }
                Button("Refresh") {
                    loadMessages()
                }
                Button("Clear") {
                    DebugLogBuffer.shared.clear()
                    loadMessages()
                }
                Button("Share Full Log\(fileSizeText)") {
                    shareFullLog()
                }
                .help("The list below holds only recent messages; the file keeps far more.")
                Button("Copy All") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(
                        logLines.joined(separator: "\n"),
                        forType: .string,
                    )
                }
            }
            .padding(8)

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(logLines.indices, id: \.self) { index in
                        Text(logLines[index])
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(8)
            }
        }
        .frame(minWidth: 600, minHeight: 400)
        .onAppear {
            loadMessages()
        }
    }

    private func shareFullLog() {
        guard let exported = DebugLogFile.shared.exportCombined() else { return }
        guard let view = NSApp.keyWindow?.contentView else {
            NSWorkspace.shared.activateFileViewerSelecting([exported])
            return
        }
        let picker = NSSharingServicePicker(items: [exported])
        picker.show(relativeTo: .zero, of: view, preferredEdge: .minY)
    }

    private func loadMessages() {
        let messages = DebugLogBuffer.shared.getMessages()
        messageCount = messages.count
        logLines = messages
        let bytes = DebugLogFile.shared.totalBytes()
        fileSizeText =
            bytes > 0
            ? " (\(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)))"
            : ""
    }
}

#endif
