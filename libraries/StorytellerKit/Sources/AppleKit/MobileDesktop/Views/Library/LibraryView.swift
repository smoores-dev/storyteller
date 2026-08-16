#if os(iOS) || os(macOS)
import SwiftUI

private struct LibraryNavigationSidebarVisibleKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var libraryNavigationSidebarVisible: Bool {
        get { self[LibraryNavigationSidebarVisibleKey.self] }
        set { self[LibraryNavigationSidebarVisibleKey.self] = newValue }
    }
}

extension Notification.Name {
    static let openSmartShelves = Notification.Name("openSmartShelves")
}

public struct LibraryView: View {
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif

    // TODO: wire up search
    @State private var searchText: String = ""
    #if os(macOS)
    @State private var sidebarFilter: String = ""
    #endif
    @State private var isSearchFocused: Bool = false
    @State private var selectedItem: SidebarItemDescription? = SidebarItemDescription(
        name: "Dashboard",
        systemImage: "house",
        badge: 0,
        content: .home,
    )
    @State private var showSettings = false
    // TODO: ConfigActor should handle this
    @State private var sections: [SidebarSectionDescription] = LibrarySidebarDefaults.getSections()
    // TODO: Anchor to offset, not content
    @State private var gridScrollPositions: [String: BookMetadata.ID?] = [:]
    @State private var metadataNavStack: [SidebarItemDescription] = []
    @State private var isMetadataLinkNavigation = false
    @State private var navigationColumnVisibility: NavigationSplitViewVisibility = .all
    #if os(macOS)
    @State private var showPermissionError: Bool = false
    @State private var permissionErrorMessage: String = ""
    #endif

    public init() {}

    public var body: some View {
        ZStack {
            NavigationSplitView(columnVisibility: $navigationColumnVisibility) {
                #if os(macOS)
                SidebarView(
                    sections: sections,
                    selectedItem: $selectedItem,
                    searchText: $searchText,
                    isSearchFocused: $isSearchFocused,
                    sidebarFilter: $sidebarFilter,
                )
                #else
                SidebarView(
                    sections: sections,
                    selectedItem: $selectedItem,
                    searchText: $searchText,
                    isSearchFocused: $isSearchFocused,
                )
                #endif
            } detail: {
                Group {
                    if let selected = selectedItem {
                        detailView(
                            for: selected,
                            sections: $sections,
                            selectedItem: $selectedItem,
                        )
                    } else {
                        PlaceholderDetailView(title: "Select an item")
                    }
                }
                #if os(macOS)
                .environment(\.contentSearchText, $searchText)
                .environment(\.contentSearchFocus, $isSearchFocused)
                .tint(
                    Color(hex: mediaViewModel.cachedConfig.library.accentColorHex)
                        ?? .storytellerOrange
                )
                #endif
                .environment(
                    \.libraryNavigationSidebarVisible,
                    navigationColumnVisibility != .detailOnly,
                )
            }
            #if os(macOS)
            .onChange(of: mediaViewModel.cachedConfig.library.accentColorHex, initial: true) {
                _,
                newHex in
                SidebarSelectionColor.updateColor(hex: newHex)
            }
            .onAppear {
                NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                    if event.modifierFlags.contains(.command)
                        && event.charactersIgnoringModifiers == "f"
                    {
                        isSearchFocused = true
                        return nil
                    }
                    return event
                }
            }
            .onChange(of: mediaViewModel.pendingInfoBookID) { _, _ in
                guard mediaViewModel.pendingInfoBookID != nil else { return }
                Task { @MainActor in
                    // A grid already on screen consumes the request itself;
                    // navigate to All Books only if none did.
                    try? await Task.sleep(for: .milliseconds(50))
                    guard mediaViewModel.pendingInfoBookID != nil,
                        let item = allBooksSidebarItem
                    else { return }
                    selectedItem = item
                }
            }
            #endif
            .onChange(of: selectedItem) {
                searchText = ""
                if isMetadataLinkNavigation {
                    isMetadataLinkNavigation = false
                } else {
                    metadataNavStack.removeAll()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .openSmartShelves)) { _ in
                selectedItem = SidebarItemDescription(
                    name: "Smart Shelves",
                    systemImage: "sparkles.rectangle.stack",
                    badge: -1,
                    content: .smartShelves,
                )
            }
            #if os(iOS)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
                .presentationDragIndicator(.visible)
            }
            #endif
            #if os(macOS)
            .alert("Edit Metadata", isPresented: $showPermissionError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(permissionErrorMessage)
            }
            #endif

            if let notification = mediaViewModel.syncNotification {
                VStack {
                    SyncNotificationView(
                        notification: notification,
                        onDismiss: {
                            mediaViewModel.dismissSyncNotification()
                        },
                        onIgnore: { failedSyncs in
                            mediaViewModel.ignoreFailedSyncs(failedSyncs)
                        },
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .animation(
                        .spring(response: 0.3, dampingFraction: 0.8),
                        value: notification.id,
                    )
                    .padding(.top, 16)

                    Spacer()
                }
                .zIndex(1000)
            }
        }
    }

    @ViewBuilder
    func detailView(
        for item: SidebarItemDescription,
        sections: Binding<[SidebarSectionDescription]>,
        selectedItem: Binding<SidebarItemDescription?>,
    ) -> some View {
        switch item.content {
            case .home:
                #if os(iOS)
                HomeView(
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                HomeView(
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #endif
            case .mediaGrid(let configuration):
                let preferred = configuration.preferredTileWidth.map { CGFloat($0) } ?? 250
                let minimum = configuration.minimumTileWidth.map { CGFloat($0) } ?? 10
                let identity = gridIdentity(for: configuration)
                let scrollBinding: Binding<BookMetadata.ID?>? = Binding(
                    get: { gridScrollPositions[identity] ?? nil },
                    set: { gridScrollPositions[identity] = $0 },
                )
                let locationFilter =
                    MediaGridView.LocationFilterOption(
                        rawValue: configuration.locationFilter.rawValue
                    ) ?? .all
                MediaGridView(
                    title: configuration.title,
                    searchText: searchText,
                    mediaKind: configuration.mediaKind,
                    viewOptionsKey: item.content.stableIdentifier,
                    tagFilter: configuration.tagFilter,
                    seriesFilter: configuration.seriesFilter,
                    collectionFilter: configuration.collectionFilter,
                    authorFilter: configuration.authorFilter,
                    narratorFilter: configuration.narratorFilter,
                    translatorFilter: configuration.translatorFilter,
                    publicationYearFilter: configuration.publicationYearFilter,
                    ratingFilter: configuration.ratingFilter,
                    statusFilter: configuration.statusFilter,
                    defaultSort: configuration.defaultSort,
                    preferredTileWidth: preferred,
                    minimumTileWidth: minimum,
                    onMetadataLinkClicked: { target in
                        navigateToMetadataFilter(target, mediaKind: configuration.mediaKind)
                    },
                    initialNarrationFilterOption: configuration.narrationFilter,
                    initialLocationFilter: locationFilter,
                    scrollPosition: scrollBinding,
                    showAddBookButton: isRootAllBooksGrid(configuration),
                    isPendingInfoFallbackTarget: isRootAllBooksGrid(configuration),
                )
                .id(identity)
                .toolbar {
                    ToolbarItem(placement: .navigation) {
                        if !metadataNavStack.isEmpty {
                            Button {
                                popMetadataNavStack()
                            } label: {
                                Label("Back", systemImage: "chevron.left")
                            }
                        }
                    }
                }
            case .seriesView(let mediaKind):
                #if os(iOS)
                SeriesView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                SeriesView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .authorView(let mediaKind):
                #if os(iOS)
                AuthorView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                AuthorView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .narratorView(let mediaKind):
                #if os(iOS)
                NarratorView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                NarratorView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .translatorView(let mediaKind):
                #if os(iOS)
                TranslatorView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                TranslatorView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .publicationYearView(let mediaKind):
                #if os(iOS)
                PublicationYearView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                PublicationYearView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .ratingView(let mediaKind):
                #if os(iOS)
                RatingView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                RatingView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .statusView(let mediaKind):
                #if os(iOS)
                StatusView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                StatusView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .tagView(let mediaKind):
                #if os(iOS)
                TagView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                TagView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .collectionsView(let mediaKind):
                #if os(iOS)
                CollectionsView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                CollectionsView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .sourceView(let mediaKind):
                #if os(iOS)
                SourceView(
                    mediaKind: mediaKind,
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                SourceView(
                    mediaKind: mediaKind,
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .bookReports:
                #if os(iOS)
                BookReportsView(
                    searchText: $searchText,
                    showSettings: $showSettings,
                )
                #else
                BookReportsView(searchText: searchText)
                #endif
            case .bookSource(let sourceID):
                let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID })
                let sourceName =
                    source?.name
                    ?? "Book Source"
                MediaGridView(
                    title: sourceName,
                    searchText: searchText,
                    mediaKind: .ebook,
                    viewOptionsKey: item.content.stableIdentifier,
                    defaultSort: "title",
                    preferredTileWidth: 120,
                    minimumTileWidth: 50,
                    onMetadataLinkClicked: { target in
                        navigateToMetadataFilter(target, mediaKind: .ebook)
                    },
                    initialNarrationFilterOption: .both,
                    scrollPosition: nil,
                    showAddBookButton: true,
                    addBookSourceID: sourceID,
                    sourceFilterID: sourceID,
                    sourceFilterName: sourceName,
                    sourceFilterKind: source?.kind,
                    emptyStateMessage:
                        source?.kind == .localFolder
                        ? "Copy files into this folder source to add books."
                        : "Use Add Book to add files to this source.",
                )
                .id(item.content.stableIdentifier)
            case .smartShelves:
                #if os(iOS)
                SmartShelvesView(
                    searchText: $searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                )
                #else
                SmartShelvesView(
                    searchText: searchText,
                    sidebarSections: sections,
                    selectedSidebarItem: selectedItem,
                    showSettings: $showSettings,
                    onEditMetadata: handleEditMetadata,
                )
                #endif
            case .smartShelfDetail(let shelfId):
                if let shelf = mediaViewModel.smartShelves.first(where: { $0.id == shelfId }) {
                    let books = mediaViewModel.booksForShelf(shelf)
                    SmartShelfDetailView(
                        shelf: shelf,
                        books: books,
                        searchText: searchText,
                        viewOptionsKey: "smartShelfDetail.\(shelfId)",
                    )
                }
            case .placeholder(let title):
                PlaceholderDetailView(title: title)
                    .border(.yellow)
            case .currentlyDownloading:
                CurrentlyDownloadingView()
            case .downloaded:
                MediaGridView(
                    title: "Downloaded",
                    mediaKind: .ebook,
                    viewOptionsKey: "downloaded",
                    preferredTileWidth: 120,
                    minimumTileWidth: 50,
                    onMetadataLinkClicked: { target in
                        navigateToMetadataFilter(target, mediaKind: .ebook)
                    },
                    initialLocationFilter: .downloaded,
                )
            case .storytellerServer:
                StorytellerServerSettingsView()
        }
    }

    func gridIdentity(for config: MediaGridConfiguration) -> String {
        config.title
    }

    private func isRootAllBooksGrid(_ config: MediaGridConfiguration) -> Bool {
        config.title == "All Books"
            && config.tagFilter == nil
            && config.seriesFilter == nil
            && config.collectionFilter == nil
            && config.authorFilter == nil
            && config.narratorFilter == nil
            && config.translatorFilter == nil
            && config.publicationYearFilter == nil
            && config.ratingFilter == nil
            && config.statusFilter == nil
    }

    private func popMetadataNavStack() {
        guard let previous = metadataNavStack.popLast() else { return }
        isMetadataLinkNavigation = true
        selectedItem = previous
    }

    private func navigateToMetadataFilter(_ target: MetadataLinkTarget, mediaKind: MediaKind) {
        let config = target.configuration(
            mediaKind: mediaKind,
            preferredTileWidth: 120,
            minimumTileWidth: 50,
        )
        if let current = selectedItem {
            metadataNavStack.append(current)
        }
        isMetadataLinkNavigation = true
        selectedItem = SidebarItemDescription(
            name: config.title,
            systemImage: target.systemImage,
            badge: -1,
            content: .mediaGrid(config),
        )
    }

    #if os(macOS)
    private var allBooksSidebarItem: SidebarItemDescription? {
        (sections + LibrarySidebarDefaults.getSections())
            .flatMap(\.items)
            .first { item in
                if case .mediaGrid(let config) = item.content {
                    return isRootAllBooksGrid(config)
                }
                return false
            }
    }

    private func handleEditMetadata(bookIds: [BookID]) {
        if bookIds.contains(where: { mediaViewModel.isLocalStandaloneBook($0) }) {
            permissionErrorMessage = "Editing metadata for local books is not supported yet."
            showPermissionError = true
            return
        }
        Task {
            let sourceIDs = mediaViewModel.sourceIDs(for: bookIds)
            let result = await checkMetadataEditPermission(sourceIDs: sourceIDs)
            switch result {
                case .allowed:
                    if MetadataEditorWindowRegistry.addToExistingWindow(bookIds) {
                        return
                    }
                    openWindow(
                        id: "MetadataEditor",
                        value: MetadataEditorData(bookIds: bookIds),
                    )
                case .denied:
                    permissionErrorMessage =
                        "Your account does not have permission to edit metadata on this server."
                    showPermissionError = true
                case .error(let message):
                    permissionErrorMessage = "Could not verify server permissions: \(message)"
                    showPermissionError = true
            }
        }
    }

    private func checkMetadataEditPermission(sourceIDs: [BookSourceID]) async
        -> StorytellerActor.PermissionCheckResult
    {
        for sourceID in sourceIDs {
            let result = await BookServiceActor.shared.checkBookUpdatePermission(
                sourceID: sourceID
            )
            if case .allowed = result {
                continue
            }
            return result
        }
        return .allowed
    }
    #endif
}

#endif
