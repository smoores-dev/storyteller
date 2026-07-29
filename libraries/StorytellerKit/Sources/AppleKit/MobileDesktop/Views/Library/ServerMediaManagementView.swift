#if os(macOS)
import SwiftUI
import AppKit
import UniformTypeIdentifiers

public struct ServerMediaManagementData: Codable, Hashable {
    public let bookId: BookID

    public init(bookId: BookID) {
        self.bookId = bookId
    }
}

public struct ServerMediaManagementView: View {
    let bookId: BookID
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openWindow) private var openWindow
    @Environment(MediaViewModel.self) private var mediaViewModel

    @State private var isUploading = false
    @State private var uploadingFormat: StorytellerBookFormat?
    @State private var showDeleteConfirmation = false
    @State private var showDeleteAssetConfirmation = false
    @State private var isDeleting = false
    @State private var deletingAssetFormat: StorytellerBookFormat?
    @State private var pendingDeleteAssetFormat: StorytellerBookFormat?
    @State private var isStartingAlignment = false
    @State private var isCancelingAlignment = false
    @State private var errorMessage: String?
    @State private var hoveredDownloadCategory: LocalMediaCategory?

    public init(bookId: BookID) {
        self.bookId = bookId
    }

    private var item: BookMetadata? {
        mediaViewModel.library.bookMetaData.first { $0.id == bookId }
    }

    private var isValidServerBook: Bool {
        guard item != nil else { return false }
        return mediaViewModel.isServerBook(bookId)
    }

    public var body: some View {
        VStack(spacing: 0) {
            if isValidServerBook, let item {
                headerView(item: item)
                Divider()

                Form {
                    Section("Local Downloads") {
                        localMediaRow(item: item, category: .ebook, label: "Ebook")
                        localMediaRow(item: item, category: .audio, label: "Audiobook")
                        localMediaRow(item: item, category: .synced, label: "Readaloud")
                    }

                    Section("Server Media") {
                        serverMediaRow(
                            item: item,
                            format: .ebook,
                            label: "Ebook",
                            asset: item.ebook,
                        )
                        serverMediaRow(
                            item: item,
                            format: .audiobook,
                            label: "Audiobook",
                            asset: item.audiobook,
                        )
                        serverReadaloudRow(item: item)
                    }

                }
                .formStyle(.grouped)
                .scrollDisabled(true)
                .scrollContentBackground(.hidden)

                if let error = errorMessage {
                    Divider()
                    errorView(message: error)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                }

                Divider()
                footerView(item: item)
            } else {
                invalidBookView
            }
        }
        .frame(width: 480, height: 520)
        .confirmationDialog(
            "Delete Book from Server?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible,
        ) {
            Button("Delete", role: .destructive) {
                if let item {
                    Task { await deleteBook(item: item) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "This will permanently delete the book and all its media from the server and remove any local downloads. This cannot be undone."
            )
        }
        .confirmationDialog(
            "Delete \(pendingDeleteAssetLabel) from Server?",
            isPresented: $showDeleteAssetConfirmation,
            titleVisibility: .visible,
        ) {
            Button("Delete", role: .destructive) {
                guard let format = pendingDeleteAssetFormat, let item else { return }
                pendingDeleteAssetFormat = nil
                Task { await deleteAsset(format: format, item: item) }
            }
            Button("Cancel", role: .cancel) {
                pendingDeleteAssetFormat = nil
            }
        } message: {
            Text(
                "This will permanently delete the \(pendingDeleteAssetLabel.lowercased()) file from the server. This cannot be undone."
            )
        }
    }

    private var invalidBookView: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text("This book is not from the server")
                    .font(.headline)
                Text("Server media management is only available for books synced from Storyteller.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
            Spacer()
            Divider()
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding()
        }
    }

    private func headerView(item: BookMetadata) -> some View {
        HStack(spacing: 12) {
            coverImage(item: item)
                .frame(width: 50, height: 75)
                .cornerRadius(4)
                .clipped()

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.headline)
                    .lineLimit(2)
                if let authors = item.authors, !authors.isEmpty {
                    Text(authors.compactMap(\.name).joined(separator: ", "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding()
    }

    @ViewBuilder
    private func localMediaRow(item: BookMetadata, category: LocalMediaCategory, label: String)
        -> some View
    {
        let isDownloaded = mediaViewModel.isCategoryDownloaded(category, for: item)
        let isDownloading = mediaViewModel.isCategoryDownloadInProgress(
            for: item,
            category: category,
        )
        let progress = mediaViewModel.downloadProgressFraction(for: item, category: category)
        let serverHasMedia = serverHasMedia(for: category, item: item)
        let isHovered = hoveredDownloadCategory == category
        let hasCachedMedia = mediaViewModel.hasCachedMedia(category, for: item)

        LabeledContent(label) {
            HStack(spacing: 16) {
                if isDownloading {
                    HStack(spacing: 6) {
                        if let progress {
                            ZStack {
                                Circle()
                                    .stroke(Color.blue.opacity(0.3), lineWidth: 2)
                                Circle()
                                    .trim(from: 0, to: progress)
                                    .stroke(Color.blue, lineWidth: 2)
                                    .rotationEffect(.degrees(-90))
                            }
                            .frame(width: 14, height: 14)
                        } else {
                            ProgressView()
                                .scaleEffect(0.5)
                        }
                        Text("Downloading...")
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer()

                    HStack(spacing: 12) {
                        Button {
                            mediaViewModel.cancelDownload(for: item, category: category)
                        } label: {
                            Image(systemName: isHovered ? "xmark.circle.fill" : "xmark.circle")
                        }
                        .buttonStyle(.plain)
                        .onHover { hovering in
                            hoveredDownloadCategory = hovering ? category : nil
                        }
                        .help("Cancel")
                    }
                } else if isDownloaded {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Downloaded")
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer()

                    if hasCachedMedia {
                        HStack(spacing: 12) {
                            Button {
                                mediaViewModel.deleteDownload(for: item, category: category)
                            } label: {
                                Image(systemName: "trash")
                                    .foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                            .help("Delete")
                        }
                    }
                } else if serverHasMedia {
                    HStack(spacing: 6) {
                        Image(systemName: "circle")
                            .foregroundStyle(.tertiary)
                        Text("Not downloaded")
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer()

                    HStack(spacing: 12) {
                        Button {
                            mediaViewModel.startDownload(for: item, category: category)
                        } label: {
                            Image(systemName: "icloud.and.arrow.down")
                        }
                        .buttonStyle(.plain)
                        .help("Download")
                    }
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: "xmark.circle")
                            .foregroundStyle(.tertiary)
                        Text("Not on server")
                    }
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func serverHasMedia(for category: LocalMediaCategory, item: BookMetadata) -> Bool {
        switch category {
            case .ebook:
                return item.ebook != nil && item.ebook?.isMissing != true
            case .audio:
                return item.audiobook != nil && item.audiobook?.isMissing != true
            case .synced:
                if let readaloud = item.readaloud {
                    return !readaloud.isMissing && readaloud.status?.uppercased() == "ALIGNED"
                }
                return false
        }
    }

    @ViewBuilder
    private func serverMediaRow(
        item: BookMetadata,
        format: StorytellerBookFormat,
        label: String,
        asset: BookAsset?,
    ) -> some View {
        let isUploadingThis = isUploading && uploadingFormat == format
        let isDeletingThis = deletingAssetFormat == format
        let types: [UTType] = format == .ebook ? [.epub] : audioTypes
        let isBusy = isUploading || isDeleting || deletingAssetFormat != nil

        LabeledContent(label) {
            HStack(spacing: 16) {
                Group {
                    if isUploadingThis {
                        HStack(spacing: 6) {
                            ProgressView()
                                .progressViewStyle(ThinCircularProgressViewStyle())
                            Text("Uploading...")
                        }
                    } else if isDeletingThis {
                        HStack(spacing: 6) {
                            ProgressView()
                                .progressViewStyle(ThinCircularProgressViewStyle())
                            Text("Deleting...")
                        }
                    } else if let asset {
                        if asset.isMissing {
                            HStack(spacing: 6) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.yellow)
                                Text("Missing")
                            }
                        } else {
                            HStack(spacing: 6) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                Text("Available")
                            }
                        }
                    } else {
                        HStack(spacing: 6) {
                            Image(systemName: "circle")
                                .foregroundStyle(.tertiary)
                            Text("Not on server")
                        }
                    }
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()

                HStack(spacing: 12) {
                    if asset != nil {
                        Button {
                            requestDeleteAsset(format: format)
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.red)
                        .disabled(isBusy)
                        .help("Delete")
                    }

                    Button {
                        selectAndUploadFile(format: format, types: types, item: item)
                    } label: {
                        Image(systemName: "icloud.and.arrow.up")
                    }
                    .buttonStyle(.plain)
                    .disabled(isBusy)
                    .help(asset != nil ? "Replace" : "Upload")
                }
            }
        }
    }

    @ViewBuilder
    private func serverReadaloudRow(item: BookMetadata) -> some View {
        let isUploadingThis = isUploading && uploadingFormat == .readaloud
        let isDeletingThis = deletingAssetFormat == .readaloud
        let isBusy = isUploading || isDeleting || deletingAssetFormat != nil

        LabeledContent("Readaloud") {
            HStack(spacing: 16) {
                readaloudStatusView(
                    item: item,
                    isUploadingThis: isUploadingThis,
                    isDeletingThis: isDeletingThis,
                )
                .frame(maxWidth: .infinity, alignment: .leading)

                Spacer()

                readaloudActionsView(item: item, isBusy: isBusy)
            }
        }
    }

    @ViewBuilder
    private func readaloudStatusView(
        item: BookMetadata,
        isUploadingThis: Bool,
        isDeletingThis: Bool,
    ) -> some View {
        if isUploadingThis {
            HStack(spacing: 6) {
                ProgressView()
                    .progressViewStyle(ThinCircularProgressViewStyle())
                Text("Uploading...")
            }
            .foregroundStyle(.secondary)
        } else if isDeletingThis {
            HStack(spacing: 6) {
                ProgressView()
                    .progressViewStyle(ThinCircularProgressViewStyle())
                Text("Deleting...")
            }
            .foregroundStyle(.secondary)
        } else if let readaloud = item.readaloud {
            if readaloud.isMissing {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("Missing")
                }
                .foregroundStyle(.secondary)
            } else if let status = readaloud.status?.uppercased() {
                switch status {
                    case "ALIGNED":
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text("Available")
                        }
                        .foregroundStyle(.secondary)
                    case "PROCESSING":
                        HStack(spacing: 6) {
                            ProgressView()
                                .progressViewStyle(ThinCircularProgressViewStyle())
                            if let stage = readaloud.currentStage,
                                let progress = readaloud.stageProgress
                            {
                                Text("\(stage): \(Int(progress * 100))%")
                                    .lineLimit(1)
                            } else {
                                Text("Processing...")
                            }
                        }
                        .foregroundStyle(.secondary)
                    case "QUEUED":
                        HStack(spacing: 6) {
                            Image(systemName: "clock")
                                .foregroundStyle(.orange)
                            if let pos = readaloud.queuePosition {
                                Text("Queued (#\(pos))")
                            } else {
                                Text("Queued")
                            }
                        }
                        .foregroundStyle(.secondary)
                    case "ERROR", "STOPPED":
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red)
                            Text(status.capitalized)
                        }
                        .foregroundStyle(.secondary)
                    default:
                        HStack(spacing: 6) {
                            Image(systemName: "questionmark.circle")
                            Text(status)
                        }
                        .foregroundStyle(.secondary)
                }
            } else {
                HStack(spacing: 6) {
                    Image(systemName: "questionmark.circle")
                    Text("Unknown")
                }
                .foregroundStyle(.secondary)
            }
        } else if canStartAlignment(item: item) {
            HStack(spacing: 6) {
                Image(systemName: "circle")
                    .foregroundStyle(.tertiary)
                Text("Not aligned")
            }
            .foregroundStyle(.secondary)
        } else {
            HStack(spacing: 6) {
                Image(systemName: "circle")
                    .foregroundStyle(.tertiary)
                Text("Not on server")
            }
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func readaloudActionsView(item: BookMetadata, isBusy: Bool) -> some View {
        let readaloud = item.readaloud
        let status = readaloud?.status?.uppercased()
        let isProcessingOrQueued = status == "PROCESSING" || status == "QUEUED"
        let isErrorOrStopped = status == "ERROR" || status == "STOPPED"
        let hasReadaloud = readaloud != nil

        HStack(spacing: 12) {
            if isProcessingOrQueued {
                Button {
                    Task { await cancelAlignment(item: item) }
                } label: {
                    if isCancelingAlignment {
                        ProgressView()
                            .progressViewStyle(ThinCircularProgressViewStyle())
                    } else {
                        Image(systemName: "xmark.circle")
                    }
                }
                .buttonStyle(.plain)
                .disabled(isCancelingAlignment)
                .help("Cancel alignment")
            } else if isErrorOrStopped {
                alignmentMenu(item: item, restart: .full, isBusy: isBusy)

                Button {
                    selectAndUploadFile(format: .readaloud, types: [.epub], item: item)
                } label: {
                    Image(systemName: "icloud.and.arrow.up")
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .help("Upload")
            } else if canStartAlignment(item: item) && !hasReadaloud {
                alignmentMenu(item: item, restart: .none, isBusy: isBusy)

                Button {
                    selectAndUploadFile(format: .readaloud, types: [.epub], item: item)
                } label: {
                    Image(systemName: "icloud.and.arrow.up")
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .help("Upload")
            } else if hasReadaloud {
                Button {
                    requestDeleteAsset(format: .readaloud)
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.red)
                .disabled(isBusy)
                .help("Delete")

                Button {
                    selectAndUploadFile(format: .readaloud, types: [.epub], item: item)
                } label: {
                    Image(systemName: "icloud.and.arrow.up")
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .help("Replace")
            } else {
                Button {
                    selectAndUploadFile(format: .readaloud, types: [.epub], item: item)
                } label: {
                    Image(systemName: "icloud.and.arrow.up")
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .help("Upload")
            }
        }
    }

    @ViewBuilder
    private func alignmentMenu(item: BookMetadata, restart: AlignmentRestartMode, isBusy: Bool)
        -> some View
    {
        Menu {
            Button {
                Task { await startAlignment(item: item, restart: restart) }
            } label: {
                Label("Create on Server", systemImage: "server.rack")
            }
            .disabled(isStartingAlignment || isBusy)

            Button {
                if let data = LocalReadaloudAlignmentLauncher.data(
                    for: item,
                    mediaViewModel: mediaViewModel,
                ) {
                    openWindow(id: "ReadaloudGenerator", value: data)
                }
            } label: {
                Label("Create Locally", systemImage: "desktopcomputer")
            }
            .disabled(isStartingAlignment || isBusy)
        } label: {
            if isStartingAlignment {
                ProgressView()
                    .progressViewStyle(ThinCircularProgressViewStyle())
            } else {
                Image(systemName: "plus")
            }
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(restart != .none ? "Restart alignment" : "Start alignment")
    }

    private func footerView(item: BookMetadata) -> some View {
        HStack {
            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                HStack(spacing: 4) {
                    if isDeleting {
                        ProgressView().scaleEffect(0.5)
                    }
                    Text("Delete from Server")
                }
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .disabled(isDeleting || isUploading)

            Spacer()

            Button("Done") { dismiss() }
                .keyboardShortcut(.defaultAction)
        }
        .padding()
    }

    private func errorView(message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            Text(message)
                .foregroundStyle(.red)
            Spacer()
            Button("Dismiss") { errorMessage = nil }
        }
    }

    private var audioTypes: [UTType] {
        [
            UTType(filenameExtension: "m4b")!,
            UTType(filenameExtension: "m4a")!,
            .mp3,
            UTType(filenameExtension: "flac"),
            .zip,
        ].compactMap { $0 }
    }

    @ViewBuilder
    private func coverImage(item: BookMetadata) -> some View {
        if let image = mediaViewModel.coverImage(for: item, variant: .standard) {
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            Rectangle()
                .fill(.quaternary)
                .overlay {
                    Image(systemName: "book.closed.fill")
                        .font(.title)
                        .foregroundStyle(.secondary)
                }
        }
    }

    private func canStartAlignment(item: BookMetadata) -> Bool {
        let hasEbook = item.ebook != nil && item.ebook?.isMissing != true
        let hasAudiobook = item.audiobook != nil && item.audiobook?.isMissing != true
        let noReadaloud = item.readaloud == nil
        return hasEbook && hasAudiobook && noReadaloud
    }

    private func canRestartAlignment(item: BookMetadata) -> Bool {
        guard let readaloud = item.readaloud else { return false }
        let status = readaloud.status?.uppercased() ?? ""
        return status == "ERROR" || status == "STOPPED"
    }

    private func isAlignmentInProgress(item: BookMetadata) -> Bool {
        guard let readaloud = item.readaloud else { return false }
        let status = readaloud.status?.uppercased() ?? ""
        return status == "PROCESSING" || status == "QUEUED"
    }

    private var pendingDeleteAssetLabel: String {
        switch pendingDeleteAssetFormat {
            case .ebook:
                return "Ebook"
            case .audiobook:
                return "Audiobook"
            case .readaloud:
                return "Readaloud"
            case .none:
                return "Media"
        }
    }

    private func requestDeleteAsset(format: StorytellerBookFormat) {
        pendingDeleteAssetFormat = format
        showDeleteAssetConfirmation = true
    }

    private func selectAndUploadFile(
        format: StorytellerBookFormat,
        types: [UTType],
        item: BookMetadata,
    ) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = types
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Select file to upload"

        guard panel.runModal() == .OK, let url = panel.url else { return }

        Task {
            await uploadFile(url: url, format: format, item: item)
        }
    }

    private func hasExistingAsset(format: StorytellerBookFormat, item: BookMetadata) -> Bool {
        switch format {
            case .ebook:
                return item.ebook != nil
            case .audiobook:
                return item.audiobook != nil
            case .readaloud:
                return item.readaloud != nil
        }
    }

    private func uploadFile(url: URL, format: StorytellerBookFormat, item: BookMetadata) async {
        isUploading = true
        uploadingFormat = format
        errorMessage = nil

        do {
            let data = try Data(contentsOf: url)
            let asset = StorytellerUploadAsset(
                format: format,
                filename: url.lastPathComponent,
                data: data,
            )

            let isReplace = hasExistingAsset(format: format, item: item)

            let result = await BookServiceActor.shared.replaceBookAsset(
                asset,
                bookID: item.id,
                replaceMetadata: false,
            )
            switch result {
                case .success:
                    break
                case .notSupported:
                    errorMessage = "Server does not support this operation yet"
                case .failed:
                    errorMessage = isReplace ? "Replace failed" : "Upload failed"
            }

            await refreshBookMetadata()
        } catch {
            errorMessage = "Failed to read file: \(error.localizedDescription)"
        }

        isUploading = false
        uploadingFormat = nil
    }

    private func startAlignment(item: BookMetadata, restart: AlignmentRestartMode) async {
        isStartingAlignment = true
        errorMessage = nil

        let success = await BookServiceActor.shared.startAlignment(
            for: item.id,
            restart: restart,
        )
        if !success {
            errorMessage = "Failed to start alignment"
        }

        await refreshBookMetadata()
        isStartingAlignment = false
    }

    private func cancelAlignment(item: BookMetadata) async {
        isCancelingAlignment = true
        errorMessage = nil

        let success = await BookServiceActor.shared.cancelAlignment(
            for: item.id
        )
        if !success {
            errorMessage = "Failed to cancel alignment"
        }

        await refreshBookMetadata()
        isCancelingAlignment = false
    }

    private func deleteAsset(format: StorytellerBookFormat, item: BookMetadata) async {
        deletingAssetFormat = format
        errorMessage = nil

        let result = await BookServiceActor.shared.deleteBookAsset(
            item.id,
            type: format,
        )
        switch result {
            case .success:
                break
            case .notSupported:
                errorMessage = "Server does not support deleting media yet"
            case .failed:
                errorMessage = "Failed to delete \(format.rawValue)"
        }

        deletingAssetFormat = nil
    }

    private func deleteBook(item: BookMetadata) async {
        isDeleting = true
        errorMessage = nil

        let success = await BookServiceActor.shared.deleteBook(item.id)
        await refreshBookMetadata()

        if success {
            dismiss()
        } else {
            errorMessage = "Failed to delete book from server"
            isDeleting = false
        }
    }

    private func refreshBookMetadata() async {
        _ = await BookServiceActor.shared.fetchLibraryInformation()
    }
}
#endif
