#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
private struct MediaNavigationPathKey: EnvironmentKey {
    nonisolated(unsafe) static let defaultValue: Binding<NavigationPath>? = nil
}

extension EnvironmentValues {
    var mediaNavigationPath: Binding<NavigationPath>? {
        get { self[MediaNavigationPathKey.self] }
        set { self[MediaNavigationPathKey.self] = newValue }
    }
}
#endif

struct MediaItemCardMetrics {
    let tileWidth: CGFloat
    let cardPadding: CGFloat
    let coverCornerRadius: CGFloat
    let contentSpacing: CGFloat
    let coverWidth: CGFloat
    let maxCardHeight: CGFloat
    let coverContainerHeight: CGFloat
    let titleContainerHeight: CGFloat
    let titleToAuthorGap: CGFloat

    /// Concentric with the cover corners once the card padding is accounted for.
    var cardCornerRadius: CGFloat { coverCornerRadius + cardPadding }

    static func make(
        for tileWidth: CGFloat,
        mediaKind _: MediaKind,
        coverPreference: CoverPreference = .preferEbook,
        secondaryLineCount: Int = 1,
    ) -> MediaItemCardMetrics {
        let cardPadding = 2.0
        let coverWidth = max(tileWidth - (cardPadding * 2), tileWidth * 0.90)
        let contentSpacing = max(4, tileWidth * 0.03)

        let coverContainerHeight: CGFloat =
            coverPreference == .storytellerDouble
            ? DoubleCoverView.layoutHeight(for: coverWidth)
            : coverWidth / coverPreference.preferredContainerAspectRatio

        let estimatedLineHeight: CGFloat = 16
        let maxTitleLines: CGFloat = 2
        let titleContainerHeight = estimatedLineHeight * maxTitleLines

        let authorRowHeight: CGFloat = 20
        let titleBottomSpacing: CGFloat = 4
        let titleToAuthorGap: CGFloat = 0

        let maxCardHeight =
            (cardPadding * 2) + coverContainerHeight + contentSpacing + titleContainerHeight
            + titleToAuthorGap + authorRowHeight * CGFloat(secondaryLineCount)
            + titleBottomSpacing

        return MediaItemCardMetrics(
            tileWidth: tileWidth,
            cardPadding: cardPadding,
            coverCornerRadius: max(8, tileWidth * 0.045),
            contentSpacing: contentSpacing,
            coverWidth: coverWidth,
            maxCardHeight: maxCardHeight,
            coverContainerHeight: coverContainerHeight,
            titleContainerHeight: titleContainerHeight,
            titleToAuthorGap: titleToAuthorGap,
        )
    }
}

struct MediaItemCardView: View {
    let item: BookMetadata
    let mediaKind: MediaKind
    let metrics: MediaItemCardMetrics
    let isSelected: Bool
    let showAudioIndicator: Bool
    let sourceLabel: String?
    let seriesPositionBadge: String?
    let coverPreference: CoverPreference
    let progressStyle: ProgressIndicatorStyle
    var sortOption: MediaGridSortOption = .titleAZ
    var showOnItem: [ShowOnItemField] = [.auto]
    let onSelect: (BookMetadata) -> Void
    let onInfo: (BookMetadata) -> Void
    var onEditMetadata: (([BookID]) -> Void)? = nil
    var isBulkSelected: Bool = false
    var isBulkSelectionMode: Bool = false
    var onToggleBulkSelection: ((BookMetadata) -> Void)? = nil
    var debugContext: String? = nil
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    #if os(macOS)
    @State private var doubleCoverSwapping = false
    #endif
    #if os(iOS)
    @Environment(\.mediaNavigationPath) private var mediaNavigationPath
    @Environment(\.editMetadataAction) private var editMetadataAction
    @State private var pendingDetailsNavigation = false
    @State private var copyBookData: CopyBookData?
    @State private var pendingFolderDelete: FolderDeleteRequest?
    #endif

    var body: some View {
        #if os(iOS)
        if isBulkSelectionMode {
            Button {
                onToggleBulkSelection?(item)
            } label: {
                cardContent
            }
            .buttonStyle(.plain)
        } else if let playerData = preferredPlayerBookData {
            Button {
                PlayerPresenter.shared.present(playerData)
            } label: {
                cardContent
            }
            .buttonStyle(.plain)
            .background(deferredNavigationLinks)
            .contextMenu { iOSCardContextMenu }
            .sheet(item: $copyBookData) { copyBookSheet($0) }
            .confirmationDialog(
                folderDeleteTitle,
                isPresented: folderDeletePresented,
                titleVisibility: .visible,
                presenting: pendingFolderDelete,
            ) { request in
                Button("Delete", role: .destructive) { performFolderDelete(request) }
            } message: { request in
                Text(folderDeleteMessage(request))
            }
        } else {
            NavigationLink(value: item) {
                cardContent
            }
            .buttonStyle(.plain)
            .background(deferredNavigationLinks)
            .contextMenu { iOSCardContextMenu }
            .sheet(item: $copyBookData) { copyBookSheet($0) }
            .confirmationDialog(
                folderDeleteTitle,
                isPresented: folderDeletePresented,
                titleVisibility: .visible,
                presenting: pendingFolderDelete,
            ) { request in
                Button("Delete", role: .destructive) { performFolderDelete(request) }
            } message: { request in
                Text(folderDeleteMessage(request))
            }
        }
        #else
        cardContent
        #endif
    }

    #if os(iOS)
    @ViewBuilder
    private var iOSCardContextMenu: some View {
        Button {
            handleDetailsNavigation()
        } label: {
            Label("View Details", systemImage: "info.circle")
        }

        if let editMetadataAction {
            Button {
                editMetadataAction([item.id])
            } label: {
                Label("Edit Metadata...", systemImage: "pencil")
            }
        }

        iOSStatusContextMenu
        iOSReadaloudContextMenuContent(item: item)

        Divider()

        iOSContextMenuMediaOption(for: .ebook, label: "Ebook")
        iOSContextMenuMediaOption(for: .audio, label: "Audiobook")
        iOSContextMenuMediaOption(for: .synced, label: "Readaloud")

        if mediaViewModel.isLocalFolderBook(item.id) {
            Button(role: .destructive) {
                pendingFolderDelete = FolderDeleteRequest(format: nil, label: item.title)
            } label: {
                Label("Delete All", systemImage: "trash")
            }
        }

        iOSCopyToMenu
    }

    @ViewBuilder
    private var iOSCopyToMenu: some View {
        let destinations = mediaViewModel.copyDestinations(for: iOSCurrentItem)
        if !destinations.isEmpty {
            Divider()

            Menu {
                ForEach(destinations) { destination in
                    Button {
                        copyBookData = CopyBookData(
                            bookID: item.id,
                            destinationSourceID: destination.id,
                        )
                    } label: {
                        Label(destination.name, systemImage: iOSSourceIconName(destination.kind))
                    }
                }
            } label: {
                Label("Copy To...", systemImage: "square.and.arrow.up.on.square")
            }
        }
    }

    private func iOSSourceIconName(_ kind: BookSourceKind) -> String {
        switch kind {
            case .storyteller: return "server.rack"
            case .localFolder: return "folder"
        }
    }

    @ViewBuilder
    private func copyBookSheet(_ data: CopyBookData) -> some View {
        NavigationStack {
            CopyBookView(
                bookID: data.bookID,
                destinationSourceID: data.destinationSourceID,
            )
            .environment(mediaViewModel)
            .navigationTitle("Copy Book")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { copyBookData = nil }
                }
            }
        }
    }

    private var iOSCurrentItem: BookMetadata {
        mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
    }

    private var iOSStatusOptions: [BookStatus] {
        mediaViewModel.availableStatusesBySourceID[iOSCurrentItem.sourceID] ?? []
    }

    @ViewBuilder
    private var iOSStatusContextMenu: some View {
        if !iOSStatusOptions.isEmpty {
            Menu {
                ForEach(iOSStatusOptions, id: \.name) { status in
                    Button {
                        setStatus(status.name)
                    } label: {
                        if status.name == iOSCurrentItem.status?.name {
                            Label(status.name, systemImage: "checkmark")
                        } else {
                            Text(status.name)
                        }
                    }
                    .disabled(status.name == iOSCurrentItem.status?.name)
                }
            } label: {
                Label("Set Status", systemImage: "bookmark")
            }
        }
    }

    private func setStatus(_ name: String) {
        guard name != iOSCurrentItem.status?.name else { return }
        Task {
            let success = await BookServiceActor.shared.updateStatus(
                forBooks: [iOSCurrentItem.id],
                toStatusNamed: name,
            )
            if !success {
                mediaViewModel.showSyncNotification(
                    SyncNotification(
                        message: "Failed to update status",
                        type: .error,
                    )
                )
            }
        }
    }

    @ViewBuilder
    private func iOSContextMenuMediaOption(for category: LocalMediaCategory, label: String)
        -> some View
    {
        let isDownloaded = mediaViewModel.isCategoryDownloaded(category, for: item)
        let isDownloading = mediaViewModel.isCategoryDownloadInProgress(
            for: item,
            category: category,
        )
        let isAvailable: Bool = {
            switch category {
                case .ebook: return item.hasAvailableEbook
                case .audio: return item.hasAvailableAudiobook
                case .synced: return item.hasAvailableReadaloud
            }
        }()

        if mediaViewModel.isLocalFolderBook(item.id) {
            if isAvailable {
                Button(role: .destructive) {
                    pendingFolderDelete = FolderDeleteRequest(
                        format: folderFormat(for: category),
                        label: label,
                    )
                } label: {
                    Label("Delete \(label)", systemImage: "trash")
                }
            }
        } else if isDownloaded && mediaViewModel.hasCachedMedia(category, for: item) {
            Button(role: .destructive) {
                mediaViewModel.deleteDownload(for: item, category: category)
            } label: {
                Label("Local \(label)", systemImage: "trash")
            }
        } else if isDownloading {
            Button(role: .destructive) {
                mediaViewModel.cancelDownload(for: item, category: category)
            } label: {
                Label("Cancel \(label)", systemImage: "xmark.circle")
            }
        } else if isAvailable {
            Button {
                mediaViewModel.startDownload(for: item, category: category)
            } label: {
                Label(label, systemImage: "arrow.down.circle")
            }
        }
    }

    private struct FolderDeleteRequest {
        let format: StorytellerBookFormat?
        let label: String
    }

    private func folderFormat(for category: LocalMediaCategory) -> StorytellerBookFormat {
        switch category {
            case .ebook: return .ebook
            case .audio: return .audiobook
            case .synced: return .readaloud
        }
    }

    private var folderDeletePresented: Binding<Bool> {
        Binding(
            get: { pendingFolderDelete != nil },
            set: { if !$0 { pendingFolderDelete = nil } },
        )
    }

    private var folderDeleteTitle: String {
        guard let request = pendingFolderDelete else { return "" }
        return request.format == nil ? "Delete \(item.title)?" : "Delete \(request.label)?"
    }

    private func folderDeleteMessage(_ request: FolderDeleteRequest) -> String {
        request.format == nil
            ? "This permanently deletes \(item.title) and all its files from the folder source."
            : "This permanently deletes the \(request.label.lowercased()) file from the folder source."
    }

    private func performFolderDelete(_ request: FolderDeleteRequest) {
        Task {
            if let format = request.format {
                _ = await mediaViewModel.deleteFolderAsset(for: item, format: format)
            } else {
                _ = await mediaViewModel.deleteFolderBook(item)
            }
        }
    }
    #endif

    #if os(iOS)
    private var preferredPlayerBookData: PlayerBookData? {
        guard mediaViewModel.cachedConfig.library.tapToPlayPreferredPlayer else { return nil }
        guard let category = mediaViewModel.preferredDownloadedCategory(for: item) else {
            return nil
        }
        return makePlayerBookData(for: category)
    }

    private func makePlayerBookData(for category: LocalMediaCategory) -> PlayerBookData {
        mediaViewModel.makePlayerBookData(for: item, category: category)
    }

    private func handleDetailsNavigation() {
        if let mediaNavigationPath {
            mediaNavigationPath.wrappedValue.append(item)
        } else {
            pendingDetailsNavigation = true
        }
    }

    private func handlePlayerNavigation(_ category: LocalMediaCategory) {
        PlayerPresenter.shared.present(makePlayerBookData(for: category))
    }

    @ViewBuilder
    private var deferredNavigationLinks: some View {
        if mediaNavigationPath == nil {
            NavigationLink(isActive: $pendingDetailsNavigation) {
                iOSBookDetailView(item: item, mediaKind: mediaKind)
            } label: {
                EmptyView()
            }
            .frame(width: 0, height: 0)
            .hidden()
        }
    }
    #endif

    private var isDoubleCover: Bool {
        coverPreference == .storytellerDouble
    }

    @ViewBuilder
    private func cardVisual(isHovered: Bool) -> some View {
        let placeholderColor = Color(white: 0.2)
        let coverVariant = resolveCoverVariant(for: item)
        let shouldRenderDoubleCover = isDoubleCover

        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .center) {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Group {
                        if shouldRenderDoubleCover {
                            DoubleCoverView(
                                item: item,
                                placeholderColor: placeholderColor,
                                coverWidth: metrics.coverWidth,
                                cornerRadius: metrics.coverCornerRadius,
                                isSwapping: {
                                    #if os(macOS)
                                    return $doubleCoverSwapping
                                    #else
                                    return .constant(false)
                                    #endif
                                }(),
                                showReadaloudWedge: showAudioIndicator
                                    && item.hasAvailableReadaloud,
                                notchProgress: {
                                    let p = mediaViewModel.progress(for: item.id)
                                    return (progressStyle == .circle && p > 0) ? p : nil
                                }(),
                                lineProgress: {
                                    let p = mediaViewModel.progress(for: item.id)
                                    return (progressStyle == .line && p > 0) ? p : nil
                                }(),
                                isHoveringCard: {
                                    #if os(macOS)
                                    return isHovered
                                    #else
                                    return false
                                    #endif
                                }(),
                                debugContext: debugContext,
                            )
                            .frame(
                                width: metrics.coverWidth,
                                height: metrics.coverContainerHeight,
                            )
                        } else {
                            MediaItemCoverImage(
                                item: item,
                                placeholderColor: placeholderColor,
                                variant: coverVariant,
                                cornerRadius: metrics.coverCornerRadius,
                                debugContext: debugContext,
                            )
                            .frame(width: metrics.coverWidth)
                            .aspectRatio(coverVariant.displayAspectRatio, contentMode: .fit)
                            .overlay {
                                RoundedRectangle(
                                    cornerRadius: metrics.coverCornerRadius,
                                    style: .continuous,
                                )
                                .strokeBorder(Color.primary.opacity(0.14), lineWidth: 1)
                            }
                        }
                    }
                    .overlay(alignment: .bottom) {
                        let progress = mediaViewModel.progress(for: item.id)
                        if progressStyle == .line && !shouldRenderDoubleCover {
                            MediaProgressBar(progress: progress)
                                .frame(height: 3)
                        }
                    }
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: metrics.coverCornerRadius,
                            style: .continuous,
                        )
                    )
                    // Badges attach to the cover (sized to the artwork), not the slot, so they
                    // track the visible cover even when it is letterboxed in a taller slot.
                    .overlay(alignment: .bottomLeading) {
                        if let sourceLabel = sourceLabel {
                            SourceBadge(label: sourceLabel)
                                .padding(4)
                        }
                    }
                    .overlay(alignment: .topTrailing) {
                        if showAudioIndicator && !shouldRenderDoubleCover {
                            AudioIndicatorBadge(item: item, coverVariant: coverVariant)
                                .padding(.trailing, 4)
                                .padding(.top, 4)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        let progress = mediaViewModel.progress(for: item.id)
                        if progress > 0 {
                            // Circle progress lives in the bottom notch for double covers; over a
                            // single cover it gets a dark backing disc for contrast.
                            if progressStyle == .circle && !shouldRenderDoubleCover {
                                CoverThemedProgressBadge(
                                    item: item,
                                    variant: coverVariant,
                                    progress: progress,
                                )
                                .padding(.trailing, 4)
                                .padding(.bottom, 4)
                            } else if progressStyle == .text {
                                ProgressTextBadge(progress: progress)
                                    .padding(.trailing, 4)
                                    .padding(.bottom, 4)
                            }
                        }
                    }
                    .overlay(alignment: .topLeading) {
                        if isBulkSelected || isBulkSelectionMode {
                            BulkSelectionCheckmark(isSelected: isBulkSelected)
                                .padding(6)
                        } else if let badge = seriesPositionBadge {
                            Text(badge)
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(
                                    .black.opacity(0.6),
                                    in: RoundedRectangle(cornerRadius: 6, style: .continuous),
                                )
                                .padding(4)
                        }
                    }
                    Spacer(minLength: 0)
                }

                #if os(macOS)
                MediaItemCardTopTabsButtonOverlay(
                    item: item,
                    coverWidth: metrics.coverWidth,
                    isSelected: isSelected,
                    isHoveringCard: isHovered,
                )
                .environment(mediaViewModel)
                #endif
            }
            .frame(height: metrics.coverContainerHeight)

            Spacer(minLength: metrics.contentSpacing)
                .frame(height: metrics.contentSpacing)

            VStack(alignment: .leading, spacing: 0) {
                secondaryLines
                    .padding(.bottom, metrics.titleToAuthorGap)

                Text(item.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(.horizontal, 8)
                    .frame(height: metrics.titleContainerHeight, alignment: .top)
            }
        }
        .padding(
            EdgeInsets(
                top: metrics.cardPadding,
                leading: metrics.cardPadding,
                bottom: metrics.cardPadding,
                trailing: metrics.cardPadding,
            )
        )
        .background(
            RoundedRectangle(cornerRadius: metrics.cardCornerRadius, style: .continuous)
                .fill(isCardSelected ? selectionAccent.opacity(0.12) : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: metrics.cardCornerRadius, style: .continuous)
                .strokeBorder(
                    isCardSelected ? selectionAccent : Color.clear,
                    lineWidth: 2,
                )
        )
        .frame(width: metrics.tileWidth, height: metrics.maxCardHeight, alignment: .top)
    }

    private var isCardSelected: Bool {
        isSelected || isBulkSelected
    }

    private var selectionAccent: Color {
        isDoubleCover ? resolvedCoverPalette.accent : Color.accentColor
    }

    private var cardContent: some View {
        #if os(macOS)
        // The hover scale lives in its own child view so that toggling it (which happens whenever
        // the pointer crosses into an open context menu) does not recompute this view and tear down
        // the live NSMenu, which would collapse any open submenu.
        return MacCardHoverTracker { isHovered in
            cardVisual(isHovered: isHovered)
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelect(item)
                }
                .simultaneousGesture(
                    TapGesture(count: 2)
                        .onEnded { _ in
                            onInfo(item)
                        }
                )
        }
        .contextMenu {
            BookContextMenuContent(
                item: item,
                onInfo: onInfo,
                onEditMetadata: onEditMetadata,
            )
        }
        .zIndex(doubleCoverSwapping ? 1000 : 0)
        #else
        return cardVisual(isHovered: false)
            .contentShape(Rectangle())
        #endif
    }

    @ViewBuilder
    private var secondaryLines: some View {
        if let rows = ShowOnItemField.displayRows(showOnItem) {
            ForEach(rows.indices, id: \.self) { index in
                metadataLine(ShowOnItemField.rowText(rows[index], for: item))
            }
        } else {
            metadataLine(topLineText)
        }
    }

    private func metadataLine(_ text: String) -> some View {
        HStack(spacing: 2) {
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 4)
        }
        .padding(.leading, 8)
        .padding(.trailing, 2)
        .frame(height: 20, alignment: .topLeading)
    }

    // The top line normally shows the author. When sorting by a different field, it
    // surfaces that field's value instead, so the active sort is visible on each card.
    private var topLineText: String {
        let author = item.authors?.first?.name ?? ""

        switch sortOption.field {
            case .title, .author:
                return author
            case .allCreators:
                return item.sortableAllCreators
            case .publicationDate:
                let formatted = StorytellerDate.full(item.publicationDateValue)
                return formatted.isEmpty ? item.sortablePublicationYear : formatted
            case .series:
                if let series = item.series?.first {
                    if let position = series.formattedPosition {
                        return "\(position) - \(series.name)"
                    }
                    return series.name
                }
                return ""
            case .recentlyAdded:
                return StorytellerDate.full(item.createdAtValue)
            case .recentlyRead:
                return StorytellerDate.full(item.lastReadValue)
            case .alignedAt:
                return StorytellerDate.full(item.alignedAtValue)
            case .progress:
                let value = min(max(mediaViewModel.progress(for: item.id), 0), 1)
                return "\(Int((value * 100).rounded()))%"
            case .subtitle:
                return item.sortableSubtitle
            case .narrator:
                return item.sortableNarrator
            case .language:
                return item.sortableLanguage
            case .pages:
                return item.pagesDisplay
            case .duration:
                return item.durationDisplay
            case .fileSize:
                return item.fileSizeDisplay
            case .collections:
                return item.sortableCollections
            case .identifiers:
                return item.identifiersDisplay
            case .status:
                return item.sortableStatus
            case .tags:
                return item.sortableTags
            case .source:
                return item.sortableSource
            case .alignedByVersion:
                return item.sortableAlignedByVersion
            case .alignedWith:
                return item.sortableAlignedWith
        }
    }

    private func resolveCoverVariant(for item: BookMetadata) -> MediaViewModel.CoverVariant {
        mediaViewModel.coverVariant(for: item, preference: coverPreference)
    }

    private var resolvedCoverPalette: CoverDerivedPalette {
        let ebook = mediaViewModel.coverState(for: item, variant: .standard).cgImage
        let audio = mediaViewModel.coverState(for: item, variant: .audioSquare).cgImage
        return ((ebook ?? audio).flatMap(CoverDerivedPalette.make(from:)) ?? .fallback())
            .adjusted(for: mediaViewModel.cachedConfig.library)
            .resolved(for: colorScheme)
    }
}

struct CircularProgressBadge: View {
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel?
    let progress: Double
    var showsBackground: Bool = false
    var backgroundColor: Color = .black.opacity(0.78)
    var ringDiameter: CGFloat = 18
    var backgroundDiameter: CGFloat = 24

    private var showsBackdrop: Bool {
        showsBackground && (mediaViewModel?.cachedConfig.library.progressBadgeBackground ?? true)
    }

    var body: some View {
        let clamped = min(max(progress, 0), 1)
        ZStack {
            Circle()
                .stroke(.tint.opacity(0.3), lineWidth: 2.5)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(.tint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: ringDiameter, height: ringDiameter)
        // Background sits behind without affecting the ring's layout, so the ring stays the
        // same size whether or not the backing disc is shown.
        .background {
            if showsBackdrop {
                Circle()
                    .fill(backgroundColor)
                    .frame(width: backgroundDiameter, height: backgroundDiameter)
            }
        }
    }
}

struct CoverThemedProgressBadge: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    let item: BookMetadata
    let variant: MediaViewModel.CoverVariant
    let progress: Double

    private var palette: CoverDerivedPalette {
        let primary = mediaViewModel.coverState(for: item, variant: variant).cgImage
        let fallbackVariant: MediaViewModel.CoverVariant =
            variant == .standard ? .audioSquare : .standard
        let fallback = mediaViewModel.coverState(for: item, variant: fallbackVariant).cgImage
        return ((primary ?? fallback).flatMap(CoverDerivedPalette.make(from:)) ?? .fallback())
            .adjusted(for: mediaViewModel.cachedConfig.library)
            .resolved(for: colorScheme)
    }

    var body: some View {
        CircularProgressBadge(
            progress: progress,
            showsBackground: true,
            backgroundColor: palette.accentBackground,
            ringDiameter: 15,
            backgroundDiameter: 21,
        )
        .tint(palette.accent)
    }
}

struct ProgressTextBadge: View {
    let progress: Double

    var body: some View {
        let clamped = min(max(progress, 0), 1)
        Text("\(Int((clamped * 100).rounded()))%")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(
                .black.opacity(0.6),
                in: RoundedRectangle(cornerRadius: 6, style: .continuous),
            )
    }
}

struct MediaProgressBar: View {
    let progress: Double
    var backgroundOpacity = 0.1

    var body: some View {
        GeometryReader { geometry in
            let clamped = min(max(progress, 0), 1)
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(.tint.opacity(backgroundOpacity))
                Rectangle()
                    .fill(.tint)
                    .frame(width: geometry.size.width * CGFloat(clamped))
            }
        }
    }
}

#if os(macOS)
/// Owns the card's hover state in isolation. Because `isHovered` lives here rather than on the
/// parent, hovering only recomputes this view's body, not the parent that hosts `.contextMenu` -
/// so an open context menu (and its submenus) survives the pointer crossing onto the menu.
private struct MacCardHoverTracker<Content: View>: View {
    @ViewBuilder let content: (Bool) -> Content
    @State private var isHovered = false

    var body: some View {
        content(isHovered)
            .onHover { isHovered = $0 }
    }
}
#endif

private struct MediaItemCoverImage: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    let item: BookMetadata
    let placeholderColor: Color
    let variant: MediaViewModel.CoverVariant
    let cornerRadius: CGFloat
    let debugContext: String?

    var body: some View {
        let coverState = mediaViewModel.coverState(for: item, variant: variant)
        let fallbackVariant: MediaViewModel.CoverVariant =
            variant == .standard ? .audioSquare : .standard
        let fallbackState = mediaViewModel.coverState(for: item, variant: fallbackVariant)
        let displayImage = coverState.image ?? fallbackState.image

        RoundedCoverArtwork(
            image: displayImage,
            placeholderColor: placeholderColor,
            variant: coverState.image == nil && fallbackState.image != nil
                ? fallbackVariant : variant,
            cornerRadius: cornerRadius,
        )
        .transition(.opacity.combined(with: .scale))
        .animation(.easeInOut(duration: 0.2), value: displayImage != nil)
        .task(id: taskIdentifier) {
            debugCoverLog(
                "task imageLoaded=\(coverState.image != nil) fallbackLoaded=\(fallbackState.image != nil)"
            )
            mediaViewModel.ensureCoverLoaded(
                for: item,
                variant: variant,
                debugSource: debugContext,
            )
            mediaViewModel.ensureCoverLoaded(
                for: item,
                variant: fallbackVariant,
                debugSource: debugContext,
            )
        }
        .onAppear {
            debugCoverLog(
                "appear imageLoaded=\(coverState.image != nil) fallbackLoaded=\(fallbackState.image != nil)"
            )
        }
        .onChange(of: coverState.image != nil) { _, loaded in
            debugCoverLog("imageLoaded changed=\(loaded)")
        }
        .onChange(of: fallbackState.image != nil) { _, loaded in
            debugCoverLog("fallbackLoaded changed=\(loaded)")
        }
        .onDisappear {
            debugCoverLog(
                "disappear imageLoaded=\(coverState.image != nil) fallbackLoaded=\(fallbackState.image != nil)"
            )
            mediaViewModel.cancelCoverLoad(for: item, variant: variant)
            mediaViewModel.cancelCoverLoad(for: item, variant: fallbackVariant)
        }
    }

    private func debugCoverLog(_ message: String) {
        guard let debugContext else { return }
        debugLog(
            "[CoverPerf][\(debugContext)] view \(message) title='\(item.title)' id=\(item.id) variant=\(variant)"
        )
    }

    private var taskIdentifier: String {
        "\(item.id)-\(variantIdentifier)"
    }

    private var variantIdentifier: String {
        switch variant {
            case .standard:
                return "standard"
            case .audioSquare:
                return "audio"
        }
    }
}

struct DoubleCoverView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    let item: BookMetadata
    let placeholderColor: Color
    let coverWidth: CGFloat
    let cornerRadius: CGFloat
    @Binding var isSwapping: Bool
    var showReadaloudWedge: Bool = false
    var notchProgress: Double? = nil
    var lineProgress: Double? = nil
    var isHoveringCard: Bool = false
    var debugContext: String? = nil

    #if os(macOS)
    @State private var swapPhase: SwapPhase = .idle
    @State private var swapTask: Task<Void, Never>?

    enum SwapPhase {
        case idle
        case slidingOut
        case swapped
    }
    #endif

    /// 0.82 * 1.5 (portrait aspect) is the well's own 16/13 aspect, so an ebook cover fills
    /// the well height.
    nonisolated static let tileFraction: CGFloat = 0.82
    nonisolated static let wellAspectRatio: CGFloat = 13.0 / 16.0
    nonisolated static let hoverTileScale: CGFloat = 0.8
    nonisolated static let restingSpread: CGFloat = 0.10
    nonisolated static let hoverSpread: CGFloat = 0.18

    /// Tapers below 8pt so small tiles do not lose their artwork to padding.
    nonisolated static func wellPadding(for coverWidth: CGFloat) -> CGFloat {
        min(8, coverWidth * 0.045)
    }

    nonisolated static func layoutHeight(for coverWidth: CGFloat) -> CGFloat {
        coverWidth / wellAspectRatio
    }

    var body: some View {
        let containerHeight = Self.layoutHeight(for: coverWidth)
        let ebookState = mediaViewModel.coverState(for: item, variant: .standard)
        let audioState = mediaViewModel.coverState(for: item, variant: .audioSquare)
        let hasEbookCover = ebookState.image != nil
        let hasAudioCover = audioState.image != nil
        let hasBothCovers = hasEbookCover && hasAudioCover
        // Spread is a fraction of a tile, so it scales by tileFraction into well coordinates.
        #if os(macOS)
        let swapped = swapPhase != .idle
        let scale: CGFloat =
            isHoveringCard ? Self.tileFraction * Self.hoverTileScale : Self.tileFraction
        let spread: CGFloat =
            (isHoveringCard ? Self.hoverSpread : Self.restingSpread) * Self.tileFraction
        #else
        let swapped = false
        let scale: CGFloat = Self.tileFraction
        let spread: CGFloat = Self.restingSpread * Self.tileFraction
        #endif
        let contentWidth = coverWidth - (Self.wellPadding(for: coverWidth) * 2)
        let scaledWidth = contentWidth * scale
        let ebookHeight = scaledWidth / 0.67
        let audioSize = scaledWidth
        let xShift = contentWidth * spread
        let themedPanelHeight = containerHeight
        let notchBadgeDiameter: CGFloat = 21
        let notchBadgeRadius = notchBadgeDiameter / 2
        let notchGap = max(3, coverWidth * 0.02)
        let panelEdgeInset: CGFloat = 2
        let badgeCoverRightEdge =
            hasBothCovers ? -xShift + (scaledWidth / 2) : scaledWidth / 2
        let badgeCoverVerticalEdge = hasAudioCover ? audioSize / 2 : ebookHeight / 2
        let badgeX = min(
            badgeCoverRightEdge + notchBadgeRadius + notchGap,
            (coverWidth / 2) - notchBadgeRadius - panelEdgeInset,
        )
        let badgeY = min(
            badgeCoverVerticalEdge + notchBadgeRadius + notchGap,
            (themedPanelHeight / 2) - notchBadgeRadius - panelEdgeInset,
        )

        #if os(macOS)
        let audioXOffset: CGFloat =
            switch swapPhase {
                case .idle: xShift
                case .slidingOut: coverWidth * 0.35
                case .swapped: xShift
            }
        let audioScale: CGFloat = hasBothCovers && swapPhase == .slidingOut ? 1.1 : 1.0
        let audioZ: Double = swapPhase == .idle ? 10 : 30
        let ebookXOffset: CGFloat =
            switch swapPhase {
                case .idle: -xShift
                case .slidingOut: -coverWidth * 0.25
                case .swapped: -xShift
            }
        let ebookZ: Double = swapPhase == .idle ? 20 : 5
        #else
        let audioXOffset = xShift
        let audioScale: CGFloat = 1.0
        let audioZ: Double = 10
        let ebookXOffset = -xShift
        let ebookZ: Double = 20
        #endif

        let palette = derivedPalette(ebookState: ebookState, audioState: audioState)
        let displayedAudioXOffset = hasBothCovers ? audioXOffset : 0
        let displayedEbookXOffset = hasBothCovers ? ebookXOffset : 0
        // Mirrors the web: unsynced double covers sit slightly askew until the book gains a
        // readaloud alignment, unless the user forces straight covers.
        let coverTilt: Double =
            hasBothCovers && !item.hasAvailableReadaloud
                && mediaViewModel.cachedConfig.library.doubleCoverAlignment != "straight"
            ? 2.5 : 0

        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(palette.surface)
                .frame(width: coverWidth, height: themedPanelHeight)
                .overlay(alignment: .bottom) {
                    if let lineProgress {
                        MediaProgressBar(progress: lineProgress, backgroundOpacity: 0.3)
                            .tint(palette.accent)
                            .frame(height: 3)
                    }
                }
                .clipShape(
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                )

            if audioState.image != nil {
                coverImage(state: audioState)
                    .frame(width: audioSize, height: audioSize)
                    .stableCoverRendering()
                    .clipShape(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    )
                    .scaleEffect(audioScale)
                    .rotationEffect(.degrees(coverTilt))
                    .contentShape(Rectangle())
                    .offset(x: displayedAudioXOffset)
                    .zIndex(audioZ)
                    #if os(macOS)
                .onTapGesture {
                    if hasBothCovers {
                        toggleSwap()
                    }
                }
                    #endif
            }

            if ebookState.image != nil {
                coverImage(state: ebookState)
                    .frame(width: scaledWidth, height: ebookHeight)
                    .stableCoverRendering()
                    .clipShape(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    )
                    .rotationEffect(.degrees(-coverTilt))
                    .offset(x: displayedEbookXOffset)
                    .zIndex(ebookZ)
            }

            if ebookState.image != nil || audioState.image != nil {
                if showReadaloudWedge {
                    // Nestled in the empty top-right corner with an equal gap to the ebook's right
                    // edge (horizontal) and the audio's top edge (vertical). The badge half-size
                    // cancels out of both gaps, so they stay equal at any icon size or hover spread.
                    let flatBadge = !mediaViewModel.cachedConfig.library.progressBadgeBackground
                    ZStack {
                        if !flatBadge {
                            Circle()
                                .fill(palette.accentBackground)
                        }
                        Image("readalong")
                            .renderingMode(.template)
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(
                                flatBadge ? palette.ratingAccent(for: colorScheme) : palette.accent
                            )
                            .padding(flatBadge ? 2 : 5)
                    }
                    .frame(width: notchBadgeDiameter, height: notchBadgeDiameter)
                    .offset(x: badgeX, y: -badgeY)
                    .zIndex(100)
                }

                if let notchProgress {
                    // Mirror of the readaloud wedge in the bottom-right notch.
                    CircularProgressBadge(
                        progress: notchProgress,
                        showsBackground: true,
                        backgroundColor: palette.accentBackground,
                        ringDiameter: 15,
                        backgroundDiameter: notchBadgeDiameter,
                    )
                    .tint(palette.accent)
                    .offset(x: badgeX, y: badgeY)
                    .zIndex(100)
                }
            }
        }
        .frame(width: coverWidth, height: containerHeight)
        .animation(.easeInOut(duration: 0.25), value: isHoveringCard)
        .animation(.easeInOut(duration: 0.3), value: coverTilt)
        #if os(macOS)
        .onAppear {
            if swapPhase == .idle && persistedAudioFront {
                swapPhase = .swapped
            }
        }
        #endif
        .task {
            debugCoverLog(
                "task ebookLoaded=\(ebookState.image != nil) audioLoaded=\(audioState.image != nil)"
            )
            mediaViewModel.ensureCoverLoaded(
                for: item,
                variant: .standard,
                debugSource: debugContext,
            )
            mediaViewModel.ensureCoverLoaded(
                for: item,
                variant: .audioSquare,
                debugSource: debugContext,
            )
        }
        .onAppear {
            debugCoverLog(
                "appear ebookLoaded=\(ebookState.image != nil) audioLoaded=\(audioState.image != nil)"
            )
        }
        .onChange(of: ebookState.image != nil) { _, loaded in
            debugCoverLog("ebookLoaded changed=\(loaded)")
        }
        .onChange(of: audioState.image != nil) { _, loaded in
            debugCoverLog("audioLoaded changed=\(loaded)")
        }
        .onDisappear {
            debugCoverLog(
                "disappear ebookLoaded=\(ebookState.image != nil) audioLoaded=\(audioState.image != nil)"
            )
            mediaViewModel.cancelCoverLoad(for: item, variant: .standard)
            mediaViewModel.cancelCoverLoad(for: item, variant: .audioSquare)
        }
    }

    private func derivedPalette(
        ebookState: MediaViewModel.CoverImageState,
        audioState: MediaViewModel.CoverImageState,
    ) -> CoverDerivedPalette {
        let image = ebookState.cgImage ?? audioState.cgImage
        return (image.flatMap(CoverDerivedPalette.make(from:)) ?? .fallback())
            .adjusted(for: mediaViewModel.cachedConfig.library)
            .resolved(for: colorScheme)
    }

    private func debugCoverLog(_ message: String) {
        let context = debugContext ?? "library"
        debugLog(
            "[MetadataCoverRefresh] doubleCover[\(context)] \(message) title='\(item.title)' id=\(item.id)"
        )
    }

    #if os(macOS)
    private static let audioFrontKey = "doubleCoverAudioFront.v2"

    private var persistedAudioFront: Bool {
        persistedAudioFrontBookIDs.contains(item.id)
    }

    private func persistAudioFront(_ front: Bool) {
        var bookIDs = persistedAudioFrontBookIDs
        if front { bookIDs.insert(item.id) } else { bookIDs.remove(item.id) }
        guard let data = try? JSONEncoder().encode(bookIDs.sorted()) else { return }
        UserDefaults.standard.set(data, forKey: Self.audioFrontKey)
    }

    private var persistedAudioFrontBookIDs: Set<BookID> {
        guard let data = UserDefaults.standard.data(forKey: Self.audioFrontKey),
            let bookIDs = try? JSONDecoder().decode([BookID].self, from: data)
        else { return [] }
        return Set(bookIDs)
    }

    private func toggleSwap() {
        swapTask?.cancel()
        let goingToSwapped = swapPhase == .idle
        persistAudioFront(goingToSwapped)
        isSwapping = true
        swapTask = Task { @MainActor in
            withAnimation(.easeInOut(duration: 0.25)) { swapPhase = .slidingOut }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.25)) {
                swapPhase = goingToSwapped ? .swapped : .idle
            }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            isSwapping = false
        }
    }
    #endif

    @ViewBuilder
    private func coverImage(state: MediaViewModel.CoverImageState) -> some View {
        if let image = state.image {
            image
                .resizable()
                .interpolation(.high)
                .scaledToFill()
        } else {
            placeholderColor
        }
    }
}

struct SourceBadge: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.7)))
    }
}

struct ReadaloudIcon: View {
    let size: CGFloat

    var body: some View {
        Image("readalong")
            .renderingMode(.template)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: size)
    }
}

struct AudioIndicatorBadge: View {
    let item: BookMetadata
    let coverVariant: MediaViewModel.CoverVariant

    private enum BadgeKind {
        case readaloud
        case headphones
        case book
    }

    private var badge: BadgeKind? {
        switch coverVariant {
            case .standard:
                if item.hasAvailableReadaloud { return .readaloud }
                if item.hasAvailableAudiobook { return .headphones }
            case .audioSquare:
                if item.hasAvailableReadaloud { return .readaloud }
                if item.hasAvailableEbook { return .book }
        }
        return nil
    }

    private var helpText: String {
        switch badge {
            case .readaloud: "Readaloud available"
            case .headphones: "Audiobook available"
            case .book: "Ebook available"
            case nil: ""
        }
    }

    var body: some View {
        if let badge {
            ZStack {
                Circle()
                    .fill(Color.black.opacity(0.78))
                switch badge {
                    case .readaloud:
                        Image("readalong")
                            .renderingMode(.template)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 12, height: 12)
                            .foregroundStyle(.white.opacity(0.92))
                    case .headphones:
                        Image(systemName: "headphones")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                    case .book:
                        Image(systemName: "book.fill")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                }
            }
            .frame(width: 18, height: 18)
            #if os(macOS)
            .help(helpText)
            #endif
        }
    }
}

#endif
