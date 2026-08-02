#if os(iOS) || os(macOS)
import SwiftUI

struct MediaCompactCardView: View {
    let item: BookMetadata
    let mediaKind: MediaKind
    let coverPreference: CoverPreference
    let tileSize: CGFloat
    let showAudioIndicator: Bool
    let sourceLabel: String?
    let seriesPositionBadge: String?
    let progressStyle: ProgressIndicatorStyle
    let isSelected: Bool
    let onSelect: (BookMetadata) -> Void
    let onInfo: (BookMetadata) -> Void
    var onEditMetadata: (([BookID]) -> Void)? = nil
    var isBulkSelected: Bool = false
    var isBulkSelectionMode: Bool = false
    var onToggleBulkSelection: ((BookMetadata) -> Void)? = nil
    @Environment(MediaViewModel.self) private var mediaViewModel
    @Environment(\.colorScheme) private var colorScheme
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    @State private var isHovered = false
    @State private var hoveredTab: TabCategory?
    #endif
    private var palette: CoverDerivedPalette {
        let ebook = mediaViewModel.coverState(for: item, variant: .standard).cgImage
        let audio = mediaViewModel.coverState(for: item, variant: .audioSquare).cgImage
        return ((ebook ?? audio).flatMap(CoverDerivedPalette.make(from:)) ?? .fallback())
            .adjusted(for: mediaViewModel.cachedConfig.library)
            .resolved(for: colorScheme)
    }

    private var availableMediaColor: Color { palette.mutedAccent }
    #if os(iOS)
    @Environment(\.mediaNavigationPath) private var mediaNavigationPath
    @Environment(\.editMetadataAction) private var editMetadataAction
    @State private var pendingDetailsNavigation = false
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
            .contextMenu { iOSContextMenu }
        } else {
            NavigationLink(value: item) {
                cardContent
            }
            .buttonStyle(.plain)
            .background(deferredNavigationLinks)
            .contextMenu { iOSContextMenu }
        }
        #else
        cardContent
        #endif
    }

    private var isDoubleCover: Bool {
        coverPreference == .storytellerDouble
    }

    private var cardContent: some View {
        let coverVariant = resolveCoverVariant(for: item)
        let aspectRatio = coverPreference.preferredContainerAspectRatio
        let coverState = mediaViewModel.coverState(for: item, variant: coverVariant)
        let fallbackVariant: MediaViewModel.CoverVariant =
            coverVariant == .standard ? .audioSquare : .standard
        let fallbackState = mediaViewModel.coverState(for: item, variant: fallbackVariant)
        let displayImage = coverState.image ?? fallbackState.image
        let shownVariant: MediaViewModel.CoverVariant =
            coverState.image == nil && fallbackState.image != nil ? fallbackVariant : coverVariant
        let shouldRenderDoubleCover = isDoubleCover
        let slotHeight =
            shouldRenderDoubleCover
            ? DoubleCoverView.layoutHeight(for: tileSize) : tileSize / aspectRatio
        let placeholderColor = Color(white: 0.2)
        let progress = mediaViewModel.progress(for: item.id)

        return VStack(spacing: 0) {
            Group {
                if shouldRenderDoubleCover {
                    DoubleCoverView(
                        item: item,
                        placeholderColor: placeholderColor,
                        coverWidth: tileSize,
                        cornerRadius: 8,
                        isSwapping: .constant(false),
                        showReadaloudWedge: showAudioIndicator && item.hasAvailableReadaloud,
                        notchProgress: (progressStyle == .circle && progress > 0) ? progress : nil,
                        lineProgress: (progressStyle == .line && progress > 0) ? progress : nil,
                    )
                    .frame(width: tileSize, height: slotHeight)
                } else {
                    RoundedCoverArtwork(
                        image: displayImage,
                        placeholderColor: placeholderColor,
                        variant: shownVariant,
                        cornerRadius: 8,
                    )
                    // Keep every compact tile in the selected cover-style slot. If we fall back
                    // from a missing square audiobook cover to a portrait ebook cover,
                    // RoundedCoverArtwork fits it inside this square instead of growing the row.
                    .frame(width: tileSize, height: tileSize / aspectRatio)
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.14), lineWidth: 1)
                    }
                }
            }
            .stableCoverRendering()
            .overlay(alignment: .bottom) {
                if progressStyle == .line && progress > 0 && !shouldRenderDoubleCover {
                    MediaProgressBar(progress: progress, backgroundOpacity: 0.3)
                        .frame(height: 3)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                if progress > 0 {
                    if progressStyle == .circle && !shouldRenderDoubleCover {
                        CoverThemedProgressBadge(
                            item: item,
                            variant: shownVariant,
                            progress: progress,
                        )
                        .padding(.trailing, 3)
                        .padding(.bottom, 3)
                    } else if progressStyle == .text {
                        ProgressTextBadge(progress: progress)
                            .padding(.trailing, 3)
                            .padding(.bottom, 3)
                    }
                }
            }
            .overlay(alignment: .bottomLeading) {
                if let sourceLabel = sourceLabel {
                    SourceBadge(label: sourceLabel)
                        .padding(2)
                }
            }
            .overlay(alignment: .topTrailing) {
                if showAudioIndicator && !shouldRenderDoubleCover {
                    AudioIndicatorBadge(item: item, coverVariant: coverVariant)
                        .padding(.trailing, 2)
                        .padding(.top, 2)
                }
            }
            .overlay(alignment: .topLeading) {
                if isBulkSelected || isBulkSelectionMode {
                    BulkSelectionCheckmark(isSelected: isBulkSelected)
                        .padding(4)
                } else if let badge = seriesPositionBadge {
                    Text(badge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(
                            .black.opacity(0.6),
                            in: RoundedRectangle(cornerRadius: 4, style: .continuous),
                        )
                        .padding(2)
                }
            }
            #if os(macOS)
            .overlay {
                if isHovered {
                    playOverlay
                }
            }
            #endif
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        (isSelected || isBulkSelected)
                            ? (shouldRenderDoubleCover ? palette.accent : Color.accentColor)
                            : Color.clear,
                        lineWidth: 2,
                    )
            )
            // Slot keeps a uniform row height; the cover (and its badges) center within it.
            .frame(width: tileSize, height: slotHeight)
        }
        .contentShape(Rectangle())
        #if os(macOS)
        .onTapGesture {
            onSelect(item)
        }
        .simultaneousGesture(
            TapGesture(count: 2)
                .onEnded { _ in
                    onInfo(item)
                }
        )
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            BookContextMenuContent(
                item: item,
                onInfo: onInfo,
                onEditMetadata: onEditMetadata,
            )
        }
        #endif
        .task(id: coverVariant) {
            mediaViewModel.ensureCoverLoaded(for: item, variant: coverVariant)
            mediaViewModel.ensureCoverLoaded(for: item, variant: fallbackVariant)
        }
        .onDisappear {
            mediaViewModel.cancelCoverLoad(for: item, variant: coverVariant)
            mediaViewModel.cancelCoverLoad(for: item, variant: fallbackVariant)
        }
    }

    #if os(iOS)
    @ViewBuilder
    private var iOSContextMenu: some View {
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
                forBooks: [item.id],
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

    private func handleDetailsNavigation() {
        if let mediaNavigationPath {
            mediaNavigationPath.wrappedValue.append(item)
        } else {
            pendingDetailsNavigation = true
        }
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

    private var preferredPlayerBookData: PlayerBookData? {
        let settings = mediaViewModel.cachedConfig.library
        guard settings.tapToPlayPreferredPlayer else { return nil }

        let syncedDownloaded = mediaViewModel.isCategoryDownloaded(.synced, for: item)
        let audioDownloaded = mediaViewModel.isCategoryDownloaded(.audio, for: item)
        let ebookDownloaded = mediaViewModel.isCategoryDownloaded(.ebook, for: item)

        let category: LocalMediaCategory?
        if syncedDownloaded {
            category = .synced
        } else if audioDownloaded && ebookDownloaded {
            category = settings.preferAudioOverEbook ? .audio : .ebook
        } else if audioDownloaded {
            category = .audio
        } else if ebookDownloaded {
            category = .ebook
        } else {
            category = nil
        }

        guard let category else { return nil }
        let freshMetadata = mediaViewModel.library.bookMetaData.first { $0.id == item.id } ?? item
        let path = mediaViewModel.localMediaPath(for: item.id, category: category)
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
            category: category,
            coverArt: cover,
            ebookCoverArt: ebookCover,
        )
    }
    #endif

    private func resolveCoverVariant(for item: BookMetadata) -> MediaViewModel.CoverVariant {
        mediaViewModel.coverVariant(for: item, preference: coverPreference)
    }

    #if os(macOS)
    private enum TabCategory: CaseIterable {
        case ebook, audio, synced

        var localCategory: LocalMediaCategory {
            switch self {
                case .ebook: return .ebook
                case .audio: return .audio
                case .synced: return .synced
            }
        }

        @ViewBuilder
        func iconView(size: CGFloat) -> some View {
            switch self {
                case .ebook:
                    Image("ebookIcon")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: size, height: size)
                case .audio:
                    Image(systemName: "headphones")
                        .font(.system(size: size))
                case .synced:
                    ReadaloudIcon(size: size)
            }
        }
    }

    private enum ButtonSize {
        case large, medium, small
        var frame: CGFloat {
            switch self { case .large: 44 case .medium: 37 case .small: 30
            }
        }
        var icon: CGFloat {
            switch self { case .large: 26 case .medium: 22 case .small: 18
            }
        }
        var playIcon: CGFloat {
            switch self { case .large: 36 case .medium: 28 case .small: 24
            }
        }
    }

    private var availableTabs: [TabCategory] {
        [.ebook, .synced, .audio].filter { tabStatus(for: $0) != .unavailable }
    }

    private func buttonSize(for tab: TabCategory, in tabs: [TabCategory]) -> ButtonSize {
        let hasSynced = tabs.contains(.synced)
        switch tabs.count {
            case 1: return .large
            case 2: return hasSynced ? (tab == .synced ? .large : .small) : .medium
            default: return tab == .synced ? .large : .small
        }
    }

    private var playOverlay: some View {
        Group {
            let tabs = availableTabs
            if !tabs.isEmpty {
                let slots: [TabCategory] =
                    tabs.contains(.synced) ? [.ebook, .synced, .audio] : tabs
                HStack(spacing: 8) {
                    ForEach(slots, id: \.self) { tab in
                        let size = buttonSize(for: tab, in: tabs)
                        if tabs.contains(tab) {
                            tabButton(for: tab, size: size)
                        } else {
                            Color.clear
                                .frame(width: size.frame, height: size.frame)
                        }
                    }
                }
            }
        }
    }

    private enum TabStatus: Equatable {
        case unavailable
        case availableNotDownloaded
        case downloaded
        case downloading(progress: Double?)
        case failed
    }

    private func tabStatus(for tab: TabCategory) -> TabStatus {
        let category = tab.localCategory
        let downloading = mediaViewModel.isCategoryDownloadInProgress(
            for: item,
            category: category,
        )
        if downloading {
            let progress = mediaViewModel.downloadProgressFraction(for: item, category: category)
            return .downloading(progress: progress)
        }

        let downloaded = mediaViewModel.isCategoryDownloaded(category, for: item)
        if downloaded { return .downloaded }

        if mediaViewModel.isCategoryDownloadFailed(for: item, category: category) {
            return .failed
        }

        let available: Bool
        switch tab {
            case .ebook: available = item.hasAvailableEbook
            case .audio: available = item.hasAvailableAudiobook
            case .synced: available = item.hasAvailableReadaloud
        }

        return available ? .availableNotDownloaded : .unavailable
    }

    @ViewBuilder
    private func tabButton(for tab: TabCategory, size: ButtonSize) -> some View {
        let status = tabStatus(for: tab)
        let isTabHovered = hoveredTab == tab

        Button {
            handleTabTap(for: tab)
        } label: {
            ZStack {
                Circle()
                    .fill(palette.accentBackground)
                    .frame(width: size.frame, height: size.frame)
                tabIcon(for: tab, status: status, isHovered: isTabHovered, size: size)
            }
            .frame(width: size.frame, height: size.frame)
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredTab = hovering ? tab : nil
        }
    }

    @ViewBuilder
    private func tabIcon(
        for tab: TabCategory,
        status: TabStatus,
        isHovered: Bool,
        size: ButtonSize,
    ) -> some View {
        if case .downloading(let progress) = status {
            DownloadCancelProgressIcon(
                progress: progress,
                color: palette.brightAccent,
                size: size.icon,
                lineWidth: 2.5,
                showsCancel: isHovered,
            )
        } else if status == .failed {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: size.icon))
                .foregroundStyle(.red)
        } else if isHovered && status == .availableNotDownloaded {
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: size.playIcon))
                .foregroundStyle(palette.brightAccent)
        } else if isHovered && status == .downloaded {
            Image(systemName: "play.circle.fill")
                .font(.system(size: size.playIcon))
                .foregroundStyle(palette.brightAccent)
        } else {
            tab.iconView(size: size.icon)
                .foregroundStyle(
                    status == .downloaded
                        ? AnyShapeStyle(palette.brightAccent)
                        : AnyShapeStyle(availableMediaColor)
                )
        }
    }

    private func handleTabTap(for tab: TabCategory) {
        let category = tab.localCategory
        let status = tabStatus(for: tab)

        if case .downloading = status {
            mediaViewModel.cancelDownload(for: item, category: category)
        } else if status == .downloaded {
            openMedia(for: category)
        } else if status == .failed || status == .availableNotDownloaded {
            mediaViewModel.startDownload(for: item, category: category)
        }
    }

    private func openMedia(for category: LocalMediaCategory) {
        let windowID: String
        switch category {
            case .audio:
                windowID = "AudiobookPlayer"
            case .ebook, .synced:
                windowID = "EbookPlayer"
        }
        let path = mediaViewModel.localMediaPath(for: item.id, category: category)
        let variant: MediaViewModel.CoverVariant =
            item.hasAvailableAudiobook ? .audioSquare : .standard
        let cover = mediaViewModel.coverImage(for: item, variant: variant)
        let ebookCover =
            item.hasAvailableAudiobook
            ? mediaViewModel.coverImage(for: item, variant: .standard)
            : nil
        let bookData = PlayerBookData(
            metadata: item,
            localMediaPath: path,
            category: category,
            coverArt: cover,
            ebookCoverArt: ebookCover,
        )
        openWindow(id: windowID, value: bookData)
    }
    #endif
}

#endif
