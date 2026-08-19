#if os(iOS) || os(macOS)
import SwiftUI
import UniformTypeIdentifiers

#if os(macOS)
import AppKit
#endif

#if os(iOS)
import UIKit
#endif

enum FolderPathDisplay {
    /// The Files app location for paths inside the app's Documents directory,
    /// e.g. "On My iPhone > Storyteller". Nil for any other path. Stored paths may
    /// reference an older container UUID, so a stale app-container Documents path
    /// counts too, matching the runtime rebase in rebasedContainerFolderURL.
    static func filesAppLocation(for path: String) -> String? {
        #if os(iOS)
        guard
            !path.isEmpty,
            let documents = FileManager.default.urls(
                for: .documentDirectory,
                in: .userDomainMask,
            ).first
        else {
            return nil
        }

        let base = documents.standardizedFileURL.path
        let standardized = URL(fileURLWithPath: path).standardizedFileURL.path

        var relativeTail: String?
        if standardized == base {
            relativeTail = ""
        } else if standardized.hasPrefix(base + "/") {
            relativeTail = String(standardized.dropFirst(base.count + 1))
        } else if standardized.contains("/Containers/Data/Application/"),
            let marker = standardized.range(of: "/Documents", options: .backwards)
        {
            let tail = standardized[marker.upperBound...]
            if tail.isEmpty {
                relativeTail = ""
            } else if tail.hasPrefix("/") {
                relativeTail = String(tail.dropFirst())
            }
        }
        guard let relativeTail else { return nil }

        let appName =
            (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
            ?? (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String)
            ?? "Storyteller"
        var components = ["On My \(UIDevice.current.model)", appName]
        components.append(contentsOf: relativeTail.split(separator: "/").map(String.init))
        return components.joined(separator: " › ")
        #else
        return nil
        #endif
    }
}

public struct StorytellerServerSettingsView: View {
    @State private var sources: [BookSourceRecord] = []
    @State private var sourceURLs: [BookSourceID: String] = [:]
    @State private var isLoading = false
    @State private var showingAddServer = false
    #if os(macOS)
    @State private var editingSource: BookSourceRecord?
    #endif

    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif

    public init() {}

    public var body: some View {
        Form {
            Section {
                Text(
                    "Book sources are where Storyteller acquires books, such as a local folder or a remote Storyteller server."
                )
                .foregroundStyle(.secondary)
            }

            Section("Book Sources") {
                if isLoading && sources.isEmpty {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Loading Sources")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(sources) { source in
                        #if os(macOS)
                        Button {
                            editingSource = source
                        } label: {
                            sourceRow(for: source)
                        }
                        .buttonStyle(.plain)
                        #else
                        NavigationLink {
                            BookSourceEditorView(source: source) {
                                await loadSources()
                            }
                        } label: {
                            sourceRow(for: source)
                        }
                        #endif
                    }
                }

                Button {
                    showingAddServer = true
                } label: {
                    Label("Add Book Source", systemImage: "plus")
                }
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .modifier(SoftScrollEdgeModifier())
        .frame(maxWidth: 700)
        .frame(maxWidth: .infinity, alignment: .center)
        .navigationTitle("Book Sources")
        .task {
            await loadSources()
        }
        .sheet(isPresented: $showingAddServer) {
            NavigationStack {
                BookSourceEditorView(source: nil) {
                    await loadSources()
                }
            }
        }
        #if os(macOS)
        .sheet(item: $editingSource) { source in
            NavigationStack {
                BookSourceEditorView(source: source) {
                    await loadSources()
                }
            }
        }
        #endif
    }

    private func loadSources() async {
        await MainActor.run {
            isLoading = true
        }
        let loadedSources = await BookServiceActor.shared.bookSources
        var urls: [BookSourceID: String] = [:]
        for source in loadedSources where source.kind == .storyteller {
            if let credentials = await BookServiceActor.shared.credentials(for: source.id) {
                urls[source.id] = credentials.url
            }
        }
        await MainActor.run {
            sources = loadedSources
            sourceURLs = urls
            isLoading = false
        }
    }

    private func sourceRow(for source: BookSourceRecord) -> some View {
        Label {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(source.name)
                    Text(sourceDetail(for: source))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                #if os(macOS)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                #endif
            }
        } icon: {
            Image(systemName: iconName(for: source.kind))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func sourceDetail(for source: BookSourceRecord) -> String {
        switch source.kind {
            case .storyteller:
                return sourceURLs[source.id] ?? "No URL saved"
            case .localFolder:
                guard let storagePath = source.storagePath else { return "No folder selected" }
                return FolderPathDisplay.filesAppLocation(for: storagePath) ?? storagePath
        }
    }

    private func iconName(for kind: BookSourceKind) -> String {
        switch kind {
            case .storyteller:
                return "server.rack"
            case .localFolder:
                return "folder"
        }
    }
}

struct BookSourceEditorView: View {
    let source: BookSourceRecord?
    let onSaved: () async -> Void

    @State private var kind: BookSourceKind = .storyteller
    @State private var name = ""
    @State private var serverURL = ""
    @State private var username = ""
    @State private var folderPath = ""
    @State private var folderBookmarkData: Data?
    @State private var originalFolderPath = ""
    @State private var originalFolderBookmarkData: Data?
    @State private var sessionToken: String?
    @State private var isBrowserSigningIn = false
    @State private var hasLoadedCredentials = false
    @State private var hasSavedCredentials = false
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var showingFolderImporter = false
    @State private var connectionStatus: ConnectionTestStatus = .notTested
    @State private var showRemoveDataConfirmation = false

    @Environment(\.dismiss) private var dismiss

    init(source: BookSourceRecord?, onSaved: @escaping () async -> Void) {
        self.source = source
        self.onSaved = onSaved

        let initialKind = source?.kind ?? .storyteller
        _kind = State(initialValue: initialKind)
        _name = State(initialValue: source?.name ?? Self.defaultName(for: initialKind))
        _folderPath = State(initialValue: source?.storagePath ?? "")
        _folderBookmarkData = State(initialValue: source?.storageBookmarkData)
        _originalFolderPath = State(initialValue: source?.storagePath ?? "")
        _originalFolderBookmarkData = State(initialValue: source?.storageBookmarkData)
    }

    private enum ConnectionTestStatus: Equatable {
        case notTested
        case testing
        case success
        case failure(String)
    }

    private var sourceID: BookSourceID? {
        source?.id
    }

    private var isExistingSource: Bool {
        source != nil
    }

    private var canSave: Bool {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !isLoading else {
            return false
        }
        switch kind {
            case .storyteller:
                return !serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && sessionToken != nil
            case .localFolder:
                return !folderPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private var hasFolderChanges: Bool {
        folderPath != originalFolderPath || folderBookmarkData != originalFolderBookmarkData
    }

    var body: some View {
        Form {
            Section {
                Picker("Type", selection: $kind) {
                    Text(BookSourceKind.storyteller.displayName).tag(BookSourceKind.storyteller)
                    Text(BookSourceKind.localFolder.displayName).tag(BookSourceKind.localFolder)
                }
                .disabled(isExistingSource)
                .onChange(of: kind) { _, newKind in
                    guard !isExistingSource else { return }
                    name = defaultName(for: newKind)
                }

                TextField("Name", text: $name)
                    .textContentType(.name)

                switch kind {
                    case .storyteller:
                        TextField(
                            "Server URL",
                            text: $serverURL,
                            prompt: Text(verbatim: "https://my.example.com")
                                .foregroundStyle(.secondary),
                        )
                        .textContentType(.URL)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        #endif
                        .help("e.g., https://storyteller.example.com")

                        browserSignInRow

                        if sessionToken != nil {
                            LabeledContent("Signed in as", value: username)
                        }
                    case .localFolder:
                        HStack {
                            if let filesLocation = FolderPathDisplay.filesAppLocation(
                                for: folderPath
                            ) {
                                Text(filesLocation)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else {
                                TextField("Folder", text: $folderPath)
                                    .textContentType(.URL)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }

                            if hasFolderChanges {
                                Button {
                                    folderPath = originalFolderPath
                                    folderBookmarkData = originalFolderBookmarkData
                                } label: {
                                    Image(systemName: "arrow.uturn.backward")
                                }
                                .buttonStyle(.borderless)
                                .help("Revert folder")
                            }

                            #if os(macOS)
                            if isExistingSource {
                                Button {
                                    revealFolderInFinder()
                                } label: {
                                    Image(systemName: "magnifyingglass")
                                }
                                .buttonStyle(.borderless)
                                .help("Show in Finder")
                                .disabled(
                                    folderPath.trimmingCharacters(in: .whitespacesAndNewlines)
                                        .isEmpty
                                )
                            }
                            #endif

                            Button {
                                showingFolderImporter = true
                            } label: {
                                Image(systemName: isExistingSource ? "pencil" : "folder")
                            }
                            .buttonStyle(.borderless)
                            .help("Choose folder")
                        }
                        .fileImporter(
                            isPresented: $showingFolderImporter,
                            allowedContentTypes: [.folder],
                            allowsMultipleSelection: false,
                        ) { result in
                            if case .success(let urls) = result, let url = urls.first {
                                setFolderURL(url)
                            }
                        }
                }
            } header: {
                Text("Source Configuration")
            } footer: {
                if kind == .localFolder {
                    addFilesHelpButton
                        .font(.body)
                }
            }

            #if os(iOS)
            Section {
                actionRowButton(
                    title: primaryActionTitle,
                    isDisabled: !canSave,
                    status: saveStatusIcon,
                ) {
                    await saveSource()
                }

                if kind == .storyteller {
                    actionRowButton(
                        title: "Test Connection",
                        isDisabled: isLoading || !canSave,
                        status: connectionStatusIcon,
                    ) {
                        await testConnection()
                    }
                }

                if isExistingSource {
                    Button(role: .destructive) {
                        showRemoveDataConfirmation = true
                    } label: {
                        Label(removeActionTitle, systemImage: "trash")
                            .foregroundStyle(.red)
                    }
                    .disabled(isLoading)
                }
            }
            #endif

            if case .failure(let message) = connectionStatus {
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .font(.title2)
                        failureMessage(message)
                    }
                }
            }

            if let sourceID {
                Section("Details") {
                    LabeledContent("Source ID", value: sourceID)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .modifier(SoftScrollEdgeModifier())
        #if os(macOS)
        .frame(minWidth: 640, idealWidth: 660, maxWidth: 700, minHeight: 480)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            macActionBar
        }
        #else
        .frame(maxWidth: 600)
        .frame(maxWidth: .infinity, alignment: .center)
        #endif
        .navigationTitle(isExistingSource ? name : "Add Book Source")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            #if os(iOS)
            if !isExistingSource {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            #endif
        }
        .alert(removeConfirmationTitle, isPresented: $showRemoveDataConfirmation) {
            Button(removeActionTitle, role: .destructive) {
                Task {
                    await removeSource()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(removeConfirmationMessage)
        }
        .task {
            await loadExistingSource()
        }
    }

    #if os(macOS)
    private var macActionBar: some View {
        VStack(spacing: 0) {
            Divider()
            HStack {
                if isExistingSource {
                    Button(role: .destructive) {
                        showRemoveDataConfirmation = true
                    } label: {
                        Label(removeActionTitle, systemImage: "trash")
                            .foregroundStyle(.red)
                            .lineLimit(1)
                            .fixedSize()
                    }
                    .disabled(isLoading)
                }

                if shouldShowConnectionStatus {
                    connectionStatusView
                }

                Spacer()

                Button(isExistingSource ? "Close" : "Cancel") {
                    dismiss()
                }

                if kind == .storyteller {
                    Button("Test Connection") {
                        Task {
                            await testConnection()
                        }
                    }
                    .disabled(isLoading || !canSave)
                }

                Button(primaryActionTitle) {
                    Task {
                        await saveSource()
                    }
                }
                .disabled(!canSave)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(.bar)
    }
    #endif

    private var addFilesHelpButton: some View {
        LocalFolderSourceHelpButton(title: "How do I add files to this source?")
    }

    @ViewBuilder
    private var browserSignInRow: some View {
        Button {
            Task {
                await signInWithBrowser()
            }
        } label: {
            HStack {
                Label(
                    sessionToken == nil
                        ? "Sign In with Browser" : "Sign In Again with Browser",
                    systemImage: "safari",
                )
                .foregroundStyle(browserSignInEnabled ? Color.accentColor : Color.secondary)
                Spacer()
                if isBrowserSigningIn {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!browserSignInEnabled)
        .help("Sign in through your server's web login, including any single sign-on providers")
    }

    private var browserSignInEnabled: Bool {
        !isBrowserSigningIn && !isLoading
            && !serverURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func signInWithBrowser() async {
        await MainActor.run {
            isBrowserSigningIn = true
            connectionStatus = .notTested
        }

        do {
            let result = try await BrowserSignInSession.signIn(serverURL: serverURL)
            await MainActor.run {
                serverURL = result.serverURL
                username = result.username
                sessionToken = result.sessionToken
                isBrowserSigningIn = false
            }
            await saveSource()
        } catch StorytellerBrowserLogin.LoginError.cancelled {
            await MainActor.run {
                isBrowserSigningIn = false
            }
        } catch {
            await MainActor.run {
                isBrowserSigningIn = false
                connectionStatus = .failure(
                    error.localizedDescription
                )
            }
        }
    }

    private var primaryActionTitle: String {
        switch kind {
            case .storyteller:
                return isExistingSource ? "Save & Connect" : "Add Server"
            case .localFolder:
                return isExistingSource ? "Save Folder Source" : "Add Folder Source"
        }
    }

    private var removeActionTitle: String {
        switch kind {
            case .storyteller:
                return "Remove Server"
            case .localFolder:
                return "Remove Folder Source"
        }
    }

    private var removeConfirmationTitle: String {
        switch kind {
            case .storyteller:
                return "Remove this server?"
            case .localFolder:
                return "Remove this folder source?"
        }
    }

    private var removeConfirmationMessage: String {
        switch kind {
            case .storyteller:
                return
                    "This will delete saved credentials, cached metadata, downloaded media, and covers for books from this server."
            case .localFolder:
                return
                    "This removes the source from Storyteller. Files in the selected folder are not deleted."
        }
    }

    private var shouldShowConnectionStatus: Bool {
        connectionStatus != .notTested
    }

    @ViewBuilder
    private func actionRowButton(
        title: String,
        isDisabled: Bool,
        status: some View,
        action: @escaping () async -> Void,
    ) -> some View {
        Button {
            Task {
                await action()
            }
        } label: {
            HStack {
                Text(title)
                Spacer()
                status
            }
            .contentShape(Rectangle())
        }
        .disabled(isDisabled)
    }

    @ViewBuilder
    private var saveStatusIcon: some View {
        if isSaving {
            ProgressView()
                .controlSize(.small)
        } else if isLoading {
            EmptyView()
        } else if hasSavedCredentials {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }

    @ViewBuilder
    private var connectionStatusIcon: some View {
        switch connectionStatus {
            case .notTested:
                EmptyView()
            case .testing:
                if isSaving {
                    EmptyView()
                } else {
                    ProgressView()
                        .controlSize(.small)
                }
            case .success:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .failure:
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
        }
    }

    @ViewBuilder
    private var connectionStatusView: some View {
        switch connectionStatus {
            case .notTested:
                EmptyView()
            case .testing:
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Connecting…")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            case .success:
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Connected")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
            case .failure:
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    Text("Failed")
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .fixedSize()
                }
        }
    }

    @ViewBuilder
    private func failureMessage(_ message: String) -> some View {
        if message.lowercased().contains("credentials") {
            Text("This sign in is no longer valid. Sign in with your browser again.")
                .font(.body)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(message)
                    .font(.body)
                Text("If you just allowed local network access, try connecting again.")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func loadExistingSource() async {
        guard !hasLoadedCredentials else { return }
        hasLoadedCredentials = true

        await MainActor.run {
            let sourceKind = source?.kind ?? .storyteller
            kind = sourceKind
            name = source?.name ?? defaultName(for: sourceKind)
            folderPath = source?.storagePath ?? ""
            folderBookmarkData = source?.storageBookmarkData
            originalFolderPath = source?.storagePath ?? ""
            originalFolderBookmarkData = source?.storageBookmarkData
        }

        guard let sourceID, source?.kind == .storyteller else { return }

        if let credentials = await BookServiceActor.shared.credentials(for: sourceID) {
            let savedSessionToken = await BookServiceActor.shared.sessionToken(for: sourceID)
            await MainActor.run {
                serverURL = credentials.url
                username = credentials.username
                sessionToken = savedSessionToken
                hasSavedCredentials = true
            }
        } else {
            await MainActor.run {
                hasSavedCredentials = false
            }
        }
    }

    private func saveSource() async {
        await MainActor.run {
            isLoading = true
            isSaving = true
            connectionStatus = kind == .storyteller ? .testing : .notTested
        }
        defer {
            Task { @MainActor in
                isSaving = false
            }
        }

        let configuration = BookSourceConfiguration(
            kind: kind,
            name: name,
            serverURL: serverURL,
            username: username,
            password: nil,
            sessionToken: sessionToken,
            storagePath: folderPath,
            storageBookmarkData: folderBookmarkData,
        )
        let savedSourceID: BookSourceID?
        if let sourceID {
            let updated = await BookServiceActor.shared.updateBookSource(
                id: sourceID,
                configuration: configuration,
            )
            savedSourceID = updated ? sourceID : nil
        } else {
            let record = await BookServiceActor.shared.createBookSource(configuration)
            savedSourceID = record?.id
        }

        guard let savedSourceID else {
            let message = await failureMessageForCurrentSource()
            await MainActor.run {
                isLoading = false
                connectionStatus = .failure(message)
            }
            return
        }

        await MainActor.run {
            hasSavedCredentials = true
            originalFolderPath = folderPath
            originalFolderBookmarkData = folderBookmarkData
        }
        await onSaved()

        guard kind == .storyteller else {
            await MainActor.run {
                isLoading = false
                dismiss()
            }
            return
        }

        let connected = await BookServiceActor.shared.connectBookSource(sourceID: savedSourceID)
        if connected {
            await MainActor.run {
                isLoading = false
                connectionStatus = .success
                dismiss()
            }
        } else {
            let message = await connectFailureMessage(sourceID: savedSourceID)
            await MainActor.run {
                isLoading = false
                connectionStatus = .failure(message)
            }
        }
    }

    private func connectFailureMessage(sourceID: BookSourceID) async -> String {
        let status = await BookServiceActor.shared.connectionStatus(sourceID: sourceID)
        if case .error(let message) = status {
            return message
        }
        return "Could not connect to this server."
    }

    private func testConnection() async {
        await MainActor.run {
            isLoading = true
            connectionStatus = .testing
        }

        guard let sourceID else {
            await MainActor.run {
                isLoading = false
                connectionStatus = .failure("Save this server before testing the connection.")
            }
            return
        }
        let connected = await BookServiceActor.shared.testBookSourceConnection(
            sourceID: sourceID
        )
        let message = connected ? nil : await connectFailureMessage(sourceID: sourceID)
        await MainActor.run {
            isLoading = false
            connectionStatus =
                connected ? .success : .failure(message ?? "Could not connect to this server.")
        }
    }

    private func removeSource() async {
        guard let sourceID else { return }

        await MainActor.run {
            isLoading = true
        }

        let success = await BookServiceActor.shared.removeBookSource(id: sourceID)
        if success {
            await onSaved()
            await MainActor.run {
                isLoading = false
                dismiss()
            }
        } else {
            await MainActor.run {
                isLoading = false
                connectionStatus = .failure("Failed to remove source.")
            }
        }
    }

    private func failureMessageForCurrentSource() async -> String {
        if kind == .localFolder {
            return
                "Could not save folder source. The selected folder may already belong to another source."
        }
        guard let sourceID else { return "Connection failed." }
        let storytellerStatus = await BookServiceActor.shared.connectionStatus(sourceID: sourceID)
        if case .error(let message) = storytellerStatus {
            return message
        }
        return "Connection failed."
    }

    private func setFolderURL(_ url: URL) {
        folderPath = url.path
        #if os(macOS)
        let didStartAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        folderBookmarkData = try? url.bookmarkData(
            options: [.withSecurityScope],
            includingResourceValuesForKeys: nil,
            relativeTo: nil,
        )
        #elseif os(iOS)
        let didStartAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        folderBookmarkData = try? url.bookmarkData(
            options: [],
            includingResourceValuesForKeys: nil,
            relativeTo: nil,
        )
        #else
        folderBookmarkData = nil
        #endif
    }

    #if os(macOS)
    private func revealFolderInFinder() {
        let trimmed = folderPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let url = URL(fileURLWithPath: trimmed, isDirectory: true)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }
    #endif

    private static func defaultName(for kind: BookSourceKind) -> String {
        switch kind {
            case .storyteller:
                return BookSourceKind.storyteller.defaultName
            case .localFolder:
                return BookSourceKind.localFolder.defaultName
        }
    }

    private func defaultName(for kind: BookSourceKind) -> String {
        Self.defaultName(for: kind)
    }
}

#endif
