#if os(macOS)
import AppKit
import SwiftUI

struct DebugLogView: View {
    @State private var logText: String = ""
    @State private var messageCount: Int = 0
    @State private var verbose = DebugLogBuffer.shared.isVerbose

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
                Button("Copy All") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(logText, forType: .string)
                }
            }
            .padding(8)

            Divider()

            ScrollView {
                Text(logText)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
            }
        }
        .frame(minWidth: 600, minHeight: 400)
        .onAppear {
            loadMessages()
        }
    }

    private func loadMessages() {
        let messages = DebugLogBuffer.shared.getMessages()
        messageCount = messages.count
        logText = messages.joined(separator: "\n")
    }
}

#endif
