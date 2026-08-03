#if os(iOS) || os(macOS)
    import SwiftUI

    @MainActor
    @Observable
    final class LiveReadingSyncSettingsModel {
        var isEnabled = false
        private(set) var isLoaded = false
        private(set) var status: LiveReadingSyncActor.Status?

        static let footerText =
            "Follow readaloud playback from other devices on your local "
            + "network. While enabled, this device broadcasts its readaloud "
            + "position as it plays, and follows along when another opted-in "
            + "device is narrating the same book."

        func setEnabled(_ newValue: Bool) {
            guard isLoaded else { return }
            Task {
                try? await SettingsActor.shared.updateConfig(
                    liveReadingSyncEnabled: newValue
                )
                await LiveReadingSyncActor.shared.reconcileWithSettings()
                status = await LiveReadingSyncActor.shared.status()
            }
        }

        func run() async {
            isEnabled = await SettingsActor.shared.config.sync.liveReadingSyncEnabled
            status = await LiveReadingSyncActor.shared.status()
            isLoaded = true
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                status = await LiveReadingSyncActor.shared.status()
            }
        }
    }

    /// Form sections for the settings screen; the status poll runs while visible.
    struct LiveReadingSyncSettingsSections: View {
        @State private var model = LiveReadingSyncSettingsModel()

        var body: some View {
            Section {
                Toggle("Live Reading Sync", isOn: $model.isEnabled)
                    .disabled(!model.isLoaded)
                    .onChange(of: model.isEnabled) { _, newValue in
                        model.setEnabled(newValue)
                    }
                    .task { await model.run() }
            } footer: {
                Text(LiveReadingSyncSettingsModel.footerText)
            }

            if let status = model.status {
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
    }

    #if os(macOS)
        /// Grid-styled variant matching the macOS General settings tab layout.
        struct MacLiveReadingSyncSettings: View {
            @State private var model = LiveReadingSyncSettingsModel()

            var body: some View {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Live Reading Sync")
                        .font(.headline)

                    Toggle("Enable Live Reading Sync", isOn: $model.isEnabled)
                        .disabled(!model.isLoaded)
                        .onChange(of: model.isEnabled) { _, newValue in
                            model.setEnabled(newValue)
                        }
                        .help(LiveReadingSyncSettingsModel.footerText)
                        .task { await model.run() }

                    Text(LiveReadingSyncSettingsModel.footerText)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let status = model.status {
                        Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 6) {
                            GridRow {
                                Text("Listening").foregroundStyle(.secondary)
                                Text(status.isActive ? "Active" : "Inactive")
                            }
                            GridRow {
                                Text("Peers on network").foregroundStyle(.secondary)
                                Text("\(status.peerCount)")
                            }
                            GridRow {
                                Text("Positions sent").foregroundStyle(.secondary)
                                Text("\(status.packetsSent)")
                            }
                            GridRow {
                                Text("Positions received").foregroundStyle(.secondary)
                                Text("\(status.packetsReceived)")
                            }
                            if let error = status.lastError {
                                GridRow {
                                    Text("Last error").foregroundStyle(.secondary)
                                    Text(error)
                                }
                            }
                        }
                        .font(.callout)
                    }
                }
            }
        }
    #endif
#endif
