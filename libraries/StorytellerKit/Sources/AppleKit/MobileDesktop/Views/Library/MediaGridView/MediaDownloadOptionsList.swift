#if os(iOS) || os(macOS)
import SwiftUI

struct MediaDownloadOptionsList: View {
    let item: BookMetadata
    private let options: [MediaDownloadOption]
    private let onAction: (() -> Void)?

    init(
        item: BookMetadata,
        options: [MediaDownloadOption]? = nil,
        onAction: (() -> Void)? = nil,
    ) {
        self.item = item
        self.options = options ?? MediaGridViewUtilities.mediaDownloadOptions(for: item)
        self.onAction = onAction
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(options) { option in
                MediaDownloadOptionRow(item: item, option: option, onAction: onAction)
            }
            if item.canShowCreateReadaloud {
                CreateReadaloudRow(item: item)
            }
        }
    }
}

struct CreateReadaloudRow: View {
    let item: BookMetadata
    @State private var isStartingAlignment = false
    @State private var isCancelingAlignment = false
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var readaloudStatus: String? {
        item.readaloud?.status?.uppercased()
    }

    private var isProcessingOrQueued: Bool {
        readaloudStatus == "PROCESSING" || readaloudStatus == "QUEUED"
    }

    private var isErrorOrStopped: Bool {
        readaloudStatus == "ERROR" || readaloudStatus == "STOPPED"
    }

    private var canCreateOnServer: Bool {
        mediaViewModel.isServerBook(item.id)
    }

    private var canCreateLocally: Bool {
        mediaViewModel.isServerBook(item.id) || mediaViewModel.isLocalFolderBook(item.id)
    }

    private var hasAvailableActions: Bool {
        canCreateOnServer || canCreateLocally
    }

    var body: some View {
        if !hasAvailableActions {
            EmptyView()
        } else if isProcessingOrQueued {
            processingRow
        } else {
            menuRow
        }
    }

    private var rowBackground: some View {
        RoundedRectangle(cornerRadius: 10)
            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: isProcessingOrQueued ? [] : [5]))
            .foregroundStyle(Color.secondary.opacity(0.3))
            .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }

    private var processingRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image("readalong")
                        .renderingMode(.template)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 20, height: 20)
                        .foregroundStyle(.green)
                    Text("Creating Readaloud...")
                        .foregroundStyle(.green)
                }
                .font(.body)

                Spacer()

                cancelButton
            }

            progressStatusView
                .padding(.leading, 28)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(rowBackground)
    }

    private var menuRow: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image("readalong")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 20, height: 20)
                    .foregroundColor(.green)
                Text("Create Readaloud")
                    .foregroundStyle(.green)
            }
            .font(.body)

            Spacer()

            if isErrorOrStopped {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.red)
                    Text(readaloudStatus?.capitalized ?? "Error")
                        .foregroundStyle(.secondary)
                }
                .font(.body)
            }

            createMenu
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(rowBackground)
    }

    @ViewBuilder
    private var progressStatusView: some View {
        Group {
            if let readaloud = item.readaloud {
                if let stage = readaloud.currentStage, let progress = readaloud.stageProgress {
                    Text("\(stage): \(Int(progress * 100))%")
                } else if let pos = readaloud.queuePosition {
                    Text("Queued (#\(pos))")
                } else if readaloudStatus == "QUEUED" {
                    Text("Queued")
                } else {
                    Text("Processing...")
                }
            }
        }
        .foregroundStyle(.secondary)
        .font(.caption)
    }

    @ViewBuilder
    private var createMenu: some View {
        ZStack {
            if isStartingAlignment {
                ProgressView()
                    .progressViewStyle(ThinCircularProgressViewStyle())
            } else {
                Image(systemName: "plus.circle")
                    .imageScale(.large)
            }

            Menu {
                if canCreateOnServer {
                    Button {
                        Task {
                            isStartingAlignment = true
                            _ = await BookServiceActor.shared.startAlignment(
                                for: item.id,
                                restart: isErrorOrStopped ? .full : .none,
                            )
                            await BookServiceActor.shared.fetchLibraryInformation()
                            isStartingAlignment = false
                        }
                    } label: {
                        Label("Create on Server", systemImage: "server.rack")
                    }
                    .disabled(isStartingAlignment)
                }

                if canCreateLocally {
                    Button {
                        if let data = LocalReadaloudAlignmentLauncher.data(
                            for: item,
                            mediaViewModel: mediaViewModel,
                        ) {
                            openReadaloudGenerator(data)
                        }
                    } label: {
                        Label("Create Locally", systemImage: "desktopcomputer")
                    }
                    .disabled(isStartingAlignment)
                }
            } label: {
                Color.clear
            }
            #if os(macOS)
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            #endif
        }
    }

    private func openReadaloudGenerator(_ data: ReadaloudGeneratorData) {
        #if os(macOS)
        openWindow(id: "ReadaloudGenerator", value: data)
        #else
        NotificationCenter.default.post(name: .storytellerCreateReadaloud, object: data)
        #endif
    }

    @ViewBuilder
    private var cancelButton: some View {
        Button {
            Task {
                isCancelingAlignment = true
                _ = await BookServiceActor.shared.cancelAlignment(
                    for: item.id
                )
                await BookServiceActor.shared.fetchLibraryInformation()
                isCancelingAlignment = false
            }
        } label: {
            if isCancelingAlignment {
                ProgressView()
                    .progressViewStyle(ThinCircularProgressViewStyle())
            } else {
                Image(systemName: "xmark.circle")
                    .imageScale(.large)
            }
        }
        .buttonStyle(.plain)
        .disabled(isCancelingAlignment)
    }
}

struct MediaDownloadOptionRow: View {
    let item: BookMetadata
    let option: MediaDownloadOption
    let onAction: (() -> Void)?
    @Environment(MediaViewModel.self) private var mediaViewModel
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif

    @State private var showConnectionAlert = false
    @State private var isHovered = false
    @State private var isDownloadAreaHovered = false

    private var hasConnectionError: Bool {
        mediaViewModel.hasConnectionError(forSourceID: item.sourceID)
    }

    private var sourceStatus: ConnectionStatus {
        mediaViewModel.connectionStatus(forSourceID: item.sourceID)
    }

    private var isAuthError: Bool {
        if case .error = sourceStatus { return true }
        return false
    }

    private var connectionAlertTitle: String {
        isAuthError ? "Connection Error" : "Server Not Connected"
    }

    private var connectionAlertMessage: String {
        if case .error(let message) = sourceStatus {
            return
                "Unable to download: \(message). Please check your server credentials in Settings."
        }
        return
            "Cannot download media while disconnected from the server. Please check your connection and try again."
    }

    var body: some View {
        #if os(iOS)
        VStack(spacing: 0) {
            if mediaViewModel.isCategoryDownloaded(option.category, for: item) {
                downloadedControls
            } else {
                downloadControls
            }
        }
        .alert(connectionAlertTitle, isPresented: $showConnectionAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(connectionAlertMessage)
        }
        #else
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Group {
                    switch option.iconType {
                        case .system(let name):
                            Image(systemName: name)
                                .font(.system(size: 16))
                        case .custom(let name):
                            Image(name)
                                .renderingMode(.template)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 24, height: 24)
                        case .readaloud:
                            Image("readalong")
                                .renderingMode(.template)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                    }
                }
                .frame(width: 20, height: 20)
                Text(option.title)
            }
            .font(.body)

            Spacer()

            if mediaViewModel.isCategoryDownloaded(option.category, for: item) {
                downloadedControls
            } else {
                downloadControls
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
        .onHover { hovering in
            isHovered = hovering
        }
        .alert(connectionAlertTitle, isPresented: $showConnectionAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(connectionAlertMessage)
        }
        #endif
    }

    private var isDownloadInProgress: Bool {
        mediaViewModel.isCategoryDownloadInProgress(for: item, category: option.category)
    }

    private var isDownloadFailed: Bool {
        !isDownloadInProgress
            && mediaViewModel.isCategoryDownloadFailed(for: item, category: option.category)
    }

    private func cancelDownload() {
        mediaViewModel.cancelDownload(for: item, category: option.category)
        onAction?()
    }

    @ViewBuilder
    private var downloadedControls: some View {
        let hasCachedMedia = mediaViewModel.hasCachedMedia(option.category, for: item)
        #if os(iOS)
        HStack(spacing: 8) {
            Button {
                PlayerPresenter.shared.present(makePlayerBookData())
            } label: {
                HStack(spacing: 10) {
                    Group {
                        switch option.iconType {
                            case .system(let name):
                                Image(systemName: name)
                            case .custom(let name):
                                Image(name)
                                    .renderingMode(.template)
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(width: 18, height: 18)
                            case .readaloud:
                                Image("readalong")
                                    .renderingMode(.template)
                                    .resizable()
                                    .aspectRatio(contentMode: .fit)
                                    .frame(width: 18, height: 18)
                        }
                    }
                    .font(.system(size: 16))
                    Text(option.openTitle)
                        .font(.body)
                        .fontWeight(.medium)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.green)
                .foregroundStyle(.white)
                .clipShape(.rect(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(option.openTitle)

            if hasCachedMedia {
                Button {
                    mediaViewModel.deleteDownload(for: item, category: option.category)
                } label: {
                    Image(systemName: "trash.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.red)
                        .clipShape(.rect(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.deleteTitle)
            }
        }
        #else
        HStack(spacing: 12) {
            Button {
                openMedia()
            } label: {
                Image(systemName: "play.fill")
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(option.openTitle)

            Button {
                mediaViewModel.openMediaFolder(for: item, category: option.category)
            } label: {
                Image(systemName: "folder")
                    .imageScale(.large)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Show \(option.title) in Finder")

            if hasCachedMedia {
                Button {
                    mediaViewModel.deleteDownload(for: item, category: option.category)
                } label: {
                    Image(systemName: "trash")
                        .imageScale(.large)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.deleteTitle)
            }
        }
        #endif
    }

    @ViewBuilder
    private var downloadControls: some View {
        #if os(iOS)
        HStack(spacing: 8) {
            if isDownloadFailed {
                Button {
                    mediaViewModel.startDownload(for: item, category: option.category)
                    onAction?()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 16))
                        Text("Retry \(option.downloadTitle)")
                            .font(.body)
                            .fontWeight(.medium)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.red)
                    .foregroundStyle(.white)
                    .clipShape(.rect(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Retry \(option.downloadTitle)")
            } else if !isDownloadInProgress {
                Button {
                    if hasConnectionError {
                        showConnectionAlert = true
                    } else {
                        mediaViewModel.startDownload(for: item, category: option.category)
                        onAction?()
                    }
                } label: {
                    HStack(spacing: 10) {
                        Group {
                            switch option.iconType {
                                case .system(let name):
                                    Image(systemName: name)
                                case .custom(let name):
                                    Image(name)
                                        .renderingMode(.template)
                                        .resizable()
                                        .aspectRatio(contentMode: .fit)
                                        .frame(width: 18, height: 18)
                                case .readaloud:
                                    Image("readalong")
                                        .renderingMode(.template)
                                        .resizable()
                                        .aspectRatio(contentMode: .fit)
                                        .frame(width: 18, height: 18)
                            }
                        }
                        .font(.system(size: 16))
                        Text(option.downloadTitle)
                            .font(.body)
                            .fontWeight(.medium)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(.rect(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(option.downloadTitle)
            } else {
                HStack(spacing: 10) {
                    if let fraction = mediaViewModel.downloadProgressFraction(
                        for: item,
                        category: option.category,
                    ) {
                        ProgressView(value: fraction, total: 1)
                            .progressViewStyle(.linear)
                            .tint(.white)
                            .frame(maxWidth: 60)
                    } else {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                            .scaleEffect(0.8)
                    }
                    Text("Downloading...")
                        .font(.body)
                        .fontWeight(.medium)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.blue.opacity(0.7))
                .foregroundStyle(.white)
                .clipShape(.rect(cornerRadius: 8))

                Button {
                    cancelDownload()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.red)
                        .clipShape(.rect(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cancel \(option.downloadTitle)")
            }
        }
        #else
        Button {
            if isDownloadInProgress {
                cancelDownload()
            } else if isDownloadFailed {
                mediaViewModel.startDownload(for: item, category: option.category)
                onAction?()
            } else if hasConnectionError {
                showConnectionAlert = true
            } else {
                mediaViewModel.startDownload(for: item, category: option.category)
                onAction?()
            }
        } label: {
            Group {
                if isDownloadInProgress {
                    if isDownloadAreaHovered {
                        Image(systemName: "xmark.circle.fill")
                            .imageScale(.large)
                    } else if let fraction = mediaViewModel.downloadProgressFraction(
                        for: item,
                        category: option.category,
                    ) {
                        ZStack {
                            Circle()
                                .stroke(Color.blue.opacity(0.3), lineWidth: 2)
                            Circle()
                                .trim(from: 0, to: fraction)
                                .stroke(Color.blue, lineWidth: 2)
                                .rotationEffect(.degrees(-90))
                        }
                        .frame(width: 17, height: 17)
                    } else {
                        ProgressView()
                            .progressViewStyle(ThinCircularProgressViewStyle())
                    }
                } else if isDownloadFailed {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .imageScale(.large)
                        .foregroundStyle(.red)
                } else if isHovered && hasConnectionError {
                    ZStack {
                        Circle()
                            .fill(.red)
                            .frame(width: 20, height: 20)
                        Image(systemName: "exclamationmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white)
                    }
                } else {
                    Image(systemName: "arrow.down.circle")
                        .imageScale(.large)
                }
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isDownloadAreaHovered = hovering
        }
        .accessibilityLabel(
            isDownloadFailed
                ? "Retry \(option.downloadTitle)"
                : isDownloadInProgress ? "Cancel \(option.downloadTitle)" : option.downloadTitle
        )
        #endif
    }

    private func makePlayerBookData() -> PlayerBookData {
        let freshMetadata = mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
        let path = mediaViewModel.localMediaPath(for: item.id, category: option.category)
        let variant: MediaViewModel.CoverVariant =
            freshMetadata.hasAvailableAudiobook ? .audioSquare : .standard
        let cover = mediaViewModel.coverImage(for: freshMetadata, variant: variant)
        let ebookCover =
            freshMetadata.hasAvailableAudiobook
            ? mediaViewModel.coverImage(for: freshMetadata, variant: .standard)
            : nil
        return PlayerBookData(
            metadata: freshMetadata,
            localMediaPath: path,
            category: option.category,
            coverArt: cover,
            ebookCoverArt: ebookCover,
        )
    }

    private func openMedia() {
        #if os(macOS)
        guard #available(macOS 13.0, *) else { return }
        let windowID: String
        switch option.category {
            case .audio:
                windowID = "AudiobookPlayer"
            case .ebook, .synced:
                windowID = "EbookPlayer"
        }
        openWindow(id: windowID, value: makePlayerBookData())
        #endif
        onAction?()
    }
}

#endif
