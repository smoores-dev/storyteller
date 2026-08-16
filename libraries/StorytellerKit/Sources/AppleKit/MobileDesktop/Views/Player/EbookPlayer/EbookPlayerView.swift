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
    @Environment(\.openWindow) private var openWindow
    @State private var baseContentWidth: CGFloat?
    @State private var isAnimatingRightSidebar = false
    @State private var isAnimatingLeftSidebar = false
    #else
    @Environment(\.dismiss) private var dismiss
    #endif
    @State private var viewModel: EbookPlayerViewModel
    @State private var isComicScrubberVisible = false
    @State private var sessionStart = Date()
    @State private var customizeCard: CustomizeCard?
    @State private var coverPalette = CoverDerivedPalette.fallback()
    #if os(macOS)
    @State private var sidebarModel: EbookSidebarModel
    #endif
    private let bookData: PlayerBookData?
    private let onClose: (() -> Void)?
    private let onSwitchBook: ((PlayerBookData) -> Void)?

    public init(
        bookData: PlayerBookData?,
        onClose: (() -> Void)? = nil,
        onSwitchBook: ((PlayerBookData) -> Void)? = nil,
    ) {
        self.bookData = bookData
        self.viewModel = EbookPlayerViewModel(bookData: bookData)
        #if os(macOS)
        self._sidebarModel = State(initialValue: EbookSidebarModel(bookID: bookData?.metadata.id))
        #endif
        self.onClose = onClose
        self.onSwitchBook = onSwitchBook
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
        .fullScreenCover(isPresented: $viewModel.showCustomizePopover) {
            EbookPlayerSettings(settingsVM: viewModel.settingsVM)
        }
        .statusBarHidden(!viewModel.isMenuBarVisible)
        .persistentSystemOverlays(viewModel.isMenuBarVisible ? .automatic : .hidden)
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
        .ignoresSafeArea(.container, edges: .top)
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
            EbookPlayerToolbar(
                viewModel: viewModel,
                display: playerDisplayModel,
                actions: macToolbarActions,
                customizeCard: $customizeCard,
            )
        }
        .sheet(item: $customizeCard) { card in
            CustomizeCardView(
                card: card,
                settingsVM: viewModel.settingsVM,
                hasAudioNarration: viewModel.hasAudioNarration,
            )
        }
        .sheet(isPresented: $viewModel.showCustomizePopover) {
            EbookPlayerSettings(settingsVM: viewModel.settingsVM)
        }
        .sheet(isPresented: $viewModel.showSleepTimerSheet) {
            SleepTimerSheet(
                sleepTimerActive: viewModel.mediaOverlayManager?.sleepTimerActive ?? false,
                sleepTimerType: viewModel.mediaOverlayManager?.sleepTimerType,
                onStart: viewModel.handleSleepTimerStart,
                onDone: { viewModel.showSleepTimerSheet = false },
            )
        }
        .sheet(isPresented: $viewModel.showSearchPanel) {
            NavigationStack {
                if let manager = viewModel.searchManager {
                    EbookSearchPanel(
                        searchManager: manager,
                        onDismiss: { viewModel.showSearchPanel = false },
                        onResultSelected: { result in
                            viewModel.handleSearchResultNavigation(result)
                            viewModel.showSearchPanel = false
                        },
                    )
                    .navigationTitle("Search")
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") {
                                viewModel.showSearchPanel = false
                            }
                        }
                    }
                }
            }
            .frame(width: 420, height: 520)
        }
        .sheet(isPresented: $viewModel.showKeybindingsPopover) {
            VStack(spacing: 16) {
                EbookKeybindingsHelp()
                Button("Done") { viewModel.showKeybindingsPopover = false }
                    .keyboardShortcut(.defaultAction)
            }
            .padding()
            .frame(width: 300)
        }
        .background(macShortcutButtons)
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
        .task(id: "\(colorfulnessKey)-\(viewModel.bookData?.metadata.uuid ?? "")") {
            guard let bookID = viewModel.bookData?.metadata.id else { return }
            if let palette = await CoverDerivedPalette.load(for: bookID) {
                coverPalette = palette
            }
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
        .onChange(of: isAudioPlaying) { _, playing in
            if playing {
                viewModel.dismissTimelineBreadcrumbs()
            }
        }
        .onChange(of: viewModel.settingsVM.highlightColorsHash) { _, _ in
            Task { await viewModel.refreshHighlightColors() }
        }
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
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            viewModel.showBookmarksPanel = false
                        }
                    }
                }
            }
            #if os(macOS)
            .frame(width: 440, height: 540)
            #endif
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $viewModel.showReadingTimeline) {
            readingTimelineSheet
        }
        #else
        .sheet(isPresented: $viewModel.showReadingTimeline) {
            readingTimelineSheet
                .frame(minWidth: 520, minHeight: 680)
        }
        #endif
        #if os(iOS)
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
        #else
        .onChange(of: viewModel.pendingSelection?.cfi) { _, cfi in
            guard let cfi, let bookID = viewModel.bookData?.metadata.id else { return }
            openWindow(
                id: "EbookHighlightEditor",
                value: HighlightEditorRequest(
                    bookID: bookID,
                    highlightID: nil,
                    selectionCfi: cfi,
                ),
            )
        }
        .onChange(of: viewModel.pendingEditHighlight) { _, highlight in
            guard let highlight, let bookID = viewModel.bookData?.metadata.id else { return }
            openWindow(
                id: "EbookHighlightEditor",
                value: HighlightEditorRequest(
                    bookID: bookID,
                    highlightID: highlight.id,
                    selectionCfi: nil,
                ),
            )
        }
        .onChange(of: bookData) { _, newData in
            switchBook(to: newData)
        }
        .task(id: viewModel.session?.originalEbookURL) {
            await viewModel.buildImageIndexIfNeeded()
        }
        #endif
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
    private let leftSidebarWidth: CGFloat = 300
    private let leftSidebarTotalWidth: CGFloat = 301
    // Measured title-bar inset: the full-bleed webview otherwise paginates into the
    // 32px hidden behind the title bar, clipping the top line of every page.
    private let readerTopInset: CGFloat = 32

    private var isTitleBarVisible: Bool {
        viewModel.isTitleBarHovered || viewModel.showCustomizePopover
            || viewModel.showKeybindingsPopover || viewModel.showSearchPanel
            || viewModel.showBookmarksPanel || viewModel.pendingSearchReveal
            || viewModel.showSleepTimerSheet || customizeCard != nil
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
                        audiobookSidebar(palette: coverPalette)
                            .frame(width: 360)
                            .background(sidebarPaper)
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

    private var sidebarPaper: Color {
        coverPalette.resolved(for: colorScheme).contentBackground
    }

    @State private var isSwitchingBook = false

    // In-place swap; re-keying the view deinits WindowFrameAdjuster and jolts the window.
    private func switchBook(to newData: PlayerBookData?) {
        guard newData?.metadata.id != viewModel.bookData?.metadata.id else { return }
        guard !isSwitchingBook else { return }
        isSwitchingBook = true
        let oldViewModel = viewModel
        Task { @MainActor in
            await oldViewModel.closeForSwitch()
            sessionStart = Date()
            coverPalette = CoverDerivedPalette.fallback()
            sidebarModel.stopObservingVisits()
            sidebarModel = EbookSidebarModel(bookID: newData?.metadata.id)
            viewModel = EbookPlayerViewModel(bookData: newData)
            viewModel.handleOnAppear()
            isSwitchingBook = false
        }
    }

    private var chapterSidebar: some View {
        let theme = EbookSidebarTheme(
            background: readerBackgroundColor,
            foreground: readerForegroundColor,
            accent: coverPalette.resolved(for: colorScheme).accent,
        )
        return EbookSidebarView(
            viewModel: viewModel,
            sidebarModel: sidebarModel,
            theme: theme,
            topInset: readerTopInset + 16,
            quickBookSwitcher: onSwitchBook.map { onSwitch in
                AnyView(
                    QuickBookSwitcherStrip(
                        currentBookID: viewModel.bookData?.metadata.id,
                        theme: theme,
                        onSelect: onSwitch,
                    )
                )
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

    private var colorfulnessKey: String {
        let settings = viewModel.settingsVM
        return "\(settings.colorMode)-\(settings.colorIntensity)"
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
        viewModel.isMenuBarVisible
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
                    .padding(.bottom, webViewBottomInset)
                    .ignoresSafeArea(edges: bottomEdgeReserved ? [] : .bottom)
                    #else
                    AnyView(
                        EbookPlayerWebView(
                            ebookPath: ebookPath,
                            commsBridge: $viewModel.commsBridge,
                            onBridgeReady: { [weak viewModel] bridge in
                                viewModel?.installBridgeHandlers(
                                    bridge,
                                    initialColorScheme: colorScheme,
                                )
                            },
                        )
                    )
                    .padding(.bottom, webViewBottomInset)
                    .id(viewModel.bookData?.metadata.uuid)
                    #endif
                } else {
                    ProgressView("Loading book...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }

            #if os(iOS)
            let alwaysShowMini = viewModel.settingsVM.alwaysShowMiniPlayer
            let shouldShowDock =
                !viewModel.showAudioSidebar && !viewModel.isMenuBarVisible
                && hasEnabledDockItems

            if shouldShowDock {
                EbookDockIos(
                    leadingSlots: viewModel.settingsVM.dockLeadingSlots,
                    trailingSlots: viewModel.settingsVM.dockTrailingSlots,
                    centerSlots: viewModel.settingsVM.dockCenterSlots,
                    dockTransparency: viewModel.settingsVM.dockTransparency,
                    display: playerDisplayModel,
                    backgroundColor: readerBackgroundColor,
                    positionAtTop: alwaysShowMini,
                    actions: dockActions,
                    mirrored: viewModel.settingsVM.miniPlayerMirrored,
                )
                .transition(.opacity)
            }

            if viewModel.isMenuBarVisible {
                EbookPlayerMenuBar(
                    display: playerDisplayModel,
                    actions: dockActions,
                    sleepTimerActive: viewModel.mediaOverlayManager?.sleepTimerActive ?? false,
                    sleepTimerType: viewModel.mediaOverlayManager?.sleepTimerType,
                    showCustomizePopover: $viewModel.showCustomizePopover,
                    showSearchSheet: $viewModel.showSearchPanel,
                    showBookmarksPanel: $viewModel.showBookmarksPanel,
                    showAudioSidebar: $viewModel.showAudioSidebar,
                    showSleepTimerSheet: $viewModel.showSleepTimerSheet,
                    searchManager: viewModel.searchManager,
                    onDismiss: {
                        if let onClose {
                            onClose()
                        } else {
                            dismiss()
                        }
                    },
                    onSearchResultSelected: viewModel.handleSearchResultNavigation,
                    onSleepTimerStart: viewModel.handleSleepTimerStart,
                    onSleepTimerCancel: viewModel.handleSleepTimerCancel,
                    settingsVM: viewModel.settingsVM,
                    customizeCard: $customizeCard,
                )
                .transition(.opacity)
            }

            if !(isPad && viewModel.showAudioSidebar) {
                draggableAudioCard
            }

            if progressIndicatorEnabled {
                playbackProgressBar
            }

            if viewModel.hasAudioNarration,
                viewModel.mediaOverlayManager?.playheadDiverged == true
            {
                returnToPlayheadButton
                    .transition(.opacity)
            }

            if viewModel.timelineBackLocator != nil || viewModel.timelineForwardLocator != nil {
                timelineBreadcrumbPills
                    .transition(.opacity)
            }
            #else
            if !viewModel.showAudioSidebar && hasEnabledDockItems {
                EbookDockIos(
                    leadingSlots: viewModel.settingsVM.dockLeadingSlots,
                    trailingSlots: viewModel.settingsVM.dockTrailingSlots,
                    centerSlots: viewModel.settingsVM.dockCenterSlots,
                    dockTransparency: viewModel.settingsVM.dockTransparency,
                    display: playerDisplayModel,
                    backgroundColor: readerBackgroundColor,
                    positionAtTop: false,
                    actions: dockActions,
                )
                .transition(.opacity)
            }

            if progressIndicatorEnabled {
                playbackProgressBar
            }

            if viewModel.timelineBackLocator != nil || viewModel.timelineForwardLocator != nil {
                timelineBreadcrumbPills
                    .transition(.opacity)
            }
            #endif
        }
    }

    #if os(iOS)
    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }
    #endif

    private var timelineBreadcrumbPills: some View {
        HStack(spacing: 8) {
            if viewModel.timelineBackLocator != nil {
                breadcrumbPill(
                    icon: "arrow.uturn.backward",
                    text: viewModel.timelineBackDescription.isEmpty
                        ? "Back" : "Back to \(viewModel.timelineBackDescription)",
                ) {
                    Task { await viewModel.timelineGoBack() }
                }
            }
            if viewModel.timelineForwardLocator != nil {
                breadcrumbPill(
                    icon: "arrow.uturn.forward",
                    text: viewModel.timelineForwardDescription.isEmpty
                        ? "Forward" : "Forward to \(viewModel.timelineForwardDescription)",
                ) {
                    Task { await viewModel.timelineGoForward() }
                }
            }
            Spacer()
        }
        .padding(.leading, 16)
        .padding(.bottom, webViewBottomInset + 70)
    }

    private func breadcrumbPill(
        icon: String,
        text: String,
        action: @escaping () -> Void,
    ) -> some View {
        HStack(spacing: 0) {
            Button(action: action) {
                Label(text, systemImage: icon)
                    .font(.footnote.weight(.medium))
                    .lineLimit(1)
                    .padding(.leading, 12)
                    .padding(.trailing, 6)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)

            Button {
                viewModel.dismissTimelineBreadcrumbs()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 4)
                    .padding(.trailing, 10)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
        }
        .background(.regularMaterial, in: Capsule())
        .frame(maxWidth: 240, alignment: .leading)
    }

    #if os(iOS)
    private var returnToPlayheadButton: some View {
        HStack {
            Spacer()
            Button {
                Task { await viewModel.mediaOverlayManager?.returnToPlayhead() }
            } label: {
                Label("Playhead", systemImage: "arrow.uturn.backward")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.trailing, 16)
        }
        .padding(.bottom, webViewBottomInset + 70)
    }


    #endif

    @ViewBuilder
    private var readingTimelineSheet: some View {
        if let bookID = viewModel.bookData?.metadata.id {
            ReadingTimelineSheet(
                bookId: bookID,
                bookTitle: viewModel.bookData?.metadata.title ?? "",
                currentFraction: viewModel.progressManager?.bookFraction,
                currentDescription: viewModel.currentPositionDescription(),
                onJump: { locator, description in
                    Task {
                        await viewModel.jumpFromTimeline(to: locator, description: description)
                    }
                },
                sessionStart: sessionStart,
                chapterTitle: { locator in
                    guard !locator.href.isEmpty,
                        let index = findSectionIndex(
                            for: locator.href,
                            in: viewModel.bookStructure,
                        )
                    else { return nil }
                    return viewModel.bookStructure[safe: index]?.label
                },
            )
        }
    }

    private var isAudioPlaying: Bool {
        viewModel.mediaOverlayManager?.isPlaying ?? false
    }

    private var hasEnabledDockItems: Bool {
        let settings = viewModel.settingsVM
        let audio = viewModel.hasAudioNarration
        let allSlots =
            settings.dockLeadingSlots + settings.dockTrailingSlots
            + settings.dockCenterSlots
        return allSlots.contains { $0 != .none && (audio || !$0.requiresAudio) }
    }

    private var hasEnabledDockControls: Bool {
        viewModel.hasAudioNarration
            && viewModel.settingsVM.dockCenterSlots.hasActiveComplication
    }

    private var playerDisplayModel: MiniPlayerDisplayModel {
        let pm = viewModel.progressManager
        let mom = viewModel.mediaOverlayManager
        let currentChapterTitle = pm?.selectedChapterId.flatMap { index in
            viewModel.bookStructure[safe: index]?.label
        }
        return MiniPlayerDisplayModel(
            bookTitle: viewModel.bookData?.metadata.title,
            chapterTitle: currentChapterTitle,
            authorName: viewModel.bookData?.metadata.authors?.first?.name,
            cover: viewModel.bookData?.coverArt,
            isPlaying: mom?.isPlaying ?? false,
            playbackRate: mom?.playbackRate ?? viewModel.settingsVM.defaultPlaybackSpeed,
            chapterProgress: viewModel.chapterProgressBinding.wrappedValue,
            chapterElapsedSeconds: mom?.chapterElapsedSeconds,
            chapterTotalSeconds: mom?.chapterTotalSeconds,
            bookTimeRemaining: mom?.bookTimeRemaining,
            bookFraction: pm?.bookFraction,
            currentPage: pm?.chapterCurrentPage,
            totalPages: pm?.chapterTotalPages,
            chapterIndex: pm?.selectedChapterId,
            chapterCount: viewModel.bookStructure.count,
            sleepTimerRemaining: (mom?.sleepTimerActive ?? false) ? mom?.sleepTimerRemaining : nil,
            sleepTimerEndOfChapter: (mom?.sleepTimerActive ?? false)
                && mom?.sleepTimerType == .endOfChapter,
            sessionStart: sessionStart,
            chapters: viewModel.chapterList,
            selectedChapterHref: viewModel.selectedChapterHref,
            hasAudioNarration: viewModel.hasAudioNarration,
            isScrollingMode: viewModel.settingsVM.scrollingMode,
            freeBrowseMode: viewModel.settingsVM.freeBrowseMode,
        )
    }

    private var dockActions: MiniPlayerActions {
        MiniPlayerActions(
            onPlayPause: {
                Task { await viewModel.progressManager?.togglePlaying() }
            },
            onSkipBackward: {
                viewModel.handlePrevSentence()
            },
            onSkipForward: {
                viewModel.handleNextSentence()
            },
            onRateChange: viewModel.handlePlaybackRateChange,
            onChapterSelected: viewModel.handleChapterSelection,
            onOpenBookmarks: { viewModel.showBookmarksPanel = true },
            onOpenReadingTimeline: { viewModel.showReadingTimeline = true },
            onOpenSearch: { viewModel.showSearchPanel = true },
            onOpenTextSettings: { viewModel.showCustomizePopover = true },
            onOpenSleepTimer: { viewModel.showSleepTimerSheet = true },
            onToggleMirror: {
                #if os(iOS)
                let settings = viewModel.settingsVM
                settings.miniPlayerMirrored.toggle()
                settings.save()
                #endif
            },
            onToggleScrollingMode: {
                let settings = viewModel.settingsVM
                settings.scrollingMode.toggle()
                settings.save()
            },
            onToggleFreeBrowse: {
                let settings = viewModel.settingsVM
                settings.freeBrowseMode =
                    settings.freeBrowseMode == "always" ? "never" : "always"
                settings.save()
            },
            onToggleOrientationLock: {
                #if os(iOS)
                OrientationLock.shared.toggle()
                #endif
            },
        )
    }

    #if os(iOS)
    private var dockBandReserved: Bool {
        hasEnabledDockItems && !viewModel.settingsVM.alwaysShowMiniPlayer
    }

    private var bottomEdgeReserved: Bool {
        dockBandReserved || viewModel.settingsVM.alwaysShowMiniPlayer
    }

    // The band is measured from the physical screen bottom but the padded
    // webview bottoms out at the safe area, so deduct the safe-area inset.
    private var webViewBottomInset: CGFloat {
        if viewModel.settingsVM.alwaysShowMiniPlayer {
            let audio = viewModel.hasAudioNarration
            let showStats =
                audio && viewModel.settingsVM.miniPlayerStatSlots.hasActiveComplication
            let band = MiniPlayerMetrics.bottomBandHeight(
                showStats: showStats,
                safeAreaBottom: safeAreaInsets.bottom,
            )
            return MiniPlayerMetrics.compactHeight(
                size: audio ? viewModel.settingsVM.miniPlayerSize : .compact,
                showStats: showStats,
            ) + max(0, band - safeAreaInsets.bottom)
        }
        guard dockBandReserved else { return 0 }
        let band = EbookDockIos.reservedBottomInset(
            withPlaybackControls: hasEnabledDockControls)
        return max(0, band - safeAreaInsets.bottom)
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

    private var cardActions: MiniPlayerActions {
        var actions = dockActions
        actions.onSeek = viewModel.handleProgressSeek
        actions.onLeadingTap = {
            let settings = viewModel.settingsVM
            settings.miniPlayerCycleShowingSecond.toggle()
            settings.save()
        }
        return actions
    }

    @ViewBuilder
    private var draggableAudioCard: some View {
        let alwaysShow = viewModel.settingsVM.alwaysShowMiniPlayer
        let isPresentedBinding = Binding(
            get: { alwaysShow || self.viewModel.isDockVisible },
            set: { newValue in
                if !alwaysShow {
                    self.viewModel.isDockVisible = newValue
                }
            },
        )

        DraggableAudioCard(
            isPresented: isPresentedBinding,
            alwaysShow: alwaysShow,
            collapseTrigger: viewModel.collapseCardTrigger,
            display: playerDisplayModel,
            actions: cardActions,
            ebookCoverArt: viewModel.bookData?.ebookCoverArt,
            miniPlayerConfig: viewModel.settingsVM.miniPlayerConfig,
            supportsComicScrubber: viewModel.isComicBook,
            onPrevChapter: {
                viewModel.handlePrevChapter()
            },
            onNextChapter: {
                viewModel.handleNextChapter()
            },
            onComicScrubberVisibilityChange: { visible in
                isComicScrubberVisible = visible
            },
            palette: coverPalette,
            fullContent: {
                audiobookSidebar(palette: coverPalette)
            },
        )
    }

    private var progressOnMiniPlayer: Bool {
        viewModel.settingsVM.alwaysShowMiniPlayer || viewModel.isDockVisible
    }

    private var progressIndicatorEnabled: Bool {
        progressOnMiniPlayer
            ? viewModel.settingsVM.progressIndicatorMiniPlayer
            : viewModel.settingsVM.progressIndicatorDock
    }

    private var playbackProgressBar: some View {
        let onMiniPlayer = progressOnMiniPlayer
        let scope =
            onMiniPlayer
            ? viewModel.settingsVM.miniPlayerProgressScope
            : viewModel.settingsVM.progressIndicatorScopeDock
        let progress =
            scope == .book
            ? (viewModel.progressManager?.bookFraction ?? 0)
            : viewModel.chapterProgressBinding.wrappedValue
        let thickness =
            onMiniPlayer
            ? viewModel.settingsVM.progressIndicatorThickness
            : viewModel.settingsVM.progressIndicatorThicknessDock
        return ProgressIndicatorLine(progress: progress, thickness: thickness)
            .frame(maxHeight: .infinity, alignment: .bottom)
            .ignoresSafeArea()
    }
    #endif

    #if os(macOS)
    private var macShortcutButtons: some View {
        Group {
            Button("") {
                viewModel.bookmarksPanelInitialTab = .bookmarks
                viewModel.showBookmarksPanel = true
            }
            .keyboardShortcut("b", modifiers: .command)
            Button("") { viewModel.showSearchPanel = true }
                .keyboardShortcut("f", modifiers: .command)
            Button("") { customizeCard = .textLayout }
                .keyboardShortcut(",", modifiers: [.command, .shift])
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }

    private var macToolbarActions: MiniPlayerActions {
        var overridden = dockActions
        overridden.onOpenSleepTimer = {
            if viewModel.mediaOverlayManager?.sleepTimerActive == true {
                viewModel.handleSleepTimerCancel()
            } else {
                viewModel.showSleepTimerSheet = true
            }
        }
        return overridden
    }

    private var progressIndicatorEnabled: Bool {
        viewModel.settingsVM.progressIndicatorDock
    }

    private var playbackProgressBar: some View {
        let scope = viewModel.settingsVM.progressIndicatorScopeDock
        let progress =
            scope == .book
            ? (viewModel.progressManager?.bookFraction ?? 0)
            : viewModel.chapterProgressBinding.wrappedValue
        return ProgressIndicatorLine(
            progress: progress,
            thickness: viewModel.settingsVM.progressIndicatorThicknessDock,
        )
        .frame(maxHeight: .infinity, alignment: .bottom)
        .ignoresSafeArea()
    }

    private var webViewBottomInset: CGFloat {
        guard hasEnabledDockItems else { return 0 }
        return EbookDockIos.reservedBottomInset(withPlaybackControls: hasEnabledDockControls)
    }

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

    private func audiobookSidebar(
        foregroundColor: Color? = nil,
        palette: CoverDerivedPalette? = nil,
    ) -> some View {
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
        .coverPalette(palette)
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
