#if os(iOS) || os(macOS)
import SwiftUI
import WebKit

#if os(macOS)
import AppKit
#else
import UIKit
#endif

#if canImport(Translation)
import Translation
#endif

extension View {
    @ViewBuilder
    func systemTranslationPresentation(isPresented: Binding<Bool>, text: String) -> some View {
        #if canImport(Translation)
        if #available(iOS 17.4, macOS 14.4, *) {
            self.translationPresentation(isPresented: isPresented, text: text)
        } else {
            self
        }
        #else
        self
        #endif
    }
}

#if os(iOS)
extension Notification.Name {
    static let appWillResignActive = Notification.Name("appWillResignActive")
}
#endif

private struct PendingSelectionWrapper: Identifiable {
    let selection: TextSelectionMessage
    var id: String { selection.cfi }
}

public struct EbookPlayerView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    #if os(macOS)
    @Environment(\.openSettings) private var openSettings
    @State private var baseContentWidth: CGFloat?
    @State private var isAnimatingRightSidebar = false
    @State private var isAnimatingLeftSidebar = false
    #else
    @Environment(\.dismiss) private var dismiss
    #endif
    @State private var viewModel: EbookPlayerViewModel
    @State private var isComicScrubberVisible = false
    private let onClose: (() -> Void)?

    public init(bookData: PlayerBookData?, onClose: (() -> Void)? = nil) {
        self.viewModel = EbookPlayerViewModel(bookData: bookData)
        self.onClose = onClose
    }

    public var body: some View {
        Group {
            #if os(macOS)
            mainLayout
            #else
            readerLayout
            #endif
        }
        .background(readerBackgroundColor)
        .systemTranslationPresentation(
            isPresented: $viewModel.showTranslation,
            text: viewModel.translationText,
        )
        #if os(iOS)
        .statusBarHidden(!viewModel.isTopBarVisible)
        .persistentSystemOverlays(viewModel.isTopBarVisible ? .automatic : .hidden)
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .tabBar)
        .onReceive(NotificationCenter.default.publisher(for: .appWillResignActive)) { _ in
            var backgroundTask: UIBackgroundTaskIdentifier = .invalid

            backgroundTask = UIApplication.shared.beginBackgroundTask {
                debugLog("[EbookPlayerView] Background task expiring - cleaning up")
                if backgroundTask != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTask)
                    backgroundTask = .invalid
                }
            }

            Task {
                await viewModel.handleAppBackgrounding()

                if backgroundTask != .invalid {
                    UIApplication.shared.endBackgroundTask(backgroundTask)
                    backgroundTask = .invalid
                }
            }
        }
        #else
        .onKeyPress(.leftArrow) {
            viewModel.progressManager?.handleUserNavLeft()
            return .handled
        }
        .onKeyPress(.rightArrow) {
            viewModel.progressManager?.handleUserNavRight()
            return .handled
        }
        .onKeyPress(.upArrow) {
            viewModel.handlePrevSentence()
            return .handled
        }
        .onKeyPress(.downArrow) {
            viewModel.handleNextSentence()
            return .handled
        }
        .onKeyPress(.space) {
            Task { await viewModel.progressManager?.togglePlaying() }
            return .handled
        }
        .toolbar {
            EbookPlayerToolbar(viewModel: viewModel)
        }
        .background(
            TitleBarHoverMonitor(threshold: 60) { hovering in
                if viewModel.isTitleBarHovered != hovering {
                    viewModel.isTitleBarHovered = hovering
                }
            }
        )
        .background(
            TitleBarConfigurator(
                isTitleBarVisible: isTitleBarVisible,
                windowTitle: viewModel.bookData?.metadata.title ?? "Ebook Reader",
                onApplied: { viewModel.handleTitleBarApplied() },
            )
        )
        .navigationTitle(viewModel.bookData?.metadata.title ?? "Ebook Reader")
        #endif
        .onAppear {
            viewModel.handleOnAppear()
        }
        .onDisappear {
            #if os(iOS)
            debugLog(
                "[EbookPlayerView] onDisappear scenePhase=\(scenePhase) bookId=\(viewModel.bookData?.metadata.uuid ?? "nil")"
            )
            if scenePhase == .active {
                let keepsSession = PlayerPresenter.shared.cardDismissalKeepsSession()
                viewModel.handleOnDisappear(close: keepsSession ? .detachView : .endSession)
            } else {
                viewModel.handleOnDisappear(close: nil)
            }
            #else
            viewModel.handleOnDisappear()
            #endif
        }
        .onChange(of: colorScheme) { _, newScheme in
            viewModel.handleColorSchemeChange(newScheme)
        }
        .onChange(of: scenePhase) { _, newPhase in
            viewModel.handleScenePhaseChange(newPhase)
        }
        .onChange(of: viewModel.settingsVM.highlightColorsHash) { _, _ in
            Task { await viewModel.refreshHighlightColors() }
        }
        #if os(iOS)
        .sheet(isPresented: $viewModel.showBookmarksPanel) {
            NavigationStack {
                BookmarksPanel(
                    bookmarks: viewModel.bookmarks,
                    highlights: viewModel.coloredHighlights,
                    onDismiss: { viewModel.showBookmarksPanel = false },
                    onNavigate: { highlight in
                        Task {
                            await viewModel.navigateToHighlight(highlight)
                            viewModel.showBookmarksPanel = false
                        }
                    },
                    onDelete: { highlight in
                        Task { await viewModel.deleteHighlight(highlight) }
                    },
                    onAddBookmark: {
                        Task { await viewModel.addBookmarkAtCurrentPage() }
                    },
                    highlightColorResolver: { color in
                        guard let color else { return Color.yellow.opacity(0.4) }
                        let hex = viewModel.settingsVM.hexColor(for: color)
                        return Color(hex: hex) ?? color.color
                    },
                    initialTab: viewModel.bookmarksPanelInitialTab,
                )
                .navigationTitle("Bookmarks & Highlights")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {
                            viewModel.showBookmarksPanel = false
                        }
                    }
                }
            }
        }
        #endif
        .sheet(
            item: Binding(
                get: { viewModel.pendingSelection.map { PendingSelectionWrapper(selection: $0) } },
                set: { _ in viewModel.cancelPendingSelection() },
            )
        ) { wrapper in
            HighlightCreationSheet(
                settingsVM: viewModel.settingsVM,
                selectedText: wrapper.selection.text,
                onSave: { color, note in
                    Task {
                        await viewModel.addHighlight(
                            from: wrapper.selection,
                            color: color,
                            note: note,
                        )
                    }
                },
                onCancel: { viewModel.cancelPendingSelection() },
            )
        }
        .sheet(
            item: Binding(
                get: { viewModel.pendingEditHighlight },
                set: { _ in viewModel.cancelPendingEdit() },
            )
        ) { highlight in
            HighlightCreationSheet(
                settingsVM: viewModel.settingsVM,
                selectedText: highlight.text,
                onSave: { color, note in
                    Task {
                        await viewModel.saveEditedHighlight(
                            highlight,
                            color: color,
                            note: note,
                        )
                    }
                },
                onCancel: { viewModel.cancelPendingEdit() },
                title: "Edit Highlight",
                initialColor: highlight.color,
                initialNote: highlight.note ?? "",
            )
        }
        .alert(
            "Server Has Newer Position",
            isPresented: $viewModel.showServerPositionDialog,
        ) {
            Button("Go to New Position") {
                viewModel.acceptServerPosition()
            }
            Button("Stay Here", role: .cancel) {
                viewModel.declineServerPosition()
            }
        } message: {
            Text(viewModel.serverPositionDescription)
        }
    }

    #if os(macOS)
    private let leftSidebarWidth: CGFloat = 260
    private let leftSidebarTotalWidth: CGFloat = 261
    // Measured title-bar inset: the full-bleed webview otherwise paginates into the
    // 32px hidden behind the title bar, clipping the top line of every page.
    private let readerTopInset: CGFloat = 32

    private var isTitleBarVisible: Bool {
        viewModel.isTitleBarHovered || viewModel.showCustomizePopover
            || viewModel.showKeybindingsPopover || viewModel.showSearchPanel
            || viewModel.showBookmarksPanel || viewModel.pendingSearchReveal
    }

    private var mainLayout: some View {
        GeometryReader { geometry in
            let rightAdjustment: CGFloat = viewModel.showAudioSidebar ? 361 : 0
            let leftAdjustment: CGFloat = viewModel.showChapterSidebar ? leftSidebarTotalWidth : 0
            let contentWidth =
                baseContentWidth ?? (geometry.size.width - rightAdjustment - leftAdjustment)

            HStack(spacing: 0) {
                if viewModel.showChapterSidebar {
                    HStack(spacing: 0) {
                        chapterSidebar
                            .frame(width: leftSidebarWidth)
                        Rectangle()
                            .fill(separatorColor)
                            .frame(width: 1)
                    }
                    .compositingGroup()
                    .transition(.offset(x: leftSidebarTotalWidth))
                    .zIndex(0)
                }

                readerContent
                    .padding(.top, readerTopInset)
                    .frame(width: contentWidth, height: geometry.size.height)
                    .zIndex(1)

                if viewModel.showAudioSidebar {
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(separatorColor)
                            .frame(width: 1)
                        audiobookSidebar(foregroundColor: readerForegroundColor)
                            .frame(width: 360)
                    }
                    .compositingGroup()
                    .transition(.offset(x: -361))
                    .zIndex(0)
                }
            }
            .onAppear {
                if baseContentWidth == nil {
                    let rightAdj: CGFloat = viewModel.showAudioSidebar ? 361 : 0
                    let leftAdj: CGFloat = viewModel.showChapterSidebar ? leftSidebarTotalWidth : 0
                    baseContentWidth = geometry.size.width - rightAdj - leftAdj
                }
            }
            .onChange(of: geometry.size.width) { _, newWidth in
                if !isAnimatingRightSidebar && !isAnimatingLeftSidebar {
                    let rightAdj: CGFloat = viewModel.showAudioSidebar ? 361 : 0
                    let leftAdj: CGFloat = viewModel.showChapterSidebar ? leftSidebarTotalWidth : 0
                    baseContentWidth = newWidth - rightAdj - leftAdj
                }
            }
            .onChange(of: viewModel.showAudioSidebar) { _, _ in
                isAnimatingRightSidebar = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    isAnimatingRightSidebar = false
                }
            }
            .onChange(of: viewModel.showChapterSidebar) { _, _ in
                isAnimatingLeftSidebar = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    isAnimatingLeftSidebar = false
                }
            }
        }
        .ignoresSafeArea(.container, edges: .top)
        .clipped()
        .background(
            WindowFrameAdjuster(
                expandRight: viewModel.showAudioSidebar,
                expandLeft: viewModel.showChapterSidebar,
                rightAmount: 361,
                leftAmount: leftSidebarTotalWidth,
                savedWidthKey: "EbookPlayerWindowWidth",
            )
        )
    }

    private var chapterSidebar: some View {
        EbookChapterSidebar(
            chapters: viewModel.chapterList,
            selectedChapterId: viewModel.selectedChapterHref,
            backgroundColor: readerBackgroundColor,
            onChapterSelected: { chapter in
                viewModel.handleChapterSelection(chapter)
            },
        )
    }
    #endif

    private var readerLayout: some View {
        #if os(macOS)
        readerContent
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        #else
        HStack(spacing: 0) {
            readerContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if isPad && viewModel.showAudioSidebar {
                Rectangle()
                    .fill(separatorColor)
                    .frame(width: 1)
                audiobookSidebar(foregroundColor: readerForegroundColor)
                    .frame(width: 360)
                    .padding(.horizontal, 14)
                    .transition(.move(edge: .trailing))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
    }

    private var readerBackgroundColor: Color {
        if let bgColor = viewModel.settingsVM.backgroundColor, let color = Color(hex: bgColor) {
            return color
        }
        let defaultHex =
            colorScheme == .dark ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight
        return Color(hex: defaultHex)
            ?? {
                #if os(macOS)
                Color(nsColor: .windowBackgroundColor)
                #else
                Color(uiColor: .systemBackground)
                #endif
            }()
    }

    // Views drawn over readerBackgroundColor must use this instead of semantic
    // colors: the theme background follows the user's theme while semantic colors
    // follow the system appearance, and the two can disagree.
    private var readerForegroundColor: Color {
        if let fgColor = viewModel.settingsVM.foregroundColor, !fgColor.isEmpty,
            let color = Color(hex: fgColor)
        {
            return color
        }
        let defaultHex =
            colorScheme == .dark ? kDefaultForegroundColorDark : kDefaultForegroundColorLight
        return Color(hex: defaultHex) ?? .primary
    }

    private var separatorColor: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor)
        #else
        Color(uiColor: .separator)
        #endif
    }

    private var isReaderTopChromeVisible: Bool {
        #if os(macOS)
        true
        #else
        viewModel.isTopBarVisible
        #endif
    }

    private var readerContent: some View {
        ZStack(alignment: .bottom) {
            #if os(iOS)
            readerBackgroundColor
                .ignoresSafeArea(.all)
            #endif

            ZStack {
                if viewModel.isComicBook {
                    ComicPlayerView(
                        pageURLs: viewModel.comicPageURLs,
                        selectedPageIndex: viewModel.progressManager?.selectedChapterId ?? 0,
                        backgroundColor: readerBackgroundColor,
                        isBottomScrubberVisible: isComicScrubberVisible,
                        isTopChromeVisible: isReaderTopChromeVisible,
                        onPageSelected: viewModel.handleComicPageSelected,
                        onNavigateLeft: {
                            viewModel.progressManager?.handleNativeNavLeft()
                        },
                        onNavigateRight: {
                            viewModel.progressManager?.handleNativeNavRight()
                        },
                        onToggleOverlay: {
                            viewModel.handleToggleOverlay()
                        },
                    )
                    #if os(iOS)
                    .ignoresSafeArea(.all)
                    #endif
                } else if let ebookPath = viewModel.extractedEbookPath {
                    #if os(iOS)
                    AnyView(
                        EbookPlayerWebView(
                            ebookPath: ebookPath,
                            commsBridge: $viewModel.commsBridge,
                            onBridgeReady: { bridge in
                                viewModel.installBridgeHandlers(
                                    bridge,
                                    initialColorScheme: colorScheme,
                                )
                            },
                            onContentPurged: {
                                viewModel.recoveryManager?.handleContentPurged()
                            },
                        )
                    )
                    .ignoresSafeArea(.all)
                    #else
                    AnyView(
                        EbookPlayerWebView(
                            ebookPath: ebookPath,
                            commsBridge: $viewModel.commsBridge,
                            onBridgeReady: { bridge in
                                viewModel.installBridgeHandlers(
                                    bridge,
                                    initialColorScheme: colorScheme,
                                )
                            },
                        )
                    )
                    #endif
                } else {
                    ProgressView("Loading book...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }

            #if os(iOS)
            let alwaysShowMini = viewModel.settingsVM.alwaysShowMiniPlayer
            let shouldShowStatsOverlay =
                !viewModel.showAudioSidebar && !viewModel.isTopBarVisible

            if shouldShowStatsOverlay {
                EbookOverlayIos(
                    showProgress: viewModel.settingsVM.showProgress,
                    showTimeRemainingInBook: viewModel.settingsVM.showTimeRemainingInBook,
                    showTimeRemainingInChapter: viewModel.settingsVM.showTimeRemainingInChapter,
                    showPageNumber: viewModel.settingsVM.showPageNumber,
                    showSkipBackward: viewModel.settingsVM.showOverlaySkipBackward,
                    showSkipForward: viewModel.settingsVM.showOverlaySkipForward,
                    showPlayPause: viewModel.settingsVM.showOverlayPlayPause,
                    overlayTransparency: viewModel.settingsVM.overlayTransparency,
                    bookFraction: viewModel.progressManager?.bookFraction,
                    bookTimeRemaining: viewModel.mediaOverlayManager?.bookTimeRemaining,
                    chapterTimeRemaining: viewModel.mediaOverlayManager?.chapterTimeRemaining,
                    currentPage: viewModel.progressManager?.chapterCurrentPage,
                    totalPages: viewModel.progressManager?.chapterTotalPages,
                    isPlaying: viewModel.mediaOverlayManager?.isPlaying ?? false,
                    hasAudioNarration: viewModel.hasAudioNarration,
                    backgroundColor: readerBackgroundColor,
                    positionAtTop: alwaysShowMini,
                    onSkipBackward: {
                        viewModel.handlePrevSentence()
                    },
                    onTogglePlaying: {
                        Task { await viewModel.progressManager?.togglePlaying() }
                    },
                    onSkipForward: {
                        viewModel.handleNextSentence()
                    },
                )
                .transition(.opacity)
            }

            if viewModel.isTopBarVisible {
                EbookPlayerTopToolbar(
                    hasAudioNarration: viewModel.hasAudioNarration,
                    playbackSpeed: viewModel.settingsVM.defaultPlaybackSpeed,
                    chapters: viewModel.chapterList,
                    selectedChapterId: viewModel.selectedChapterHref,
                    isSynced: viewModel.settingsVM.lockViewToAudio,
                    sleepTimerActive: viewModel.mediaOverlayManager?.sleepTimerActive ?? false,
                    sleepTimerRemaining: viewModel.mediaOverlayManager?.sleepTimerRemaining,
                    sleepTimerType: viewModel.mediaOverlayManager?.sleepTimerType,
                    showCustomizePopover: $viewModel.showCustomizePopover,
                    showSearchSheet: $viewModel.showSearchPanel,
                    showBookmarksPanel: $viewModel.showBookmarksPanel,
                    showAudioSidebar: $viewModel.showAudioSidebar,
                    searchManager: viewModel.searchManager,
                    onDismiss: {
                        if let onClose {
                            onClose()
                        } else {
                            dismiss()
                        }
                    },
                    onChapterSelected: viewModel.handleChapterSelection,
                    onSyncToggle: { enabled in
                        viewModel.settingsVM.lockViewToAudio = enabled
                        Task { try? await viewModel.settingsVM.save() }
                    },
                    onSearchResultSelected: viewModel.handleSearchResultNavigation,
                    onSleepTimerStart: viewModel.handleSleepTimerStart,
                    onSleepTimerCancel: viewModel.handleSleepTimerCancel,
                    settingsVM: viewModel.settingsVM,
                )
                .transition(.opacity)
            }

            if !(isPad && viewModel.showAudioSidebar) {
                draggableAudioCard
            }

            playbackProgressBar
            #else
            let shouldShowBar = viewModel.settingsVM.enableReadingBar && !viewModel.showAudioSidebar

            if shouldShowBar {
                let pm = viewModel.progressManager
                let mom = viewModel.mediaOverlayManager
                let progressData = ProgressData(
                    chapterLabel: pm?.selectedChapterId.flatMap { index in
                        viewModel.bookStructure[safe: index]?.label
                    },
                    chapterCurrentPage: pm?.chapterCurrentPage,
                    chapterTotalPages: pm?.chapterTotalPages,
                    chapterCurrentSecondsAudio: mom?.chapterElapsedSeconds,
                    chapterTotalSecondsAudio: mom?.chapterTotalSeconds,
                    bookCurrentSecondsAudio: mom?.bookElapsedSeconds,
                    bookTotalSecondsAudio: mom?.bookTotalSeconds,
                    bookCurrentFraction: pm?.bookFraction,
                )
                let bgHex =
                    viewModel.settingsVM.backgroundColor
                    ?? (colorScheme == .dark
                        ? kDefaultBackgroundColorDark : kDefaultBackgroundColorLight)
                let isLight = isLightColor(hex: bgHex)

                EbookOverlayMac(
                    readingBarConfig: viewModel.settingsVM.readingBarConfig,
                    progressData: progressData,
                    isPlaying: mom?.isPlaying ?? false,
                    playbackRate: mom?.playbackRate ?? viewModel.settingsVM.defaultPlaybackSpeed,
                    isLightBackground: isLight,
                    backgroundColor: readerBackgroundColor,
                    chapterProgress: viewModel.chapterProgressBinding,
                    onPrevChapter: viewModel.handlePrevChapter,
                    onSkipBackward: viewModel.handlePrevSentence,
                    onPlayPause: {
                        Task { await pm?.togglePlaying() }
                    },
                    onSkipForward: viewModel.handleNextSentence,
                    onNextChapter: viewModel.handleNextChapter,
                    onProgressSeek: viewModel.handleProgressSeek,
                )
                .ignoresSafeArea(edges: .bottom)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            #endif
        }
    }

    #if os(iOS)
    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    private var safeAreaInsets: EdgeInsets {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let window = windowScene.windows.first
        else {
            return EdgeInsets()
        }
        return EdgeInsets(
            top: window.safeAreaInsets.top,
            leading: window.safeAreaInsets.left,
            bottom: window.safeAreaInsets.bottom,
            trailing: window.safeAreaInsets.right,
        )
    }

    @ViewBuilder
    private var draggableAudioCard: some View {
        let pm = viewModel.progressManager
        let mom = viewModel.mediaOverlayManager
        let currentChapterTitle = pm?.selectedChapterId.flatMap { index in
            viewModel.bookStructure[safe: index]?.label
        }
        let alwaysShow = viewModel.settingsVM.alwaysShowMiniPlayer
        let isPresentedBinding = Binding(
            get: { alwaysShow || self.viewModel.isReadingBarVisible },
            set: { newValue in
                if !alwaysShow {
                    self.viewModel.isReadingBarVisible = newValue
                }
            },
        )

        DraggableAudioCard(
            isPresented: isPresentedBinding,
            alwaysShow: alwaysShow,
            collapseTrigger: viewModel.collapseCardTrigger,
            bookTitle: viewModel.bookData?.metadata.title,
            coverArt: viewModel.bookData?.coverArt,
            ebookCoverArt: viewModel.bookData?.ebookCoverArt,
            chapterTitle: currentChapterTitle,
            isPlaying: mom?.isPlaying ?? false,
            chapterProgress: viewModel.chapterProgressBinding.wrappedValue,
            chapterElapsedSeconds: mom?.chapterElapsedSeconds,
            chapterTotalSeconds: mom?.chapterTotalSeconds,
            bookTimeRemaining: mom?.bookTimeRemaining,
            playbackRate: mom?.playbackRate ?? viewModel.settingsVM.defaultPlaybackSpeed,
            hasAudioNarration: viewModel.hasAudioNarration,
            chapters: viewModel.chapterList,
            selectedChapterHref: viewModel.selectedChapterHref,
            sleepTimerActive: mom?.sleepTimerActive ?? false,
            sleepTimerRemaining: mom?.sleepTimerRemaining,
            sleepTimerType: mom?.sleepTimerType,
            showMiniPlayerStats: viewModel.settingsVM.showMiniPlayerStats,
            supportsComicScrubber: viewModel.isComicBook,
            onPlayPause: {
                Task { await pm?.togglePlaying() }
            },
            onSkipBackward: {
                viewModel.handlePrevSentence()
            },
            onSkipForward: {
                viewModel.handleNextSentence()
            },
            onPrevChapter: {
                viewModel.handlePrevChapter()
            },
            onNextChapter: {
                viewModel.handleNextChapter()
            },
            onProgressSeek: viewModel.handleProgressSeek,
            onPlaybackRateChange: viewModel.handlePlaybackRateChange,
            onChapterSelected: viewModel.handleChapterSelection,
            onSleepTimerStart: viewModel.handleSleepTimerStart,
            onSleepTimerCancel: viewModel.handleSleepTimerCancel,
            onDismiss: {
                viewModel.isReadingBarVisible = false
            },
            onComicScrubberVisibilityChange: { visible in
                isComicScrubberVisible = visible
            },
            fullContent: {
                audiobookSidebar()
            },
        )
    }

    private var playbackProgressBar: some View {
        let progress = viewModel.chapterProgressBinding.wrappedValue
        return GeometryReader { geometry in
            let inset = geometry.size.width * 0.1
            let availableWidth = geometry.size.width - (inset * 2)
            Color.gray
                .opacity(colorScheme == .dark ? 0.6 : 0.7)
                .frame(width: availableWidth * progress, height: 3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, inset)
        }
        .frame(height: 3)
        .frame(maxHeight: .infinity, alignment: .bottom)
        .ignoresSafeArea()
    }
    #endif

    #if os(macOS)
    private func isLightColor(hex: String) -> Bool {
        guard let color = Color(hex: hex) else {
            return colorScheme == .light
        }
        let nsColor = NSColor(color)
        guard let converted = nsColor.usingColorSpace(.sRGB) else {
            return colorScheme == .light
        }
        let brightness =
            (converted.redComponent * 299 + converted.greenComponent * 587 + converted.blueComponent
                * 114) / 1000
        return brightness > 0.5
    }
    #endif

    private func audiobookSidebar(foregroundColor: Color? = nil) -> some View {
        let pm = viewModel.progressManager
        let mom = viewModel.mediaOverlayManager
        let currentChapterTitle = pm?.selectedChapterId.flatMap { index in
            viewModel.bookStructure[safe: index]?.label
        }

        let bookTitle = viewModel.bookData?.metadata.title ?? "Unknown Book"
        let bookAuthor = viewModel.bookData?.metadata.authors?.first?.name ?? "Unknown Author"
        let defaultChapterDuration: TimeInterval = TimeInterval((12 * 60) + 27)
        let defaultBookDuration: TimeInterval = TimeInterval((8 * 60 * 60) + (9 * 60))
        let chapterDuration = mom?.chapterTimeRemaining ?? defaultChapterDuration
        let totalRemaining = mom?.bookTimeRemaining ?? defaultBookDuration

        let readingMode: ReadingMode = viewModel.bookData?.category == .ebook ? .ebook : .readaloud

        let progressData = ProgressData(
            chapterLabel: currentChapterTitle,
            chapterCurrentPage: pm?.chapterCurrentPage,
            chapterTotalPages: pm?.chapterTotalPages,
            chapterCurrentSecondsAudio: mom?.chapterElapsedSeconds,
            chapterTotalSecondsAudio: mom?.chapterTotalSeconds,
            bookCurrentSecondsAudio: mom?.bookElapsedSeconds,
            bookTotalSecondsAudio: mom?.bookTotalSeconds,
            bookCurrentFraction: pm?.bookFraction,
        )

        return ReadingSidebarView(
            bookData: viewModel.bookData,
            model: .init(
                title: bookTitle,
                author: bookAuthor,
                chapterTitle: currentChapterTitle ?? "(Untitled)",
                coverArt: viewModel.bookData?.coverArt,
                ebookCoverArt: viewModel.bookData?.ebookCoverArt,
                chapterDuration: chapterDuration,
                totalRemaining: totalRemaining,
                playbackRate: mom?.playbackRate ?? viewModel.settingsVM.defaultPlaybackSpeed,
                volume: mom?.volume ?? viewModel.settingsVM.defaultVolume,
                isPlaying: mom?.isPlaying ?? false,
                sleepTimerActive: mom?.sleepTimerActive ?? false,
                sleepTimerRemaining: mom?.sleepTimerRemaining,
                sleepTimerType: mom?.sleepTimerType,
            ),
            mode: readingMode,
            foregroundColor: foregroundColor,
            chapterProgress: viewModel.chapterProgressBinding,
            chapters: viewModel.chapterList,
            progressData: progressData,
            onChapterSelected: { chapter in
                viewModel.handleChapterSelection(chapter)
            },
            onPrevChapter: {
                viewModel.handlePrevChapter()
            },
            onSkipBackward: {
                viewModel.handlePrevSentence()
            },
            onPlayPause: {
                Task { await viewModel.progressManager?.togglePlaying() }
            },
            onSkipForward: {
                viewModel.handleNextSentence()
            },
            onNextChapter: {
                viewModel.handleNextChapter()
            },
            onPlaybackRateChange: { rate in
                viewModel.handlePlaybackRateChange(rate)
            },
            onVolumeChange: { newVolume in
                viewModel.handleVolumeChange(newVolume)
            },
            onSleepTimerStart: { duration, type in
                viewModel.handleSleepTimerStart(duration, type)
            },
            onSleepTimerCancel: {
                viewModel.handleSleepTimerCancel()
            },
            onProgressSeek: { fraction in
                viewModel.handleProgressSeek(fraction)
            },
        )
    }
}

#if os(macOS)
// Reports whether the cursor is within `threshold` points of the window's top edge.
// A plain SwiftUI `.onHover` strip can't be used here: once the title bar/toolbar
// becomes visible its AppKit views sit over the strip and swallow mouse-moved events,
// so the exit ("not hovering") edge never fires and the bar sticks. A window-level
// mouse-moved monitor sees those events regardless of what's drawn on top.
private struct TitleBarHoverMonitor: NSViewRepresentable {
    var threshold: CGFloat = 60
    var onChange: (Bool) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.onChange = onChange
        context.coordinator.threshold = threshold
        DispatchQueue.main.async { context.coordinator.attach(to: view) }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.onChange = onChange
        context.coordinator.threshold = threshold
        if context.coordinator.window == nil {
            context.coordinator.attach(to: nsView)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.detach()
    }

    @MainActor
    final class Coordinator: NSObject {
        var onChange: ((Bool) -> Void)?
        var threshold: CGFloat = 60
        weak var window: NSWindow?
        private var monitor: Any?
        private var lastValue: Bool?

        func attach(to view: NSView) {
            guard let window = view.window else { return }
            self.window = window
            window.acceptsMouseMovedEvents = true
            monitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) {
                [weak self] event in
                self?.handle(event)
                return event
            }
        }

        private func handle(_ event: NSEvent) {
            guard let window, event.window === window,
                let contentView = window.contentView
            else { return }
            let hovering = event.locationInWindow.y >= contentView.bounds.height - threshold
            guard lastValue != hovering else { return }
            lastValue = hovering
            onChange?(hovering)
        }

        func detach() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
        }
    }
}

private class TitleBarDoubleClickGestureRecognizer: NSClickGestureRecognizer {
    var titlebarHeight: CGFloat = 52
}

private struct TitleBarConfigurator: NSViewRepresentable {
    var isTitleBarVisible: Bool
    var windowTitle: String = "Ebook Reader"
    var onApplied: (() -> Void)? = nil

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            configureWindow(for: view, coordinator: context.coordinator)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configureWindow(for: nsView, coordinator: context.coordinator)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator: NSObject {
        @MainActor @objc func handleDoubleClick(_ gesture: NSClickGestureRecognizer) {
            guard let window = gesture.view?.window,
                let contentView = window.contentView,
                let themeFrame = contentView.superview
            else { return }

            let location = gesture.location(in: themeFrame)
            let titlebarHeight =
                (gesture as? TitleBarDoubleClickGestureRecognizer)?.titlebarHeight ?? 52
            let titlebarRect = NSRect(
                x: 0,
                y: themeFrame.bounds.height - titlebarHeight,
                width: themeFrame.bounds.width,
                height: titlebarHeight,
            )

            if titlebarRect.contains(location) {
                window.zoom(nil)
            }
        }
    }

    private func configureWindow(for nsView: NSView, coordinator: Coordinator) {
        guard let window = nsView.window else { return }
        window.titleVisibility = .hidden
        window.title = windowTitle
        window.titlebarAppearsTransparent = true
        window.styleMask.insert(.fullSizeContentView)
        window.isMovableByWindowBackground = true
        window.toolbar?.isVisible = isTitleBarVisible

        installDoubleClickGesture(on: window, coordinator: coordinator)
        updateTitleBarVisibility(for: window)
        onApplied?()
    }

    private func installDoubleClickGesture(on window: NSWindow, coordinator: Coordinator) {
        guard let themeFrame = window.contentView?.superview else { return }

        let alreadyInstalled = themeFrame.gestureRecognizers.contains {
            $0 is TitleBarDoubleClickGestureRecognizer
        }
        guard !alreadyInstalled else { return }

        let gesture = TitleBarDoubleClickGestureRecognizer(
            target: coordinator,
            action: #selector(Coordinator.handleDoubleClick(_:)),
        )
        gesture.numberOfClicksRequired = 2
        gesture.delaysPrimaryMouseButtonEvents = false

        if let titlebarView = window.standardWindowButton(.closeButton)?.superview {
            gesture.titlebarHeight = titlebarView.frame.height + titlebarView.frame.origin.y
        }

        themeFrame.addGestureRecognizer(gesture)
    }

    private func updateTitleBarVisibility(for window: NSWindow) {
        let buttonTypes: [NSWindow.ButtonType] = [
            .closeButton, .miniaturizeButton, .zoomButton,
        ]
        buttonTypes
            .compactMap { window.standardWindowButton($0) }
            .forEach { button in
                button.alphaValue = isTitleBarVisible ? 1 : 0
                button.isEnabled = isTitleBarVisible
            }

        if let titlebarView = window.standardWindowButton(.closeButton)?.superview {
            titlebarView.alphaValue = isTitleBarVisible ? 1 : 0
            titlebarView.isHidden = false
        }

        if let toolbar = window.toolbar {
            for item in toolbar.items {
                if let view = item.view {
                    view.alphaValue = isTitleBarVisible ? 1 : 0
                    view.isHidden = false
                }
                item.isEnabled = isTitleBarVisible
            }
        }
    }
}
#endif

#endif
