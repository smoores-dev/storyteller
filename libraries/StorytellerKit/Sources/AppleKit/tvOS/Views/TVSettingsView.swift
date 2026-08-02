#if os(tvOS)
import StorytellerKit
import SwiftUI

struct TVSettingsView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var settingsViewModel = TVSettingsViewModel()
    @State private var showRemoveConfirmation = false
    @State private var navigationPath: [TVSourceRoute] = []

    private var canSave: Bool {
        !settingsViewModel.serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !settingsViewModel.username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !settingsViewModel.password.isEmpty
            && !settingsViewModel.isSaving
            && !settingsViewModel.isTesting
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            sourceList
                .navigationDestination(for: TVSourceRoute.self) { _ in
                    editorForm
                }
        }
        .onChange(of: navigationPath) { _, path in
            if path.isEmpty {
                Task {
                    await settingsViewModel.stopEditingSource()
                }
            }
        }
    }

    private var sourceList: some View {
        Form {
            Section("Book Sources") {
                if settingsViewModel.storytellerSources.isEmpty {
                    Text("No Storyteller servers configured.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(settingsViewModel.storytellerSources) { source in
                        Button {
                            Task {
                                await settingsViewModel.startEditingSource(source)
                                navigationPath = [.editor]
                            }
                        } label: {
                            Label(source.name, systemImage: "server.rack")
                        }
                    }
                }

                Button {
                    settingsViewModel.startAddingSource()
                    navigationPath = [.editor]
                } label: {
                    Label("Add Storyteller Server", systemImage: "plus")
                }
            }
        }
        .navigationTitle("Book Sources")
    }

    private var editorForm: some View {
        Form {
            Section {
                Button {
                    navigationPath = []
                } label: {
                    Label("Book Sources", systemImage: "chevron.left")
                }
            }

            Section(settingsViewModel.isAddingSource ? "Add Server" : "Server Details") {
                TextField("Name", text: $settingsViewModel.sourceName)
                    .textContentType(.name)

                TextField("Server URL", text: $settingsViewModel.serverURL)
                    .textContentType(.URL)
                    .autocorrectionDisabled()

                TextField("Username", text: $settingsViewModel.username)
                    .textContentType(.username)
                    .autocorrectionDisabled()

                SecureField("Password", text: $settingsViewModel.password)
                    .textContentType(.password)
            }

            Section("Connection") {
                Button {
                    Task {
                        _ = await settingsViewModel.saveSource()
                        await mediaViewModel.refreshMetadata(source: "TVSettingsView")
                    }
                } label: {
                    actionRow(
                        title: "Save Credentials",
                        systemImage: "square.and.arrow.down",
                        status: saveStatusIndicator,
                    )
                }
                .disabled(!canSave)

                Button {
                    Task {
                        await settingsViewModel.testConnection()
                        let status = settingsViewModel.connectionStatus
                        if status == .connected {
                            let _ = await BookServiceActor.shared.fetchLibraryInformation()
                        }
                        await mediaViewModel.refreshMetadata(source: "TVSettingsView")
                    }
                } label: {
                    actionRow(
                        title: "Test Connection",
                        systemImage: "network",
                        status: connectionStatusIndicator,
                    )
                }
                .disabled(!canSave)

                if let error = settingsViewModel.connectionError {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }

            if settingsViewModel.selectedSourceID != nil, !settingsViewModel.isAddingSource {
                Section {
                    Button(role: .destructive) {
                        showRemoveConfirmation = true
                    } label: {
                        Label("Remove Server", systemImage: "trash")
                    }
                }
            }

        }
        .navigationTitle(
            settingsViewModel.isAddingSource ? "Add Server" : settingsViewModel.sourceName
        )
        .confirmationDialog(
            "Remove this server?",
            isPresented: $showRemoveConfirmation,
            titleVisibility: .visible,
        ) {
            Button("Remove Server", role: .destructive) {
                Task {
                    await settingsViewModel.removeSelectedSource()
                    navigationPath = []
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "This will delete saved credentials, cached metadata, downloaded media, and covers for books from this server."
            )
        }
    }

    private func actionRow(
        title: String,
        systemImage: String,
        status: ActionStatusIndicator?,
    ) -> some View {
        HStack {
            Label(title, systemImage: systemImage)
            Spacer()
            if let status {
                switch status {
                    case .progress:
                        ProgressView()
                    case .success(let color):
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(color)
                    case .failure:
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                }
            }
        }
    }

    private var saveStatusIndicator: ActionStatusIndicator? {
        if settingsViewModel.isSaving {
            return .progress
        }
        if settingsViewModel.hasSavedCredentials {
            return .success(.secondary)
        }
        return nil
    }

    private var connectionStatusIndicator: ActionStatusIndicator? {
        if settingsViewModel.isTesting {
            return .progress
        }
        switch settingsViewModel.connectionStatus {
            case .connected:
                return .success(.green)
            case .error:
                return .failure
            case .connecting:
                return .progress
            case .disconnected:
                return nil
        }
    }

    private enum ActionStatusIndicator {
        case progress
        case success(Color)
        case failure
    }

    private enum TVSourceRoute: Hashable {
        case editor
    }
}
#endif
