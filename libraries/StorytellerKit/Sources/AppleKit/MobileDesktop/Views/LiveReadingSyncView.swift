#if os(iOS) || os(macOS)
    import SwiftUI

    struct LiveReadingSyncView: View {
        @State private var isEnabled = false
        @State private var isLoaded = false
        @State private var status: LiveReadingSyncActor.Status?

        var body: some View {
            Form {
                Section {
                    Toggle("Live Reading Sync", isOn: $isEnabled)
                        .disabled(!isLoaded)
                        .onChange(of: isEnabled) { _, newValue in
                            guard isLoaded else { return }
                            Task {
                                try? await SettingsActor.shared.updateConfig(
                                    liveReadingSyncEnabled: newValue
                                )
                                await LiveReadingSyncActor.shared.reconcileWithSettings()
                                status = await LiveReadingSyncActor.shared.status()
                            }
                        }
                } footer: {
                    Text(
                        "Follow readaloud playback from other devices on your local "
                            + "network. While enabled, this device broadcasts its readaloud "
                            + "position as it plays, and follows along when another opted-in "
                            + "device is narrating the same book."
                    )
                }

                if let status {
                    Section("Status") {
                        LabeledContent(
                            "Listening",
                            value: status.isActive ? "Active" : "Inactive"
                        )
                        LabeledContent("Peers on network", value: "\(status.peerCount)")
                        LabeledContent("Positions sent", value: "\(status.packetsSent)")
                        LabeledContent(
                            "Positions received", value: "\(status.packetsReceived)"
                        )
                        if let error = status.lastError {
                            LabeledContent("Last error", value: error)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Live Reading Sync")
            .task {
                isEnabled = await SettingsActor.shared.config.sync.liveReadingSyncEnabled
                status = await LiveReadingSyncActor.shared.status()
                isLoaded = true
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    status = await LiveReadingSyncActor.shared.status()
                }
            }
            #if os(macOS)
                .frame(minWidth: 440, minHeight: 320)
            #endif
        }
    }
#endif
