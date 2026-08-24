#if os(macOS)
import AppKit
import SwiftUI

struct MacBookDetailHeroBackground: View {
    let item: BookMetadata
    @Binding var palette: CoverDerivedPalette
    @Environment(MediaViewModel.self) private var mediaViewModel

    private var coverImage: NSImage? {
        mediaViewModel.coverState(for: item, variant: .standard).nsImage
            ?? mediaViewModel.coverState(for: item, variant: .audioSquare).nsImage
    }

    private var coverIdentity: ObjectIdentifier? {
        coverImage.map(ObjectIdentifier.init)
    }

    private var colorfulnessKey: String {
        let library = mediaViewModel.cachedConfig.library
        return "\(library.colorMode)-\(library.colorIntensity)"
    }

    var body: some View {
        Color.clear
            .onChange(of: coverIdentity, initial: true) { _, _ in
                updateBackgroundColor()
            }
            .onChange(of: colorfulnessKey) { _, _ in
                updateBackgroundColor()
            }
            .onChange(of: CoverColorBackfill.shared.version) { _, _ in
                updateBackgroundColor()
            }
    }

    private func updateBackgroundColor() {
        guard let coverImage, let derivedPalette = CoverDerivedPalette.make(from: coverImage) else {
            return
        }
        palette = derivedPalette.adjusted(for: mediaViewModel.cachedConfig.library)
    }
}

struct MacBookDetailMediaControls: View {
    enum Presentation {
        case hero
        case details
    }

    let item: BookMetadata
    let presentation: Presentation

    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.openWindow) private var openWindow
    @State private var showConnectionAlert = false
    @State private var isStartingAlignment = false
    @State private var isCancelingAlignment = false

    private var sourceStatus: ConnectionStatus {
        mediaViewModel.connectionStatus(forSourceID: item.sourceID)
    }

    private var connectionAlertTitle: String {
        if case .error = sourceStatus { return "Connection Error" }
        return "Server Not Connected"
    }

    private var connectionAlertMessage: String {
        if case .error(let message) = sourceStatus {
            return
                "Unable to download: \(message). Please check your server credentials in Settings."
        }
        return
            "Cannot download media while disconnected from the server. Please check your connection and try again."
    }

    private var readaloudStatus: String? {
        item.readaloud?.status?.uppercased()
    }

    private var isReadaloudProcessing: Bool {
        readaloudStatus == "PROCESSING" || readaloudStatus == "QUEUED"
    }

    private var canCreateOnServer: Bool {
        mediaViewModel.isServerBook(item.id)
    }

    private var canCreateLocally: Bool {
        mediaViewModel.isServerBook(item.id) || mediaViewModel.isLocalFolderBook(item.id)
    }

    private var availableOptions: [MediaDownloadOption] {
        MediaGridViewUtilities.mediaDownloadOptions(for: item)
    }

    private var allOptions: [MediaDownloadOption] {
        [
            MediaDownloadOption(
                category: .ebook,
                title: "Ebook",
                openTitle: "Read Ebook",
                iconName: "book.fill",
            ),
            MediaDownloadOption(
                category: .audio,
                title: "Audiobook",
                openTitle: "Play Audiobook",
                iconName: "headphones",
            ),
            MediaDownloadOption(
                category: .synced,
                title: "Readaloud",
                openTitle: "Read Readaloud",
                iconName: "readalong",
                iconType: .readaloud,
            ),
        ]
    }

    var body: some View {
        Group {
            switch presentation {
                case .hero:
                    heroButtons
                case .details:
                    detailRows
            }
        }
        .alert(connectionAlertTitle, isPresented: $showConnectionAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(connectionAlertMessage)
        }
    }

    @ViewBuilder
    private var heroButtons: some View {
        HStack(spacing: 12) {
            ForEach(availableOptions) { option in
                MacCompactMediaIconButton(
                    option: option,
                    isDownloaded: isDownloaded(option),
                    isDownloading: isDownloading(option),
                    isFailed: isFailed(option),
                    progress: mediaViewModel.downloadProgressFraction(
                        for: item,
                        category: option.category,
                    ),
                    canDelete: isDownloaded(option)
                        && mediaViewModel.hasCachedMedia(option.category, for: item),
                    actionLabel: primaryActionLabel(for: option),
                    action: { performPrimaryAction(for: option) },
                    deleteAction: {
                        mediaViewModel.deleteDownload(for: item, category: option.category)
                    },
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }

    private var detailRows: some View {
        VStack(spacing: 0) {
            ForEach(Array(allOptions.enumerated()), id: \.element.id) { index, option in
                if index > 0 {
                    Divider()
                        .padding(.leading, 30)
                }

                HStack(alignment: .center, spacing: 10) {
                    mediaIcon(for: option)
                        .foregroundStyle(.secondary)
                        .frame(width: 20, height: 20)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.title)
                            .font(.callout.weight(.medium))
                        Text(mediaSummary(for: option))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 6)
                    detailActions(for: option)
                }
                .padding(.vertical, 8)
            }

            if mediaViewModel.isServerBook(item.id) {
                Divider()
                Button {
                    openWindow(
                        id: "ServerMediaManagement",
                        value: ServerMediaManagementData(bookId: item.id),
                    )
                } label: {
                    Label("Manage Server Media...", systemImage: "server.rack")
                }
                .font(.callout)
                .buttonStyle(.plain)
                .foregroundStyle(.tint)
                .padding(.top, 10)
            }
        }
    }

    @ViewBuilder
    private func detailActions(for option: MediaDownloadOption) -> some View {
        if isAvailable(option) {
            HStack(spacing: 8) {
                Button {
                    performPrimaryAction(for: option)
                } label: {
                    Group {
                        if isDownloading(option) {
                            Image(systemName: "xmark.circle")
                        } else if isFailed(option) {
                            Image(systemName: "arrow.clockwise")
                        } else if isDownloaded(option) {
                            Image(systemName: "play.fill")
                        } else {
                            Image(systemName: "arrow.down.circle")
                        }
                    }
                    .frame(width: 18, height: 18)
                }
                .buttonStyle(.plain)
                .help(primaryActionLabel(for: option))

                if isDownloaded(option) {
                    Button {
                        mediaViewModel.openMediaFolder(for: item, category: option.category)
                    } label: {
                        Image(systemName: "folder")
                            .frame(width: 18, height: 18)
                    }
                    .buttonStyle(.plain)
                    .help("Show \(option.title) in Finder")

                    if mediaViewModel.hasCachedMedia(option.category, for: item) {
                        Button(role: .destructive) {
                            mediaViewModel.deleteDownload(for: item, category: option.category)
                        } label: {
                            Image(systemName: "trash")
                                .frame(width: 18, height: 18)
                        }
                        .buttonStyle(.plain)
                        .help(option.deleteTitle)
                    }
                }
            }
        } else if option.category == .synced && item.canShowCreateReadaloud {
            if isReadaloudProcessing {
                Button {
                    cancelReadaloudCreation()
                } label: {
                    if isCancelingAlignment {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "xmark.circle")
                    }
                }
                .buttonStyle(.plain)
                .disabled(isCancelingAlignment)
                .help("Cancel Readaloud creation")
            } else {
                Menu {
                    if canCreateOnServer {
                        Button {
                            startServerReadaloudCreation()
                        } label: {
                            Label("Create on Server", systemImage: "server.rack")
                        }
                    }
                    if canCreateLocally {
                        Button {
                            openLocalReadaloudGenerator()
                        } label: {
                            Label("Create Locally", systemImage: "desktopcomputer")
                        }
                    }
                } label: {
                    Image(systemName: "plus.circle")
                        .frame(width: 18, height: 18)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .disabled(isStartingAlignment)
                .help("Create Readaloud")
            }
        }
    }

    private func isAvailable(_ option: MediaDownloadOption) -> Bool {
        availableOptions.contains { $0.category == option.category }
    }

    private func mediaSummary(for option: MediaDownloadOption) -> String {
        var parts: [String] = []

        if isDownloading(option) {
            if let fraction = mediaViewModel.downloadProgressFraction(
                for: item,
                category: option.category,
            ) {
                parts.append("Downloading \(Int((fraction * 100).rounded()))%")
            } else {
                parts.append("Downloading")
            }
        } else if isFailed(option) {
            parts.append("Download failed")
        } else if isDownloaded(option) {
            parts.append("On this Mac")
        } else if !hasAssetRecord(option) {
            parts.append("Not available")
        }

        switch option.category {
            case .ebook:
                if let asset = item.ebook {
                    let format = URL(fileURLWithPath: asset.filepath).pathExtension.uppercased()
                    if !format.isEmpty { parts.append(format) }
                    if let pages = asset.pageCount, pages > 0 { parts.append("\(pages) pages") }
                    if let size = asset.fileSize, size > 0 {
                        parts.append(BookMetadata.formatFileSize(bytes: size))
                    }
                }
            case .audio:
                if let asset = item.audiobook {
                    if let duration = asset.duration, duration > 0 {
                        parts.append(BookMetadata.formatDuration(seconds: Int(duration.rounded())))
                    }
                    if let size = asset.fileSize, size > 0 {
                        parts.append(BookMetadata.formatFileSize(bytes: size))
                    }
                }
            case .synced:
                if let asset = item.readaloud {
                    if let status = asset.status, !status.isEmpty {
                        parts.append(status.capitalized)
                    }
                    if let pages = asset.pageCount, pages > 0 { parts.append("\(pages) pages") }
                    if let duration = asset.duration, duration > 0 {
                        parts.append(BookMetadata.formatDuration(seconds: Int(duration.rounded())))
                    }
                    if let size = asset.fileSize, size > 0 {
                        parts.append(BookMetadata.formatFileSize(bytes: size))
                    }
                }
        }

        return parts.isEmpty ? "Not available" : parts.joined(separator: " • ")
    }

    private func hasAssetRecord(_ option: MediaDownloadOption) -> Bool {
        switch option.category {
            case .ebook: item.ebook != nil
            case .audio: item.audiobook != nil
            case .synced: item.readaloud != nil
        }
    }

    private func primaryActionLabel(for option: MediaDownloadOption) -> String {
        if isDownloading(option) { return "Cancel \(option.downloadTitle)" }
        if isFailed(option) { return "Retry \(option.downloadTitle)" }
        if isDownloaded(option) { return option.openTitle }
        return option.downloadTitle
    }

    private func isDownloaded(_ option: MediaDownloadOption) -> Bool {
        mediaViewModel.isCategoryDownloaded(option.category, for: item)
    }

    private func isDownloading(_ option: MediaDownloadOption) -> Bool {
        mediaViewModel.isCategoryDownloadInProgress(for: item, category: option.category)
    }

    private func isFailed(_ option: MediaDownloadOption) -> Bool {
        !isDownloading(option)
            && mediaViewModel.isCategoryDownloadFailed(for: item, category: option.category)
    }

    private func performPrimaryAction(for option: MediaDownloadOption) {
        if isDownloaded(option) {
            openMedia(option)
        } else if isDownloading(option) {
            mediaViewModel.cancelDownload(for: item, category: option.category)
        } else {
            startDownload(option)
        }
    }

    private func startDownload(_ option: MediaDownloadOption) {
        if mediaViewModel.hasConnectionError(forSourceID: item.sourceID) {
            showConnectionAlert = true
        } else {
            mediaViewModel.startDownload(for: item, category: option.category)
        }
    }

    private func openMedia(_ option: MediaDownloadOption) {
        let windowID = option.category == .audio ? "AudiobookPlayer" : "EbookPlayer"
        openWindow(id: windowID, value: makePlayerBookData(for: option))
    }

    private func makePlayerBookData(for option: MediaDownloadOption) -> PlayerBookData {
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

    private func startServerReadaloudCreation() {
        Task {
            isStartingAlignment = true
            _ = await BookServiceActor.shared.startAlignment(
                for: item.id,
                restart: readaloudStatus == "ERROR" || readaloudStatus == "STOPPED" ? .full : .none,
            )
            await BookServiceActor.shared.fetchLibraryInformation()
            isStartingAlignment = false
        }
    }

    private func cancelReadaloudCreation() {
        Task {
            isCancelingAlignment = true
            _ = await BookServiceActor.shared.cancelAlignment(
                for: item.id
            )
            await BookServiceActor.shared.fetchLibraryInformation()
            isCancelingAlignment = false
        }
    }

    private func openLocalReadaloudGenerator() {
        guard
            let data = LocalReadaloudAlignmentLauncher.data(
                for: item,
                mediaViewModel: mediaViewModel,
            )
        else { return }
        openWindow(id: "ReadaloudGenerator", value: data)
    }

    @ViewBuilder private func mediaIcon(for option: MediaDownloadOption) -> some View {
        switch option.iconType {
            case .system(let name):
                Image(systemName: name)
            case .custom(let name):
                Image(name)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 14, height: 14)
            case .readaloud:
                Image("readalong")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 14, height: 14)
        }
    }
}

private struct MacCompactMediaIconButton: View {
    let option: MediaDownloadOption
    let isDownloaded: Bool
    let isDownloading: Bool
    let isFailed: Bool
    let progress: Double?
    let canDelete: Bool
    let actionLabel: String
    let action: () -> Void
    let deleteAction: () -> Void

    @State private var isHovered = false
    @Environment(\.bookDetailHeroColors) private var heroColors
    @Environment(\.bookDetailPalette) private var palette

    private var buttonBackground: Color {
        palette?.accentBackground ?? heroColors.controlFill
    }

    private var brightForeground: Color {
        palette?.brightAccent ?? heroColors.primary
    }

    private var mutedForeground: Color {
        palette?.mutedAccent ?? heroColors.primary.opacity(0.55)
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(buttonBackground)
                    .overlay {
                        if isHovered {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .strokeBorder(brightForeground.opacity(0.24), lineWidth: 1)
                        }
                    }

                icon
                    .foregroundStyle(
                        isHovered || isDownloaded || isDownloading
                            ? brightForeground : mutedForeground
                    )
            }
            .frame(width: 34, height: 34)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .contextMenu {
            if canDelete {
                Button(role: .destructive, action: deleteAction) {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
        .animation(.easeOut(duration: 0.12), value: isHovered)
        .help(actionLabel)
        .accessibilityLabel(actionLabel)
    }

    @ViewBuilder
    private var icon: some View {
        if isDownloading {
            if isHovered {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
            } else if let progress {
                ZStack {
                    Circle()
                        .stroke(brightForeground.opacity(0.25), lineWidth: 2)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            brightForeground,
                            style: StrokeStyle(lineWidth: 2, lineCap: .round),
                        )
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 17, height: 17)
            } else {
                ProgressView()
                    .controlSize(.small)
                    .tint(brightForeground)
                    .environment(\.colorScheme, .dark)
            }
        } else if isFailed {
            Image(systemName: isHovered ? "arrow.clockwise" : "exclamationmark.triangle.fill")
                .font(.system(size: 14, weight: .semibold))
        } else if isHovered {
            Image(systemName: isDownloaded ? "play.fill" : "arrow.down")
                .font(.system(size: 15, weight: .semibold))
        } else {
            mediaIcon
        }
    }

    @ViewBuilder
    private var mediaIcon: some View {
        switch option.iconType {
            case .system(let name):
                Image(systemName: name)
                    .font(.system(size: 15, weight: .medium))
            case .custom(let name):
                Image(name)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 17, height: 17)
            case .readaloud:
                Image("readalong")
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18, height: 18)
        }
    }
}

struct MacBookDetailTagDisclosure: View {
    let tags: [String]
    @State private var isExpanded = false
    @Environment(\.bookDetailHeroColors) private var heroColors

    private var uniqueTags: [String] {
        var seen: Set<String> = []
        return tags.filter { seen.insert($0).inserted }
    }

    private var visibleTags: [String] {
        isExpanded ? uniqueTags : Array(uniqueTags.prefix(3))
    }

    var body: some View {
        VStack(spacing: 7) {
            MacTagFlowLayout(spacing: 5) {
                ForEach(visibleTags, id: \.self) { tag in
                    BookMetadataLink(target: .tag(tag)) {
                        Text(tag)
                            .font(.caption)
                            .lineLimit(1)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(heroColors.controlFill, in: Capsule())
                    }
                }
            }

            if uniqueTags.count > 3 {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        isExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExpanded ? "Show less" : "\(uniqueTags.count - 3) more")
                        Image(systemName: "chevron.down")
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .font(.caption)
                    .foregroundStyle(heroColors.primary.opacity(0.82))
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(heroColors.primary)
        .onChange(of: tags) { _, _ in
            isExpanded = false
        }
    }
}

private struct MacTagFlowLayout: Layout {
    private struct Element {
        let index: Int
        let size: CGSize
    }

    private struct Row {
        var elements: [Element] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    let spacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache _: inout (),
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = makeRows(maxWidth: maxWidth, subviews: subviews)
        let measuredWidth = rows.map(\.width).max() ?? 0
        let measuredHeight =
            rows.map(\.height).reduce(0, +)
            + spacing * CGFloat(max(rows.count - 1, 0))

        return CGSize(
            width: maxWidth.isFinite ? maxWidth : measuredWidth,
            height: measuredHeight,
        )
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal _: ProposedViewSize,
        subviews: Subviews,
        cache _: inout (),
    ) {
        let rows = makeRows(maxWidth: bounds.width, subviews: subviews)
        var currentY = bounds.minY

        for row in rows {
            var currentX = bounds.midX - row.width / 2
            for element in row.elements {
                subviews[element.index].place(
                    at: CGPoint(x: currentX, y: currentY),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(element.size),
                )
                currentX += element.size.width + spacing
            }
            currentY += row.height + spacing
        }
    }

    private func makeRows(maxWidth: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()

        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let proposedWidth = row.elements.isEmpty ? size.width : row.width + spacing + size.width
            if !row.elements.isEmpty, proposedWidth > maxWidth {
                rows.append(row)
                row = Row()
            }

            row.elements.append(Element(index: index, size: size))
            row.width = row.elements.count == 1 ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
        }

        if !row.elements.isEmpty { rows.append(row) }
        return rows
    }
}

struct MacBookDetailRelatedShelf: View {
    let title: String
    let systemImage: String
    let section: BookDetailDisclosureSection
    let books: [BookMetadata]
    let onSelect: (BookMetadata) -> Void
    var seriesName: String? = nil

    var body: some View {
        BookDetailDisclosureCard(title, systemImage: systemImage, section: section) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(books) { book in
                        Button {
                            onSelect(book)
                        } label: {
                            MacBookDetailRelatedBook(
                                book: book,
                                seriesPositionBadge: seriesPositionBadge(for: book),
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func seriesPositionBadge(for book: BookMetadata) -> String? {
        guard let seriesName else { return nil }
        let normalizedName = seriesName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard
            let position = book.series?.first(where: {
                $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                    == normalizedName
            })?.formattedPosition
        else { return nil }
        return position.hasPrefix("#") ? position : "#\(position)"
    }
}

private struct MacBookDetailRelatedBook: View {
    let book: BookMetadata
    let seriesPositionBadge: String?
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var cachedCover: NSImage?

    private var variant: MediaViewModel.CoverVariant {
        mediaViewModel.coverVariant(for: book)
    }

    private var artworkHeight: CGFloat {
        variant == .standard ? 105 : 70
    }

    private var coverImage: Image? {
        mediaViewModel.coverImage(for: book, variant: variant)
            ?? cachedCover.map { Image(nsImage: $0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Group {
                if let coverImage {
                    RoundedCoverArtwork(
                        image: coverImage,
                        placeholderColor: .clear,
                        variant: variant,
                        cornerRadius: 5,
                    )
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(.quaternary.opacity(0.35))
                        ProgressView()
                            .controlSize(.small)
                    }
                }
            }
            .frame(width: 70, height: artworkHeight)
            .overlay(alignment: .topLeading) {
                if let seriesPositionBadge {
                    Text(seriesPositionBadge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(
                            .black.opacity(0.65),
                            in: RoundedRectangle(cornerRadius: 4, style: .continuous),
                        )
                        .padding(3)
                }
            }
            .frame(height: 105, alignment: .top)
            .shadow(color: .black.opacity(0.16), radius: 3, y: 2)

            Text(book.title)
                .font(.caption)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(width: 70, alignment: .leading)
        }
        .task(id: book.id) {
            mediaViewModel.ensureCoverLoaded(
                for: book,
                variant: variant,
                debugSource: "bookDetailsRelated",
            )
            if let data = await BookServiceActor.shared.cachedCoverData(
                for: book.id,
                audio: variant == .audioSquare,
            ) {
                cachedCover = NSImage(data: data)
            }
        }
        .help(book.title)
    }
}

#endif
