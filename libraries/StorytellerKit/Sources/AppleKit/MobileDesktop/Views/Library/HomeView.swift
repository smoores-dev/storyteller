#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
import UIKit
#endif

struct HomeView: View {
    #if os(iOS)
    @Binding var searchText: String
    #else
    let searchText: String
    #endif
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel
    #if os(macOS)
    @Environment(\.openWindow) private var openWindow
    #endif
    @Binding var sidebarSections: [SidebarSectionDescription]
    @Binding var selectedSidebarItem: SidebarItemDescription?
    @Binding var showSettings: Bool
    #if os(iOS)
    var showOfflineSheet: Binding<Bool>?
    #endif
    fileprivate struct HomeSection: Identifiable, Sendable {
        let title: String
        let mediaKind: MediaKind
        let items: [BookMetadata]
        let destination: String
        let tagFilter: String?
        let statusFilter: String?
        let sortOrder: HomeSectionSortOrder?

        var id: String {
            [
                title,
                String(describing: mediaKind),
                destination,
                tagFilter ?? "",
                statusFilter ?? "",
                sortOrder.map(String.init(describing:)) ?? "",
            ].joined(separator: "|")
        }
    }

    struct Selection: Equatable {
        var sectionIndex: Int
        var itemID: BookMetadata.ID
    }

    struct SectionFilter: Hashable {
        let title: String
        let mediaKind: MediaKind
        let tagFilter: String?
        let statusFilter: String?
        let sortOrder: HomeSectionSortOrder?
    }

    @State private var selection: Selection? = nil
    @State private var isSidebarVisible: Bool = false
    @State private var sections: [HomeSection] = []
    @State private var loadSectionsTask: Task<Void, Never>?
    @State private var loadSectionsGeneration: Int = 0
    @State private var allowEmptyStateDisplay: Bool = false
    @State private var cardTapInProgress: Bool = false
    #if os(macOS)
    @State private var showPermissionError: Bool = false
    @State private var permissionErrorMessage: String = ""
    #endif
    @State private var navigationPath = NavigationPath()
    @State private var showViewOptions: Bool = false
    @AppStorage("coverPref.home") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble
        .rawValue
    @AppStorage("coverSize.home") private var coverSizeValue: Double = CoverSizeRange.defaultValue
    @AppStorage("gridSpacing.home") private var gridSpacingRaw: String = GridSpacing
        .defaultValue.rawValue
    @AppStorage("showAudioIndicator.home") private var showAudioIndicator: Bool = true
    @AppStorage("showSourceBadge.home") private var showSourceBadge: Bool = false
    @AppStorage("showSeriesPositionBadge.home") private var showSeriesPositionBadge: Bool = false
    @AppStorage("progressStyle.home") private var progressStyleRaw: String = ProgressIndicatorStyle
        .circle.rawValue
    @AppStorage("showOnItem.home") private var showOnItemRaw: String = ShowOnItemField.auto
        .rawValue
    @AppStorage("home.sectionConfig") private var homeSectionConfigJSON: String = "[]"
    @AppStorage("sidebar.config") private var sidebarConfigJSON: String = ""
    @State private var lastProgressStyle: ProgressIndicatorStyle = .circle

    private var coverPreference: CoverPreference {
        CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook
    }

    private var progressStyle: ProgressIndicatorStyle {
        ProgressIndicatorStyle(rawValue: progressStyleRaw) ?? .circle
    }

    private var gridGap: CGFloat {
        (GridSpacing(rawValue: gridSpacingRaw) ?? .defaultValue).points
    }

    private var coverSize: CGFloat {
        CGFloat(coverSizeValue).clamped(to: CoverSizeRange.min...CoverSizeRange.max)
    }

    private let sidebarWidth: CGFloat = 340
    #if os(macOS)
    #endif
    private let horizontalPadding: CGFloat = 24
    private let sectionSpacing: CGFloat = 36
    private let headerBottomPadding: CGFloat = 12

    #if os(iOS)
    private var hasConnectionError: Bool {
        if mediaViewModel.lastNetworkOpSucceeded == false { return true }
        if case .error = mediaViewModel.connectionStatus { return true }
        return false
    }

    private var connectionErrorIcon: String {
        mediaViewModel.connectionIssueIcon
    }
    #endif

    var body: some View {
        #if os(iOS)
        NavigationStack(path: $navigationPath) {
            ZStack {
                homeContent
                if searchText.count >= 2 {
                    searchOverlay
                }
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        if hasConnectionError,
                            let showOfflineSheet
                        {
                            Button {
                                showOfflineSheet.wrappedValue = true
                            } label: {
                                Image(systemName: connectionErrorIcon)
                                    .foregroundStyle(.red)
                            }
                        }
                        viewOptionsButton
                        Button {
                            showSettings = true
                        } label: {
                            Label("Settings", systemImage: "gearshape")
                        }
                    }
                }
            }
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search",
            )
            .navigationDestination(for: SectionFilter.self) { filter in
                sectionFilterView(for: filter)
                    .iOSLibraryToolbar(
                        showSettings: $showSettings,
                        showOfflineSheet: showOfflineSheet ?? .constant(false),
                    )
            }
            .navigationDestination(for: BookMetadata.self) { item in
                iOSBookDetailView(item: item, mediaKind: .ebook)
                    .iOSLibraryToolbar(
                        showSettings: $showSettings,
                        showOfflineSheet: showOfflineSheet ?? .constant(false),
                    )
            }
        }
        .environment(\.mediaNavigationPath, $navigationPath)
        #else
        NavigationStack(path: $navigationPath) {
            ZStack {
                homeContent
                if searchText.count >= 2 {
                    searchOverlayMacOS
                }
            }
            .navigationDestination(for: SeriesNavIdentifier.self) { series in
                seriesDetailView(for: series.name)
            }
            .navigationDestination(for: SectionFilter.self) { filter in
                sectionFilterView(for: filter)
            }
        }
        #endif
    }

    private var homeContent: some View {
        GeometryReader { geometry in
            #if os(macOS)
            let shouldShowSidebar = isSidebarVisible && selectedItem != nil
            let trailingContentPadding: CGFloat = shouldShowSidebar ? 0 : horizontalPadding
            #else
            let trailingContentPadding = horizontalPadding
            #endif

            HStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: sectionSpacing) {
                            HStack {
                                Text("Home")
                                    .font(.storytellerTitle(size: 32))
                                Spacer()
                                #if os(macOS)
                                viewOptionsButton
                                #endif
                            }
                            .padding(.leading, horizontalPadding)
                            .padding(
                                .trailing,
                                trailingContentPadding,
                            )
                            .padding(.bottom, headerBottomPadding)

                            if allowEmptyStateDisplay && sections.allSatisfy({ $0.items.isEmpty }) {
                                VStack(spacing: 12) {
                                    Text("No media is available here yet!")
                                        .font(.title)
                                        .foregroundStyle(.secondary)
                                    #if os(iOS)
                                    Text(
                                        "To get started, go to [Settings](openSettings) > Book Sources to add a local folder or Storyteller server, then use Add Book to add files."
                                    )
                                    .font(.body)
                                    .foregroundStyle(.tertiary)
                                    .multilineTextAlignment(.center)
                                    .tint(.accentColor)
                                    .environment(
                                        \.openURL,
                                        OpenURLAction { url in
                                            if url.absoluteString == "openSettings" {
                                                showSettings = true
                                                return .handled
                                            }
                                            return .systemAction
                                        },
                                    )
                                    #else
                                    Text(
                                        "Add a local folder or Storyteller server in Settings > Book Sources, then use Add Book to add files."
                                    )
                                    .font(.body)
                                    .foregroundStyle(.tertiary)
                                    .multilineTextAlignment(.center)
                                    #endif
                                }
                                .frame(maxWidth: 500)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, 60)
                                .padding(.leading, horizontalPadding)
                                .padding(
                                    .trailing,
                                    trailingContentPadding,
                                )
                            } else {
                                ForEach(Array(sections.enumerated()), id: \.offset) {
                                    index,
                                    section in
                                    HomeSectionRow(
                                        sectionIndex: index,
                                        section: section,
                                        selection: $selection,
                                        isSidebarVisible: $isSidebarVisible,
                                        sidebarSections: $sidebarSections,
                                        selectedSidebarItem: $selectedSidebarItem,
                                        showAudioIndicator: showAudioIndicator,
                                        showSourceBadge: showSourceBadge,
                                        showSeriesPositionBadge: showSeriesPositionBadge,
                                        coverPreference: coverPreference,
                                        progressStyle: progressStyle,
                                        showOnItem: ShowOnItemField.decodeSelection(showOnItemRaw),
                                        coverSize: coverSize,
                                        horizontalSpacing: gridGap,
                                        cardTapInProgress: $cardTapInProgress,
                                        onEditMetadata: handleEditMetadata,
                                        onNavigateToSection: { navigateToSection($0) },
                                    )
                                    .id(section.id)
                                    .padding(.leading, horizontalPadding)
                                    .padding(.trailing, trailingContentPadding)
                                }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        #if os(macOS)
                        if cardTapInProgress {
                            cardTapInProgress = false
                            return
                        }
                        #endif
                        selection = nil
                        dismissSidebar()
                    }
                    #if os(macOS)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in }
                    )
                    #endif
                }

                #if os(macOS)
                if shouldShowSidebar, let item = selectedItem {
                    MediaGridInfoSidebar(
                        item: item,
                        onClose: { dismissSidebar() },
                        onReadNow: { dismissSidebar() },
                        onRename: {},
                        onDelete: { dismissSidebar() },
                        onSeriesSelected: { seriesName in
                            navigationPath.append(SeriesNavIdentifier(name: seriesName))
                        },
                        roundsTopTrailingCorner: true,
                    )
                    .frame(width: sidebarWidth)
                }
                #endif
            }
            #if os(macOS)
            .animation(.easeInOut(duration: 0.25), value: shouldShowSidebar)
            #endif
        }
        #if os(macOS)
        .clipped()
        .focusable(true)
        .focusEffectDisabled(true)
        .onMoveCommand(perform: handleMoveCommand)
        .onKeyPress(.escape) {
            if isSidebarVisible {
                dismissSidebar()
                return .handled
            }
            return .ignored
        }
        .alert("Edit Metadata", isPresented: $showPermissionError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(permissionErrorMessage)
        }
        #endif
        .onAppear {
            debugLog(
                "[PerfTrace][HomeLoad] onAppear isReady=\(mediaViewModel.isReady) libraryVersion=\(mediaViewModel.libraryVersion) books=\(mediaViewModel.library.bookMetaData.count)"
            )
            if mediaViewModel.isReady {
                loadSections(source: "onAppear")
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(0.5))
            allowEmptyStateDisplay = true
        }
        .onChange(of: selection) { _, _ in
            reconcileSidebarVisibility()
        }
        .onChange(of: mediaViewModel.isReady) {
            debugLog(
                "[PerfTrace][HomeLoad] onChange isReady=\(mediaViewModel.isReady) libraryVersion=\(mediaViewModel.libraryVersion) books=\(mediaViewModel.library.bookMetaData.count)"
            )
            if mediaViewModel.isReady {
                loadSections(source: "onChange(isReady)")
            }
        }
        .onChange(of: mediaViewModel.libraryVersion) {
            debugLog(
                "[PerfTrace][HomeLoad] onChange libraryVersion=\(mediaViewModel.libraryVersion) isReady=\(mediaViewModel.isReady) books=\(mediaViewModel.library.bookMetaData.count)"
            )
            if mediaViewModel.isReady {
                loadSections(source: "onChange(libraryVersion)")
            }
        }
        .onChange(of: searchText) { _, _ in
            if mediaViewModel.isReady {
                loadSections(source: "onChange(searchText)")
            }
        }
        .onChange(of: homeSectionConfigJSON) {
            if mediaViewModel.isReady {
                loadSections(source: "onChange(homeSectionConfig)")
            }
        }
        .onChange(of: sidebarConfigJSON) {
            if mediaViewModel.isReady {
                loadSections(source: "onChange(sidebarConfig)")
            }
        }
    }

    private func loadSections(source: String) {
        let started = CFAbsoluteTimeGetCurrent()
        debugLog(
            "[PerfTrace][HomeLoad] loadSections start source=\(source) libraryVersion=\(mediaViewModel.libraryVersion) books=\(mediaViewModel.library.bookMetaData.count)"
        )
        let visibleSectionIDs = HomeSectionConfigHelper.config.filter(\.visible).map(\.id)
        let context = mediaViewModel.libraryRenderContext()
        let search = searchText
        loadSectionsGeneration += 1
        let generation = loadSectionsGeneration
        loadSectionsTask?.cancel()
        loadSectionsTask = Task.detached(priority: .userInitiated) {
            let newSections = Self.deriveHomeSections(
                visibleSectionIDs: visibleSectionIDs,
                context: context,
                searchText: search,
            )
            let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
            await MainActor.run {
                guard !Task.isCancelled, generation == loadSectionsGeneration else { return }
                sections = newSections
                let summary = newSections.map { "\($0.title)=\($0.items.count)" }
                    .joined(separator: ", ")
                debugLog(
                    "[PerfTrace][HomeLoad] loadSections end source=\(source) elapsedMs=\(String(format: "%.1f", elapsed)) sections=[\(summary)]"
                )
            }
        }
    }

    private static nonisolated func deriveHomeSections(
        visibleSectionIDs: [String],
        context: MediaViewModel.LibraryRenderContext,
        searchText: String,
    ) -> [HomeSection] {
        let builtInKinds = visibleSectionIDs.compactMap(HomeSectionKind.init(rawValue:))
        let builtInSections = Dictionary(
            HomeSectionDeriver.sections(
                kinds: builtInKinds,
                books: context.metadata,
                progress: context.progress,
                searchText: searchText,
            ).map { ($0.kind, $0) },
            uniquingKeysWith: { first, _ in first },
        )

        return visibleSectionIDs.compactMap { itemID in
            if let kind = HomeSectionKind(rawValue: itemID),
                let snapshot = builtInSections[kind]
            {
                return makeBuiltInSection(snapshot)
            }
            return makePinnedSection(
                pinId: itemID,
                context: context,
                searchText: searchText,
            )
        }
    }

    private var selectedItem: BookMetadata? {
        guard let selection else { return nil }
        guard sections.indices.contains(selection.sectionIndex) else { return nil }
        let items = sections[selection.sectionIndex].items
        return items.first { $0.id == selection.itemID }
    }

    private func ensureSelection() {
        if let selection, let item = selectedItem,
            sections.indices.contains(selection.sectionIndex),
            item.id == selection.itemID
        {
            return
        }
        selection = firstAvailableSelection()
    }

    private func reconcileSidebarVisibility() {
        guard let selection, selectedItem != nil else {
            isSidebarVisible = false
            return
        }
        if !sections.indices.contains(selection.sectionIndex) {
            isSidebarVisible = false
        }
    }

    private func dismissSidebar() {
        #if os(macOS)
        isSidebarVisible = false
        #else
        withAnimation(.easeInOut(duration: 0.2)) {
            isSidebarVisible = false
        }
        #endif
    }

    private func handleEditMetadata(bookIds: [BookID]) {
        #if os(macOS)
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
        #endif
    }

    #if os(macOS)
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

    private func firstAvailableSelection() -> Selection? {
        for (index, section) in sections.enumerated() {
            if let first = section.items.first {
                return Selection(sectionIndex: index, itemID: first.id)
            }
        }
        return nil
    }

    private func indexOfItem(in sectionIndex: Int, id: BookMetadata.ID) -> Int? {
        guard sections.indices.contains(sectionIndex) else { return nil }
        return sections[sectionIndex].items.firstIndex { $0.id == id }
    }

    private func adjacentSection(from index: Int, step: Int) -> Int? {
        var target = index + step
        while sections.indices.contains(target) {
            if !sections[target].items.isEmpty {
                return target
            }
            target += step
        }
        return nil
    }

    #if os(macOS)
    private func handleMoveCommand(_ direction: MoveCommandDirection) {
        ensureSelection()
        guard let currentSelection = selection,
            let currentItemIndex = indexOfItem(
                in: currentSelection.sectionIndex,
                id: currentSelection.itemID,
            )
        else {
            return
        }

        let currentSectionIndex = currentSelection.sectionIndex
        let currentItems = sections[currentSectionIndex].items
        guard !currentItems.isEmpty else { return }

        var targetSectionIndex = currentSectionIndex
        var targetItemIndex = currentItemIndex

        switch direction {
            case .left:
                if currentItemIndex > 0 {
                    targetItemIndex = currentItemIndex - 1
                }
            case .right:
                if currentItemIndex < currentItems.count - 1 {
                    targetItemIndex = currentItemIndex + 1
                }
            case .up:
                if let previousSection = adjacentSection(from: currentSectionIndex, step: -1) {
                    let previousItems = sections[previousSection].items
                    let preferredIndex = min(currentItemIndex, previousItems.count - 1)
                    targetSectionIndex = previousSection
                    targetItemIndex = preferredIndex
                }
            case .down:
                if let nextSection = adjacentSection(from: currentSectionIndex, step: 1) {
                    let nextItems = sections[nextSection].items
                    let preferredIndex = min(currentItemIndex, nextItems.count - 1)
                    targetSectionIndex = nextSection
                    targetItemIndex = preferredIndex
                }
            default:
                return
        }

        guard sections.indices.contains(targetSectionIndex) else { return }
        let targetItems = sections[targetSectionIndex].items
        guard !targetItems.isEmpty else { return }
        let clampedItemIndex = min(max(targetItemIndex, 0), targetItems.count - 1)
        let targetItem = targetItems[clampedItemIndex]

        let newSelection = Selection(sectionIndex: targetSectionIndex, itemID: targetItem.id)
        if newSelection != selection {
            selection = newSelection
        }
    }

    #endif

    private static nonisolated func makeBuiltInSection(
        _ snapshot: HomeSectionSnapshot
    ) -> HomeSection {
        HomeSection(
            title: snapshot.kind.title,
            mediaKind: .ebook,
            items: snapshot.books,
            destination: snapshot.kind.title,
            tagFilter: nil,
            statusFilter: snapshot.kind.statusFilter,
            sortOrder: snapshot.kind.sortOrder,
        )
    }

    private static nonisolated func makePinnedSection(
        pinId: String,
        context: MediaViewModel.LibraryRenderContext,
        searchText: String,
    ) -> HomeSection? {
        let allBooks = context.metadata
        let title: String
        var matched: [BookMetadata] = []

        if pinId.hasPrefix("pin.series:") {
            let value = String(pinId.dropFirst("pin.series:".count))
            title = value
            matched = allBooks.filter { $0.matchesSeries(value) }
        } else if pinId.hasPrefix("pin.author:") {
            let value = String(pinId.dropFirst("pin.author:".count))
            title = value
            matched = allBooks.filter { $0.matchesAuthor(value) }
        } else if pinId.hasPrefix("pin.collection:") {
            let value = String(pinId.dropFirst("pin.collection:".count))
            title = value
            matched = allBooks.filter { $0.matchesCollection(value) }
        } else if pinId.hasPrefix("pin.tag:") {
            let value = String(pinId.dropFirst("pin.tag:".count))
            title = value
            matched = allBooks.filter { $0.matchesTag(value) }
        } else if pinId.hasPrefix("pin.narrator:") {
            let value = String(pinId.dropFirst("pin.narrator:".count))
            title = value
            matched = allBooks.filter { $0.matchesNarrator(value) }
        } else if pinId.hasPrefix("pin.translator:") {
            let value = String(pinId.dropFirst("pin.translator:".count))
            title = value
            matched = allBooks.filter { $0.matchesTranslator(value) }
        } else if pinId.hasPrefix("pin.year:") {
            let value = String(pinId.dropFirst("pin.year:".count))
            title = value
            matched = allBooks.filter { $0.matchesPublicationYear(value) }
        } else if pinId.hasPrefix("pin.rating:") {
            let value = String(pinId.dropFirst("pin.rating:".count))
            title = RatingDisplayHelper.label(for: value)
            matched = allBooks.filter { $0.matchesRating(value) }
        } else if pinId.hasPrefix("pin.smartShelf:") {
            let uuidString = String(pinId.dropFirst("pin.smartShelf:".count))
            guard let uuid = UUID(uuidString: uuidString),
                let shelf = context.smartShelves.first(where: { $0.id == uuid })
            else {
                return nil
            }
            title = shelf.name
            matched = booksForShelf(shelf, context: context)
        } else if pinId.hasPrefix("pin.sidebar:") {
            let stableId = String(pinId.dropFirst("pin.sidebar:".count))
            guard let item = SidebarConfigHelper.defaultItemLookup[stableId] else { return nil }
            title = item.name
            switch item.content {
                case .mediaGrid(let config):
                    matched = allBooks
                    if let tag = config.tagFilter {
                        matched = matched.filter { $0.matchesTag(tag) }
                    }
                    if let series = config.seriesFilter {
                        matched = matched.filter { $0.matchesSeries(series) }
                    }
                    if let author = config.authorFilter {
                        matched = matched.filter { $0.matchesAuthor(author) }
                    }
                    if let narrator = config.narratorFilter {
                        matched = matched.filter { $0.matchesNarrator(narrator) }
                    }
                    if let status = config.statusFilter {
                        matched = matched.filter { $0.matchesStatus(status) }
                    }
                    if config.locationFilter == .downloaded {
                        matched = matched.filter { isDownloaded($0, context: context) }
                    }
                case .downloaded:
                    matched = allBooks.filter { isDownloaded($0, context: context) }
                default:
                    matched = allBooks
            }
        } else {
            return nil
        }

        let searched = matched.filter {
            HomeSectionDeriver.matchesSearchText($0, searchText: searchText)
        }
        return HomeSection(
            title: title,
            mediaKind: .ebook,
            items: Array(searched.prefix(12)),
            destination: pinId,
            tagFilter: nil,
            statusFilter: nil,
            sortOrder: nil,
        )
    }

    private static nonisolated func booksForShelf(
        _ shelf: SmartShelf,
        context: MediaViewModel.LibraryRenderContext,
    ) -> [BookMetadata] {
        context.metadata.filter { book in
            let progress = context.progress[book.id]?.progressFraction ?? book.progress
            let isLocal = context.folderSourceBookIds.contains(book.id)
            let locationInfo = ShelfLocationInfo(
                isDownloaded: isDownloaded(book, context: context) && !isLocal,
                isLocalStandalone: isLocal,
            )
            return shelf.matchesAll(book, progress: progress, locationInfo: locationInfo)
        }.sorted {
            $0.title.articleStrippedCompare($1.title) == .orderedAscending
        }
    }

    private static nonisolated func isDownloaded(
        _ book: BookMetadata,
        context: MediaViewModel.LibraryRenderContext,
    ) -> Bool {
        guard !context.folderSourceBookIds.contains(book.id) else { return false }
        let paths = context.paths[book.id]
        return paths?.ebookPath != nil || paths?.audioPath != nil || paths?.syncedPath != nil
    }

    private func navigateToSection(_ section: HomeSection) {
        let filter = SectionFilter(
            title: section.title,
            mediaKind: section.mediaKind,
            tagFilter: section.tagFilter,
            statusFilter: section.statusFilter,
            sortOrder: section.sortOrder,
        )
        navigationPath.append(filter)
    }

    @ViewBuilder
    private func sectionFilterView(for filter: SectionFilter) -> some View {
        #if os(iOS)
        MediaGridView(
            title: filter.title,
            searchText: "",
            mediaKind: filter.mediaKind,
            viewOptionsKey: "home",
            tagFilter: filter.tagFilter,
            seriesFilter: nil,
            statusFilter: filter.statusFilter,
            defaultSort: defaultSortForFilter(filter),
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [
                MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)
            ],
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
        )
        .navigationTitle(filter.title)
        #else
        MediaGridView(
            title: filter.title,
            searchText: "",
            mediaKind: filter.mediaKind,
            viewOptionsKey: "home",
            tagFilter: filter.tagFilter,
            seriesFilter: nil,
            statusFilter: filter.statusFilter,
            defaultSort: defaultSortForFilter(filter),
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
        )
        .navigationTitle(filter.title)
        #endif
    }

    private func defaultSortForFilter(_ filter: SectionFilter) -> String {
        guard let sortOrder = filter.sortOrder else { return "titleAZ" }
        switch sortOrder {
            case .recentlyAdded:
                return "recentlyAdded"
            case .recentPositionUpdate:
                return "recentlyRead"
        }
    }

    #if os(iOS)

    private var searchOverlay: some View {
        MediaGridView(
            title: "Search",
            searchText: searchText,
            mediaKind: .ebook,
            viewOptionsKey: "home.search",
            tagFilter: nil,
            seriesFilter: nil,
            statusFilter: nil,
            defaultSort: "titleAZ",
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [
                MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)
            ],
            initialNarrationFilterOption: .both,
        )
        .background(Color(uiColor: .systemBackground))
    }
    #endif

    #if os(macOS)
    private var searchOverlayMacOS: some View {
        MediaGridView(
            title: "Search",
            searchText: searchText,
            mediaKind: .ebook,
            viewOptionsKey: "home.search",
            tagFilter: nil,
            seriesFilter: nil,
            statusFilter: nil,
            defaultSort: "titleAZ",
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
        )
        .background(Color(nsColor: .windowBackgroundColor))
    }

    @ViewBuilder
    private func seriesDetailView(for seriesName: String) -> some View {
        MediaGridView(
            title: seriesName,
            searchText: "",
            mediaKind: .ebook,
            viewOptionsKey: "home",
            tagFilter: nil,
            seriesFilter: seriesName,
            statusFilter: nil,
            defaultSort: "seriesPosition",
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            onSeriesSelected: { newSeriesName in
                navigationPath.append(SeriesNavIdentifier(name: newSeriesName))
            },
            initialNarrationFilterOption: .both,
        )
        .navigationTitle(seriesName)
    }
    #endif

    #if os(iOS)
    private var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }
    #endif

    @ViewBuilder
    private var viewOptionsButton: some View {
        let button = Button {
            showViewOptions.toggle()
        } label: {
            Label("View Options", systemImage: "ellipsis.circle")
        }
        #if os(macOS)
        button.popover(isPresented: $showViewOptions) {
            viewOptionsPopoverContent
        }
        #else
        if isPad {
            button.popover(isPresented: $showViewOptions) {
                viewOptionsPopoverContent
            }
        } else {
            button.sheet(isPresented: $showViewOptions) {
                viewOptionsSheet
                    .presentationDetents([.medium])
            }
        }
        #endif
    }

    #if os(iOS)
    @ViewBuilder
    private var viewOptionsSheet: some View {
        NavigationStack {
            ScrollView {
                viewOptionsPopoverContent
            }
            .navigationTitle("View Options")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showViewOptions = false }
                }
            }
        }
    }
    #endif

    @ViewBuilder
    private var viewOptionsPopoverContent: some View {
        LibraryViewOptions(
            coverPrefRaw: $coverPrefRaw,
            coverSizeValue: $coverSizeValue,
            gridSpacingRaw: $gridSpacingRaw,
            showAudioIndicator: $showAudioIndicator,
            showSourceBadge: $showSourceBadge,
            showSeriesPositionBadge: $showSeriesPositionBadge,
            progressStyleRaw: $progressStyleRaw,
            showOnItemRaw: $showOnItemRaw,
        )
    }
}

private struct HomeSectionRow: View {
    let sectionIndex: Int
    let section: HomeView.HomeSection
    @Binding var selection: HomeView.Selection?
    @Binding var isSidebarVisible: Bool
    @Binding var sidebarSections: [SidebarSectionDescription]
    @Binding var selectedSidebarItem: SidebarItemDescription?
    let showAudioIndicator: Bool
    let showSourceBadge: Bool
    let showSeriesPositionBadge: Bool
    let coverPreference: CoverPreference
    let progressStyle: ProgressIndicatorStyle
    let showOnItem: [ShowOnItemField]
    let coverSize: CGFloat
    let horizontalSpacing: CGFloat
    @Binding var cardTapInProgress: Bool
    let onEditMetadata: ([BookID]) -> Void
    let onNavigateToSection: (HomeView.HomeSection) -> Void
    private var tileWidth: CGFloat { coverSize }

    #if os(macOS)
    @State private var canScrollLeft: Bool = false
    @State private var canScrollRight: Bool = true
    @State private var scrollTarget: Int = 0
    #endif

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(section.title)
                    .font(.storytellerTitle(size: 22))

                #if os(macOS)
                if !section.items.isEmpty {
                    Button {
                        scrollLeft()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(canScrollLeft ? Color.secondary : Color.secondary.opacity(0.5))
                    .disabled(!canScrollLeft)

                    Button {
                        scrollRight()
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(
                        canScrollRight ? Color.secondary : Color.secondary.opacity(0.5)
                    )
                    .disabled(!canScrollRight)
                }
                #endif

                Spacer()
                Button("See All") {
                    onNavigateToSection(section)
                }
                .buttonStyle(.plain)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.tint)
            }

            let metrics = MediaItemCardMetrics.make(
                for: tileWidth,
                mediaKind: section.mediaKind,
                coverPreference: coverPreference,
                secondaryLineCount: ShowOnItemField.secondaryLineCount(showOnItem),
            )

            if section.items.isEmpty {
                VStack {
                    Text("No items currently.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .frame(maxWidth: .infinity)
                .frame(height: max(tileWidth * 0.9, 120))
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.secondary.opacity(0.08))
                )
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: horizontalSpacing) {
                            ForEach(section.items) { item in
                                card(for: item, metrics: metrics)
                                    .id(item.id)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    #if os(macOS)
                    .onScrollGeometryChange(for: Bool.self) { geo in
                        geo.contentOffset.x > 1
                    } action: { _, val in
                        canScrollLeft = val
                    }
                    .onScrollGeometryChange(for: Bool.self) { geo in
                        let max = geo.contentSize.width - geo.containerSize.width
                        return max > 1 && geo.contentOffset.x < max - 1
                    } action: { _, val in
                        canScrollRight = val
                    }
                    .onChange(of: scrollTarget) {
                        guard scrollTarget >= 0, scrollTarget < section.items.count else { return }
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo(section.items[scrollTarget].id, anchor: .leading)
                        }
                    }
                    #endif
                }
                .frame(height: calculateRowHeight(metrics: metrics))
            }
        }
    }

    @ViewBuilder
    private func card(for item: BookMetadata, metrics: MediaItemCardMetrics) -> some View {
        MediaItemCardView(
            item: item,
            mediaKind: section.mediaKind,
            metrics: metrics,
            isSelected: isItemSelected(item.id),
            showAudioIndicator: showAudioIndicator,
            sourceLabel: showSourceBadge ? item.source : nil,
            seriesPositionBadge: seriesPositionBadge(for: item),
            coverPreference: coverPreference,
            progressStyle: progressStyle,
            showOnItem: showOnItem,
            onSelect: { selected in
                select(selected)
            },
            onInfo: { selected in
                openInfo(for: selected)
            },
            onEditMetadata: editMetadataHandler,
            debugContext: "Home:\(section.title)",
        )
    }

    private var editMetadataHandler: (([BookID]) -> Void)? {
        #if os(macOS)
        onEditMetadata
        #else
        nil
        #endif
    }

    private func isItemSelected(_ id: BookMetadata.ID) -> Bool {
        guard let selection else { return false }
        return selection.sectionIndex == sectionIndex && selection.itemID == id
    }

    private func select(_ item: BookMetadata) {
        #if os(macOS)
        cardTapInProgress = true
        #endif
        let newSelection = HomeView.Selection(sectionIndex: sectionIndex, itemID: item.id)
        if selection != newSelection {
            selection = newSelection
        }
    }

    private func openInfo(for item: BookMetadata) {
        select(item)
        if !isSidebarVisible {
            #if os(macOS)
            isSidebarVisible = true
            #else
            withAnimation(.easeInOut(duration: 0.2)) {
                isSidebarVisible = true
            }
            #endif
        }
    }

    #if os(macOS)
    private func scrollLeft() {
        scrollTarget = max(scrollTarget - 3, 0)
    }

    private func scrollRight() {
        scrollTarget = min(scrollTarget + 3, section.items.count - 1)
    }
    #endif

    private func seriesPositionBadge(for item: BookMetadata) -> String? {
        guard showSeriesPositionBadge else { return nil }
        guard let seriesList = item.series, let series = seriesList.first else { return nil }
        return series.formattedPosition
    }

    private func calculateRowHeight(metrics: MediaItemCardMetrics) -> CGFloat {
        return metrics.maxCardHeight
    }
}

#endif
