#if os(tvOS)
import Foundation
import StorytellerKit
import SwiftUI

@MainActor
@Observable
public final class TVSettingsViewModel {
    var storytellerSources: [BookSourceRecord] = []
    var selectedSourceID: BookSourceID?
    var sourceName: String = BookSourceKind.storyteller.defaultName
    var serverURL: String = ""
    var username: String = ""
    var password: String = ""
    var connectionError: String?
    var isTesting: Bool = false
    var isSaving: Bool = false
    var hasSavedCredentials: Bool = false
    var connectionStatus: ConnectionStatus = .disconnected
    var isAddingSource: Bool = false
    var isEditingSource: Bool = false

    init() {
        Task {
            await loadSources()
        }
    }

    func loadSources() async {
        let previousSelection = selectedSourceID
        storytellerSources = await BookServiceActor.shared.bookSources
            .filter { $0.kind == .storyteller }
        if isEditingSource {
            return
        }
        if let previousSelection,
            storytellerSources.contains(where: { $0.id == previousSelection })
        {
            selectedSourceID = previousSelection
        } else {
            selectedSourceID = storytellerSources.first?.id
        }
        await loadCredentialsForSelectedSource()
    }

    func startEditingSource(_ source: BookSourceRecord) async {
        selectedSourceID = source.id
        isAddingSource = false
        isEditingSource = true
        await loadCredentialsForSelectedSource()
    }

    func loadCredentialsForSelectedSource() async {
        isAddingSource = false
        guard let selectedSourceID else {
            sourceName = BookSourceKind.storyteller.defaultName
            serverURL = ""
            username = ""
            password = ""
            connectionStatus = .disconnected
            return
        }

        sourceName =
            storytellerSources.first { $0.id == selectedSourceID }?.name
            ?? BookSourceKind.storyteller.defaultName

        do {
            if let credentials = try await AuthenticationActor.shared.loadCredentials(
                sourceID: selectedSourceID
            ) {
                serverURL = credentials.url
                username = credentials.username
                password = credentials.password
                hasSavedCredentials = true
            } else {
                serverURL = ""
                username = ""
                password = ""
                hasSavedCredentials = false
            }
            connectionStatus = await BookServiceActor.shared.connectionStatus(
                sourceID: selectedSourceID
            )
        } catch {
            debugLog("[TVSettingsViewModel] Failed to load credentials: \(error)")
        }
    }

    func startAddingSource() {
        isAddingSource = true
        isEditingSource = true
        selectedSourceID = nil
        sourceName = ""
        serverURL = ""
        username = ""
        password = ""
        connectionError = nil
        hasSavedCredentials = false
        connectionStatus = .disconnected
    }

    func stopEditingSource() async {
        isAddingSource = false
        isEditingSource = false
        connectionError = nil
        await loadSources()
    }

    func saveSource() async -> Bool {
        isSaving = true
        connectionError = nil

        if isAddingSource || selectedSourceID == nil {
            guard
                let record = await BookServiceActor.shared.createBookSource(
                    BookSourceConfiguration(
                        kind: .storyteller,
                        name: sourceName,
                        serverURL: serverURL,
                        username: username,
                        password: password,
                    )
                )
            else {
                connectionStatus = .error("Save failed")
                connectionError = "Failed to save server."
                isSaving = false
                return false
            }
            selectedSourceID = record.id
            isAddingSource = false
        } else if let selectedSourceID {
            let saved = await BookServiceActor.shared.updateBookSource(
                id: selectedSourceID,
                configuration: BookSourceConfiguration(
                    kind: .storyteller,
                    name: sourceName,
                    serverURL: serverURL,
                    username: username,
                    password: password,
                ),
            )
            guard saved else {
                connectionStatus = .error("Save failed")
                connectionError = "Failed to save server."
                isSaving = false
                return false
            }
        } else {
            connectionStatus = .error("No server selected")
            connectionError = "No server selected."
            isSaving = false
            return false
        }

        hasSavedCredentials = true
        connectionStatus = .disconnected
        await loadSources()
        isSaving = false
        return true
    }

    func testConnection() async {
        let saved = await saveSource()
        guard saved, let sourceID = selectedSourceID else { return }

        isTesting = true
        connectionError = nil

        let success = await BookServiceActor.shared.setLogin(
            sourceID: sourceID,
            baseURL: serverURL,
            username: username,
            password: password,
        )

        if success {
            connectionError = nil
            connectionStatus = .connected
        } else {
            connectionStatus = .error("Login failed")
            connectionError = "Could not connect. Check your credentials."
        }

        isTesting = false
    }

    func removeSelectedSource() async {
        guard let selectedSourceID else { return }
        let removed = await BookServiceActor.shared.removeBookSource(id: selectedSourceID)
        if removed {
            self.selectedSourceID = nil
            serverURL = ""
            username = ""
            password = ""
            connectionStatus = .disconnected
            isAddingSource = false
            isEditingSource = false
            await loadSources()
        } else {
            connectionError = "Failed to remove server."
        }
    }

}
#endif
