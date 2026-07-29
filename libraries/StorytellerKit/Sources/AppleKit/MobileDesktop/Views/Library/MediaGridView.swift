#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

#if os(macOS)

private struct ScrollWheelMonitor: ViewModifier {
    let onScroll: () -> Void
    @State private var monitor: Any?

    func body(content: Content) -> some View {
        content
            .onAppear {
                monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { event in
                    onScroll()
                    return event
                }
            }
            .onDisappear {
                if let monitor {
                    NSEvent.removeMonitor(monitor)
                }
            }
    }
}

extension View {
    func onScrollWheel(perform action: @escaping () -> Void) -> some View {
        modifier(ScrollWheelMonitor(onScroll: action))
    }
}
#endif

struct SeriesNavIdentifier: Hashable {
    let name: String
}

struct SeriesDetailNavigation: Hashable {
    let seriesName: String
    let initialSelectedBook: BookMetadata?
}

struct CollectionDetailNavigation: Hashable {
    let collectionIdentifier: String
    let initialSelectedBook: BookMetadata?
}

struct MediaGridView: View {
    typealias SortOption = MediaGridSortOption
    typealias FormatFilterOption = MediaGridFormatFilterOption
    typealias LocationFilterOption = MediaGridLocationFilterOption
    typealias ContextFilters = MediaGridContextFilters

    public struct ColumnBreakpoint: Hashable {
        public let columns: Int
        public let minWidth: CGFloat

        public init(columns: Int, minWidth: CGFloat) {
            self.columns = columns
            self.minWidth = minWidth
        }
    }

    let title: String
    let searchText: String
    @Environment(MediaViewModel.self) private var mediaViewModel: MediaViewModel
    let mediaKind: MediaKind
    let tagFilter: String?
    let seriesFilter: String?
    let collectionFilter: String?
    let authorFilter: String?
    let narratorFilter: String?
    let translatorFilter: String?
    let publicationYearFilter: String?
    let ratingFilter: String?
    let statusFilter: String?
    let contextFilters: ContextFilters
    let defaultSort: String?
    let tableContext: String
    let preferredTileWidth: CGFloat
    let minimumTileWidth: CGFloat
    let columnBreakpoints: [ColumnBreakpoint]
    let onReadNow: (BookMetadata) -> Void
    let onRename: (BookMetadata) -> Void
    let onDelete: (BookMetadata) -> Void
    let onSeriesSelected: ((String) -> Void)?
    let onMetadataLinkClicked: ((MetadataLinkTarget) -> Void)?
    let initialNarrationFilterOption: NarrationFilter
    private let scrollPosition: Binding<BookMetadata.ID?>?
    private let initialSelectedItem: BookMetadata?
    let filteredItems: [BookMetadata]?
    let showAddBookButton: Bool
    let addBookSourceID: BookSourceID?
    let sourceFilterKind: BookSourceKind?
    let emptyStateMessage: String
    // The grid designated to consume pendingInfoBookID even when its filters
    // hide the book; other grids only consume books they can display.
    let isPendingInfoFallbackTarget: Bool

    #if os(macOS)
    // Workaround for macOS Sequoia bug where parent view's onTapGesture fires after card tap
    @State private var cardTapInProgress: Bool = false
    @Environment(\.openWindow) private var openWindow
    #endif

    @State private var activeInfoItem: BookMetadata? = nil
    @State private var isSidebarVisible: Bool = false
    @State private var bulkSelection = BulkSelectionModel()
    @State private var lastKnownColumnCount: Int = 1
    @AppStorage private var selectedSortOptionRaw: String
    @State private var selectedFormatFilter: FormatFilterOption
    @State private var selectedTag: String? = nil
    @State private var selectedSeries: String? = nil
    @State private var selectedCollection: String? = nil
    @State private var selectedAuthor: String? = nil
    @State private var selectedNarrator: String? = nil
    @State private var selectedTranslator: String? = nil
    @State private var selectedPublicationYear: String? = nil
    @State private var selectedRating: String? = nil
    @State private var selectedStatus: String? = nil
    @State private var selectedProgress: ProgressCondition? = nil
    @State private var selectedLocation: LocationFilterOption = .all
    @State private var selectedSourceID: BookSourceID? = nil
    @State private var shouldEnsureActiveItemVisible: Bool = false
    @State private var hasHandledInitialSelection: Bool = false
    @AppStorage private var showSourceBadge: Bool
    @AppStorage private var showSeriesPositionBadge: Bool
    @AppStorage private var showAudioIndicator: Bool
    @AppStorage private var progressStyleRaw: String
    @State private var showStickyControls: Bool = false
    @Environment(\.libraryNavigationSidebarVisible) private var libraryNavigationSidebarVisible
    @Environment(\.colorScheme) private var colorScheme
    @State private var showPermissionError: Bool = false
    @State private var permissionErrorMessage: String = ""
    @State private var showLocalFolderHelp: Bool = false
    #if os(iOS)
    @State private var showAddBook: Bool = false
    #endif
    @AppStorage private var layoutStyleRaw: String
    @AppStorage private var coverPrefRaw: String
    @AppStorage private var coverSizeValue: Double
    @AppStorage private var gridSpacingRaw: String
    @AppStorage private var showOnItemRaw: String
    #if os(macOS)
    @State private var columnCustomization: TableColumnCustomization<BookMetadata> =
        Self.loadColumnCustomization()
    @State private var tableSortOrder: [KeyPathComparator<BookMetadata>]
    @State private var tableSortedItems: [BookMetadata] = []
    @State private var lastSortKeyPath: AnyKeyPath?
    @State private var creatorSortRoleCode: String?
    @State private var enabledCreatorRoles: Set<String> = Self.loadEnabledCreatorRoles()
    @State private var columnResetToken: Int = 0
    #if os(macOS)
    @State private var quickEditTarget: MetadataQuickEditTarget?
    #endif

    private static let columnCustomizationKey = "library.table.columnCustomization"
    private static let enabledCreatorRolesKey = "library.table.enabledCreatorRoles"

    private static func loadEnabledCreatorRoles() -> Set<String> {
        guard let array = UserDefaults.standard.stringArray(forKey: enabledCreatorRolesKey) else {
            return []
        }
        return Set(array)
    }

    private func saveEnabledCreatorRoles() {
        UserDefaults.standard.set(
            Array(enabledCreatorRoles),
            forKey: Self.enabledCreatorRolesKey,
        )
    }

    private static func loadColumnCustomization() -> TableColumnCustomization<BookMetadata> {
        guard let data = UserDefaults.standard.data(forKey: columnCustomizationKey),
            let customization = try? JSONDecoder().decode(
                TableColumnCustomization<BookMetadata>.self,
                from: data,
            )
        else {
            return TableColumnCustomization<BookMetadata>()
        }
        return customization
    }

    private func saveColumnCustomization() {
        guard let data = try? JSONEncoder().encode(columnCustomization) else { return }
        UserDefaults.standard.set(data, forKey: Self.columnCustomizationKey)
    }

    private static func tableComparator(for sortOption: SortOption) -> (
        comparator: KeyPathComparator<BookMetadata>, keyPath: AnyKeyPath
    ) {
        let order: SortOrder = sortOption.ascending ? .forward : .reverse
        if let key = sortOption.field.sortableKey {
            return (KeyPathComparator(key, order: order), key)
        }
        switch sortOption.field {
            case .progress:
                return (
                    KeyPathComparator(\BookMetadata.sortableProgress, order: order),
                    \BookMetadata.sortableProgress,
                )
            case .pages:
                return (
                    KeyPathComparator(\BookMetadata.sortablePages, order: order),
                    \BookMetadata.sortablePages,
                )
            case .duration:
                return (
                    KeyPathComparator(\BookMetadata.sortableDuration, order: order),
                    \BookMetadata.sortableDuration,
                )
            case .fileSize:
                return (
                    KeyPathComparator(\BookMetadata.sortableFileSize, order: order),
                    \BookMetadata.sortableFileSize,
                )
            default:
                return (
                    KeyPathComparator(\BookMetadata.sortableSeries, order: order),
                    \BookMetadata.sortableSeries,
                )
        }
    }
    #endif

    private var layoutStyle: LibraryLayoutStyle {
        get { LibraryLayoutStyle(rawValue: layoutStyleRaw) ?? .grid }
        set { layoutStyleRaw = newValue.rawValue }
    }

    private var coverPreference: CoverPreference {
        get { CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook }
        set { coverPrefRaw = newValue.rawValue }
    }

    private var progressStyle: ProgressIndicatorStyle {
        get { ProgressIndicatorStyle(rawValue: progressStyleRaw) ?? .circle }
        set { progressStyleRaw = newValue.rawValue }
    }

    private var showOnItem: [ShowOnItemField] {
        ShowOnItemField.decodeSelection(showOnItemRaw)
    }

    /// Minimum column width; columns flex above this until another one fits.
    private var coverSize: CGFloat {
        get { CGFloat(coverSizeValue).clamped(to: CoverSizeRange.min...CoverSizeRange.max) }
        set { coverSizeValue = Double(newValue) }
    }

    private var gridSpacing: GridSpacing {
        GridSpacing(rawValue: gridSpacingRaw) ?? .defaultValue
    }

    private var gridGap: CGFloat { gridSpacing.points }

    private var selectedSortOption: SortOption {
        get { SortOption(rawValue: selectedSortOptionRaw) ?? .titleAZ }
        set { selectedSortOptionRaw = newValue.rawValue }
    }

    private var selectedSortOptionBinding: Binding<SortOption> {
        Binding(
            get: { selectedSortOption },
            set: { selectedSortOptionRaw = $0.rawValue },
        )
    }

    @State private var cachedDisplayItems: [BookMetadata] = []
    @State private var cachedAvailableTags: [String] = []
    @State private var cachedAvailableSeries: [String] = []
    @State private var cachedAvailableAuthors: [String] = []
    @State private var cachedAvailableNarrators: [String] = []
    @State private var cachedAvailableTranslators: [String] = []
    @State private var cachedAvailablePublicationYears: [String] = []
    @State private var cachedAvailableRatings: [String] = []
    @State private var cachedAvailableStatuses: [String] = []
    @State private var cachedAvailableCreatorRoles: Set<String> = []
    @State private var cachedFiltersSummary: String = ""
    @State private var lastCachedLibraryVersion: Int = -1
    @State private var renderSnapshotTask: Task<Void, Never>?
    @State private var tableSortTask: Task<Void, Never>?
    @State private var renderRequestGeneration: Int = 0

    private static let defaultHorizontalSpacing: CGFloat = 16
    private let horizontalSpacing: CGFloat = MediaGridView.defaultHorizontalSpacing
    private let verticalSpacing: CGFloat = 24
    private let gridHorizontalPadding: CGFloat = 16
    private let sidebarWidth: CGFloat = 340
    private let headerFontSize: CGFloat = 32

    #if os(macOS)
    private let platformMinimumWidth: CGFloat = 550
    #else
    // TODO: what floor makes sense here for iOS?
    private let platformMinimumWidth: CGFloat = 0
    #endif

    init(
        title: String,
        searchText: String = "",
        mediaKind: MediaKind = .ebook,
        viewOptionsKey: String = "books",
        tagFilter: String? = nil,
        seriesFilter: String? = nil,
        collectionFilter: String? = nil,
        authorFilter: String? = nil,
        narratorFilter: String? = nil,
        translatorFilter: String? = nil,
        publicationYearFilter: String? = nil,
        ratingFilter: String? = nil,
        statusFilter: String? = nil,
        defaultSort: String? = nil,
        tableContext: String = "main",
        preferredTileWidth: CGFloat = 250,
        minimumTileWidth: CGFloat = 10,
        columnBreakpoints: [ColumnBreakpoint]? = nil,
        onReadNow: ((BookMetadata) -> Void)? = { _ in },
        onRename: ((BookMetadata) -> Void)? = { _ in },
        onDelete: ((BookMetadata) -> Void)? = { _ in },
        onSeriesSelected: ((String) -> Void)? = nil,
        onMetadataLinkClicked: ((MetadataLinkTarget) -> Void)? = nil,
        initialNarrationFilterOption: NarrationFilter = .both,
        initialLocationFilter: LocationFilterOption = .all,
        scrollPosition: Binding<BookMetadata.ID?>? = nil,
        initialSelectedItem: BookMetadata? = nil,
        filteredItems: [BookMetadata]? = nil,
        showAddBookButton: Bool = false,
        addBookSourceID: BookSourceID? = nil,
        sourceFilterID: BookSourceID? = nil,
        sourceFilterName: String? = nil,
        sourceFilterKind: BookSourceKind? = nil,
        emptyStateMessage: String =
            "Add a local folder or Storyteller server in Settings > Book Sources, then use Add Book to add files.",
        isPendingInfoFallbackTarget: Bool = false,
    ) {
        _layoutStyleRaw = AppStorage(
            wrappedValue: LibraryLayoutStyle.grid.rawValue,
            "viewLayout.\(viewOptionsKey)",
        )
        _coverPrefRaw = AppStorage(
            wrappedValue: CoverPreference.storytellerDouble.rawValue,
            "coverPref.\(viewOptionsKey)",
        )
        _coverSizeValue = AppStorage(
            wrappedValue: CoverSizeRange.defaultValue,
            "coverSize.\(viewOptionsKey)",
        )
        _gridSpacingRaw = AppStorage(
            wrappedValue: GridSpacing.defaultValue.rawValue,
            "gridSpacing.\(viewOptionsKey)",
        )
        _showAudioIndicator = AppStorage(
            wrappedValue: true,
            "showAudioIndicator.\(viewOptionsKey)",
        )
        _showSourceBadge = AppStorage(wrappedValue: false, "showSourceBadge.\(viewOptionsKey)")
        _showSeriesPositionBadge = AppStorage(
            wrappedValue: seriesFilter != nil,
            "showSeriesPositionBadge.\(viewOptionsKey)",
        )
        _progressStyleRaw = AppStorage(
            wrappedValue: ProgressIndicatorStyle.circle.rawValue,
            "progressStyle.\(viewOptionsKey)",
        )
        _showOnItemRaw = AppStorage(
            wrappedValue: ShowOnItemField.auto.rawValue,
            "showOnItem.\(viewOptionsKey)",
        )
        self.title = title
        self.searchText = searchText
        self.mediaKind = mediaKind
        self.tagFilter = tagFilter
        self.seriesFilter = seriesFilter
        self.collectionFilter = collectionFilter
        self.authorFilter = authorFilter
        self.narratorFilter = narratorFilter
        self.translatorFilter = translatorFilter
        self.publicationYearFilter = publicationYearFilter
        self.ratingFilter = ratingFilter
        self.statusFilter = statusFilter
        self.contextFilters = ContextFilters(
            tag: tagFilter,
            series: seriesFilter,
            collection: collectionFilter,
            author: authorFilter,
            narrator: narratorFilter,
            translator: translatorFilter,
            publicationYear: publicationYearFilter,
            rating: ratingFilter,
            status: statusFilter,
            location: initialLocationFilter == .all ? nil : initialLocationFilter,
            sourceID: sourceFilterID,
            sourceName: sourceFilterName,
        )
        self.defaultSort = defaultSort
        self.tableContext = tableContext
        self.preferredTileWidth = preferredTileWidth
        self.minimumTileWidth = minimumTileWidth
        let resolvedBreakpoints: [ColumnBreakpoint] =
            if let columnBreakpoints {
                columnBreakpoints.sorted { $0.minWidth < $1.minWidth }
            } else {
                MediaGridView.defaultColumnBreakpoints(
                    preferredTileWidth: preferredTileWidth
                )
            }
        self.columnBreakpoints = resolvedBreakpoints
        self.onReadNow = onReadNow ?? { _ in }
        self.onRename = onRename ?? { _ in }
        self.onDelete = onDelete ?? { _ in }
        self.onSeriesSelected = onSeriesSelected
        self.onMetadataLinkClicked = onMetadataLinkClicked
        self.initialNarrationFilterOption = initialNarrationFilterOption
        self.scrollPosition = scrollPosition
        _selectedFormatFilter = State(
            initialValue: MediaGridView.mapNarrationToFormatFilter(initialNarrationFilterOption)
        )
        _selectedTag = State(initialValue: nil)
        _selectedSeries = State(initialValue: nil)
        _selectedCollection = State(initialValue: nil)
        _selectedAuthor = State(initialValue: nil)
        _selectedNarrator = State(initialValue: nil)
        _selectedTranslator = State(initialValue: nil)
        _selectedPublicationYear = State(initialValue: nil)
        _selectedRating = State(initialValue: nil)
        _selectedStatus = State(initialValue: nil)
        _selectedProgress = State(initialValue: nil)
        _selectedLocation = State(initialValue: .all)

        let defaultSortRaw: String
        if let defaultSort, SortOption(rawValue: defaultSort) != nil {
            defaultSortRaw = defaultSort
        } else {
            defaultSortRaw = SortOption.titleAZ.rawValue
        }
        _selectedSortOptionRaw = AppStorage(
            wrappedValue: defaultSortRaw,
            "sortOption.\(viewOptionsKey)",
        )
        let resolvedSort = SortOption(rawValue: _selectedSortOptionRaw.wrappedValue) ?? .titleAZ
        #if os(macOS)
        let tableSort = Self.tableComparator(for: resolvedSort)
        _tableSortOrder = State(initialValue: [tableSort.comparator])
        _lastSortKeyPath = State(initialValue: tableSort.keyPath)
        #endif
        self.initialSelectedItem = initialSelectedItem
        self.filteredItems = filteredItems
        self.showAddBookButton = showAddBookButton
        self.addBookSourceID = addBookSourceID
        self.sourceFilterKind = sourceFilterKind
        self.emptyStateMessage = emptyStateMessage
        self.isPendingInfoFallbackTarget = isPendingInfoFallbackTarget
    }

    private static func defaultColumnBreakpoints(preferredTileWidth: CGFloat) -> [ColumnBreakpoint]
    {
        let spacing = defaultHorizontalSpacing
        var breakpoints: [ColumnBreakpoint] = []
        let maxColumns = 10
        guard preferredTileWidth > 0 else {
            return breakpoints
        }

        for columns in 4...maxColumns {
            let width = (preferredTileWidth * CGFloat(columns)) + (spacing * CGFloat(columns - 1))
            breakpoints.append(ColumnBreakpoint(columns: columns, minWidth: width))
        }

        return breakpoints
    }

    private struct LayoutConfiguration {
        let columns: [GridItem]
        let tileWidth: CGFloat
    }

    private func resolvedLayout(for containerWidth: CGFloat) -> LayoutConfiguration {
        let availableWidth = max(0, containerWidth - (gridHorizontalPadding * 2))
        guard availableWidth > 0 else {
            let fallbackColumns = max(columnBreakpoints.first?.columns ?? 1, 1)
            let columns = Array(
                repeating: GridItem(.flexible(), spacing: horizontalSpacing, alignment: .top),
                count: fallbackColumns,
            )
            return LayoutConfiguration(
                columns: columns,
                tileWidth: minimumTileWidth,
            )
        }

        var targetColumns =
            columnBreakpoints.last { breakpoint in
                availableWidth >= breakpoint.minWidth
            }?.columns ?? columnBreakpoints.first?.columns ?? 1

        var currentTileWidth = tileWidth(forColumns: targetColumns, availableWidth: availableWidth)

        while currentTileWidth < minimumTileWidth, targetColumns > 1 {
            targetColumns -= 1
            currentTileWidth = tileWidth(forColumns: targetColumns, availableWidth: availableWidth)
        }

        currentTileWidth = max(minimumTileWidth, currentTileWidth)

        let columns = Array(
            repeating: GridItem(
                .fixed(currentTileWidth),
                spacing: horizontalSpacing,
                alignment: .top,
            ),
            count: targetColumns,
        )
        return LayoutConfiguration(columns: columns, tileWidth: currentTileWidth)
    }

    private func tileWidth(forColumns columnCount: Int, availableWidth: CGFloat) -> CGFloat {
        guard columnCount > 0 else { return availableWidth }
        let spacingTotal = horizontalSpacing * CGFloat(max(columnCount - 1, 0))
        let usableWidth = max(availableWidth - spacingTotal, 0)
        return usableWidth / CGFloat(columnCount)
    }

    #if os(macOS)
    // Fixed columns resolve once from the settled width, so the grid does not reflow
    // against the live frame while the detail sidebar animates the width.
    //
    // `tileSize` is a minimum, not a target: the gutter is fixed and the columns absorb the slack.
    private func fixedGridColumns(
        containerWidth: CGFloat,
        tileSize: CGFloat,
        spacing: CGFloat,
    ) -> [GridItem] {
        let availableWidth = max(0, containerWidth - gridHorizontalPadding * 2)
        guard availableWidth > 0, tileSize > 0 else {
            return [GridItem(.fixed(tileSize), spacing: spacing, alignment: .top)]
        }
        return Array(
            repeating: GridItem(
                .fixed(gridTileWidth(containerWidth: containerWidth, tileSize: tileSize, spacing: spacing)),
                spacing: spacing,
                alignment: .top,
            ),
            count: gridColumnCount(
                containerWidth: containerWidth,
                tileSize: tileSize,
                spacing: spacing,
            ),
        )
    }

    private func gridColumnCount(
        containerWidth: CGFloat,
        tileSize: CGFloat,
        spacing: CGFloat,
    ) -> Int {
        let availableWidth = max(0, containerWidth - gridHorizontalPadding * 2)
        guard availableWidth > 0, tileSize > 0 else { return 1 }
        return max(1, Int((availableWidth + spacing) / (tileSize + spacing)))
    }

    private func gridTileWidth(
        containerWidth: CGFloat,
        tileSize: CGFloat,
        spacing: CGFloat,
    ) -> CGFloat {
        let availableWidth = max(0, containerWidth - gridHorizontalPadding * 2)
        guard availableWidth > 0, tileSize > 0 else { return tileSize }
        let count = gridColumnCount(
            containerWidth: containerWidth,
            tileSize: tileSize,
            spacing: spacing,
        )
        let totalSpacing = spacing * CGFloat(count - 1)
        return max(tileSize, (availableWidth - totalSpacing) / CGFloat(count))
    }
    #endif

    #if os(macOS)
    #endif

    var body: some View {
        GeometryReader { geometry in
            #if os(macOS)
            let shouldShowSidebar = isSidebarVisible && activeInfoItem != nil
            let usesTableLayout = layoutStyle == .table
            let availableWidth = geometry.size.width
            let detailWidth = sidebarWidth
            let contentWidth =
                shouldShowSidebar
                ? max(availableWidth - detailWidth, 0)
                : max(availableWidth, platformMinimumWidth)

            HStack(spacing: 0) {
                mainContent(
                    usesTableLayout: usesTableLayout,
                    contentWidth: max(contentWidth, minimumTileWidth),
                    height: geometry.size.height,
                )

                if shouldShowSidebar, let activeInfoItem {
                    MediaGridInfoSidebar(
                        item: activeInfoItem,
                        mediaKind: mediaKind,
                        onClose: { dismissSidebar() },
                        onReadNow: {
                            onReadNow(activeInfoItem)
                            dismissSidebar()
                        },
                        onRename: {
                            onRename(activeInfoItem)
                        },
                        onDelete: {
                            onDelete(activeInfoItem)
                            dismissSidebar()
                        },
                        onSeriesSelected: onSeriesSelected.map { handler in
                            { seriesName in
                                handler(seriesName)
                            }
                        },
                    )
                    .environment(
                        \.metadataLinkAction,
                        MetadataLinkAction(handler: onMetadataLinkClicked),
                    )
                    .frame(width: sidebarWidth)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: shouldShowSidebar)
            #else
            let contentWidth = max(geometry.size.width, platformMinimumWidth)
            scrollableContent(for: max(contentWidth, minimumTileWidth))
            #endif
        }
        .frame(minWidth: platformMinimumWidth)
        #if os(macOS)
        .ignoresSafeArea(.container, edges: .top)
        .focusable(true)
        .focusEffectDisabled(true)
        .onMoveCommand(perform: handleMoveCommand)
        .onKeyPress(.escape) {
            // Multi-selection clears before the sidebar so Escape peels state back in order.
            if !bulkSelection.isEmpty {
                bulkSelection.clear()
                return .handled
            }
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
        .onAppear {
            consumePendingInfoBookID()
        }
        .onChange(of: mediaViewModel.pendingInfoBookID) { _, _ in
            consumePendingInfoBookID()
        }
        .onChange(of: cachedDisplayItems) { _, _ in
            consumePendingInfoBookID()
        }
        #endif
        .sheet(isPresented: $showLocalFolderHelp) {
            LocalFolderSourceHelpView()
        }
        #if os(iOS)
        .sheet(isPresented: $showAddBook) {
            NavigationStack {
                UploadNewBookView(initialSourceID: addBookSourceID)
                .navigationTitle("Add Book")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") {
                            showAddBook = false
                        }
                    }
                }
            }
        }
        #endif
    }

    #if os(macOS)
    private func consumePendingInfoBookID() {
        guard let bookID = mediaViewModel.pendingInfoBookID,
            let book = mediaViewModel.library.bookMetaData.first(where: { $0.id == bookID })
        else { return }
        let displayable = cachedDisplayItems.contains { $0.id == bookID }
        guard displayable || isPendingInfoFallbackTarget else { return }
        mediaViewModel.pendingInfoBookID = nil
        openSidebar(for: book)
    }
    #endif

    #if os(macOS)
    @ViewBuilder
    private func mainContent(usesTableLayout: Bool, contentWidth: CGFloat, height: CGFloat)
        -> some View
    {
        if usesTableLayout {
            tableContent(for: contentWidth)
                .frame(width: contentWidth, height: height)
                .overlay(alignment: .bottom) { bulkSelectionBarOverlay }
        } else {
            ZStack(alignment: .top) {
                scrollableContent(for: contentWidth)
                stickyControlsOverlay
                    .opacity(showStickyControls ? 1 : 0)
                    .allowsHitTesting(showStickyControls)
                    .accessibilityHidden(!showStickyControls)
            }
            .frame(width: contentWidth, height: height)
        }
    }
    #endif

    @ViewBuilder
    private func scrollableContent(for contentWidth: CGFloat) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: true) {
                content(for: contentWidth)
            }
            #if os(macOS)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                geometry.contentOffset.y
            } action: { oldValue, newValue in
                let threshold: CGFloat = 60
                let shouldShow = newValue > threshold
                if shouldShow != showStickyControls {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showStickyControls = shouldShow
                    }
                }
            }
            #endif
            .frame(width: contentWidth)
            .scrollClipDisabled(true)
            .modifier(SoftScrollEdgeModifier())
            .contentShape(Rectangle())
            .onTapGesture {
                #if os(macOS)
                if cardTapInProgress {
                    cardTapInProgress = false
                    return
                }
                bulkSelection.clear()
                #endif
                activeInfoItem = nil
                dismissSidebar()
            }
            #if os(macOS)
            .contentMargins(.top, 52, for: .scrollContent)
            .contentMargins(.top, 52, for: .scrollIndicators)
            .contentMargins(.trailing, 6, for: .scrollIndicators)
            #endif
            #if os(iOS)
            .overlay(alignment: .trailing) {
                if shouldShowAlphabetScrubber {
                    AlphabetScrubber(
                        items: cachedDisplayItems,
                        textForItem: { item in
                            selectedSortOption.field == .author
                                ? (item.authors?.first?.name ?? item.title)
                                : item.title
                        },
                        idForItem: { $0.id },
                        proxy: proxy,
                    )
                    .padding(.top, 120)
                    .padding(.bottom, 40)
                }
            }
            #endif
        }
        .overlay(alignment: .bottom) { bulkSelectionBarOverlay }
    }

    @ViewBuilder
    private var bulkSelectionBarOverlay: some View {
        if showBulkSelectionBar {
            BulkSelectionBar(selection: bulkSelection, items: bulkSelectionItems)
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
        }
    }

    private var showBulkSelectionBar: Bool {
        #if os(iOS)
        return bulkSelection.isSelecting || !bulkSelection.isEmpty
        #else
        return !bulkSelection.isEmpty
        #endif
    }

    /// Select All and id-to-metadata resolution have to run over whatever order the
    /// current layout is actually showing.
    private var bulkSelectionItems: [BookMetadata] {
        #if os(macOS)
        return layoutStyle == .table ? tableSortedItems : cachedDisplayItems
        #else
        return cachedDisplayItems
        #endif
    }

    #if os(macOS)
    @ViewBuilder
    private func tableContent(for contentWidth: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            tableHeader
                .padding(.horizontal, gridHorizontalPadding)
                .padding(.leading, 8)
                .padding(.top, 52)

            if cachedDisplayItems.isEmpty {
                emptyStateView
                    .padding(.horizontal, gridHorizontalPadding)
                Spacer()
            } else {
                MediaTableView(
                    items: tableSortedItems,
                    coverPreference: coverPreference,
                    mediaViewModel: mediaViewModel,
                    tableContext: tableContext,
                    isDetailSidebarOpen: isSidebarVisible && activeInfoItem != nil,
                    columnResetToken: columnResetToken,
                    selection: Binding(
                        get: { activeInfoItem?.id },
                        set: { newID in
                            activeInfoItem = tableSortedItems.first { $0.id == newID }
                        },
                    ),
                    multiSelection: Binding(
                        get: { bulkSelection.selectedIDs },
                        set: { bulkSelection.selectedIDs = $0 },
                    ),
                    columnCustomization: $columnCustomization,
                    sortOrder: $tableSortOrder,
                    creatorSortRoleCode: $creatorSortRoleCode,
                    enabledCreatorRoles: enabledCreatorRoles,
                    onSelect: { selectItem($0) },
                    onInfo: { openSidebar(for: $0) },
                    onMetadataLinkClicked: onMetadataLinkClicked,
                    onEditMetadata: handleEditMetadata,
                    onQuickEdit: { bookId, field in
                        quickEditTarget = MetadataQuickEditTarget(bookId: bookId, field: field)
                    },
                    onManageServerMedia: { (bookId: BookID) in
                        openWindow(
                            id: "ServerMediaManagement",
                            value: ServerMediaManagementData(bookId: bookId),
                        )
                    },
                    onCreateLocalReadaloud: { data in
                        openWindow(id: "ReadaloudGenerator", value: data)
                    },
                    onCopyBook: { data in
                        openWindow(id: "CopyBook", value: data)
                    },
                )
                .padding(.top, 8)
            }
        }
        .onAppear {
            debugLog(
                "[PerfTrace][MediaGridView] tableContent onAppear title='\(title)' libraryVersion=\(mediaViewModel.libraryVersion) cached=\(cachedDisplayItems.count)"
            )
            recomputeAllCaches()
            updateTableSortedItems()
            handleInitialSelectionIfNeeded()
        }
        .onChange(of: mediaViewModel.libraryVersion) { _, _ in
            debugLog(
                "[PerfTrace][MediaGridView] tableContent libraryVersion changed version=\(mediaViewModel.libraryVersion) title='\(title)'"
            )
            recomputeAllCaches()
        }
        .onChange(of: tableSortOrder) { _, _ in
            updateTableSortedItems()
        }
        .onChange(of: cachedDisplayItems) { _, _ in
            updateTableSortedItems(forceResort: true)
            handleInitialSelectionIfNeeded()
        }
        .onChange(of: columnCustomization) { _, _ in
            saveColumnCustomization()
        }
        .onChange(of: enabledCreatorRoles) { _, _ in
            saveEnabledCreatorRoles()
        }
        .modifier(
            FilterChangeModifier(
                selectedFormatFilter: selectedFormatFilter,
                selectedTag: selectedTag,
                selectedSeries: selectedSeries,
                selectedStatus: selectedStatus,
                selectedProgress: selectedProgress,
                selectedLocation: selectedLocation,
                selectedSourceID: selectedSourceID,
                selectedNarrator: selectedNarrator,
                selectedAuthor: selectedAuthor,
                selectedTranslator: selectedTranslator,
                selectedPublicationYear: selectedPublicationYear,
                selectedRating: selectedRating,
                selectedSortOption: selectedSortOption,
                mediaKind: mediaKind,
                searchText: searchText,
                initialNarrationFilterOption: initialNarrationFilterOption,
                onFilterChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] tableContent filterChanged title='\(title)'"
                    )
                    recomputeDisplayItems()
                    reconcileSelectionAfterFiltering()
                },
                onMediaKindChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] tableContent mediaKindChanged title='\(title)'"
                    )
                    recomputeAllCaches()
                    reconcileSelectionAfterFiltering()
                },
                onSearchChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] tableContent searchChanged title='\(title)' searchCount=\(searchText.count)"
                    )
                    recomputeDisplayItems()
                },
                onNarrationFilterChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] tableContent narrationChanged title='\(title)'"
                    )
                    selectedFormatFilter =
                        MediaGridView.mapNarrationToFormatFilter(initialNarrationFilterOption)
                    recomputeDisplayItems()
                    reconcileSelectionAfterFiltering()
                },
            )
        )
        .sheet(item: $quickEditTarget) { target in
            MetadataQuickEditView(
                bookId: target.bookId,
                field: target.field,
                onClose: { quickEditTarget = nil },
            )
            .environment(mediaViewModel)
        }
    }

    private func updateTableSortedItems(forceResort: Bool = false) {
        let started = CFAbsoluteTimeGetCurrent()
        guard let comparator = tableSortOrder.first else {
            tableSortedItems = cachedDisplayItems
            lastSortKeyPath = nil
            return
        }

        let currentKeyPath = comparator.keyPath
        let sameKeyPath = currentKeyPath == lastSortKeyPath

        if sameKeyPath && !tableSortedItems.isEmpty && !forceResort {
            tableSortedItems = Array(tableSortedItems.reversed())
            let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
            debugLog(
                "[PerfTrace][MediaGridView] updateTableSortedItems reversed title='\(title)' count=\(cachedDisplayItems.count) elapsedMs=\(String(format: "%.1f", elapsed))"
            )
        } else {
            let items = cachedDisplayItems
            let roleCode = creatorSortRoleCode
            let ascending = comparator.order == .forward
            let title = title
            tableSortTask?.cancel()
            tableSortTask = Task.detached(priority: .userInitiated) {
                let sorted: [BookMetadata]
                if let roleCode {
                    sorted = items.sorted { a, b in
                        let aVal = a.sortableCreator(role: roleCode)
                        let bVal = b.sortableCreator(role: roleCode)
                        return ascending
                            ? aVal.localizedCaseInsensitiveCompare(bVal) == .orderedAscending
                            : aVal.localizedCaseInsensitiveCompare(bVal) == .orderedDescending
                    }
                } else {
                    sorted = items.sorted(using: comparator)
                }
                let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
                await MainActor.run {
                    guard !Task.isCancelled else { return }
                    tableSortedItems = sorted
                    debugLog(
                        "[PerfTrace][MediaGridView] updateTableSortedItems title='\(title)' force=\(forceResort) count=\(items.count) elapsedMs=\(String(format: "%.1f", elapsed))"
                    )
                }
            }
        }
        lastSortKeyPath = currentKeyPath
    }

    private var hasActiveFilters: Bool {
        hasContextFilters
            || selectedFormatFilter != .all
            || selectedTag != nil
            || selectedSeries != nil
            || selectedAuthor != nil
            || selectedNarrator != nil
            || selectedTranslator != nil
            || selectedPublicationYear != nil
            || selectedRating != nil
            || selectedStatus != nil
            || selectedProgress != nil
            || selectedLocation != .all
            || selectedSourceID != nil
    }

    private var hasContextFilters: Bool {
        contextFilters.tag != nil
            || contextFilters.series != nil
            || contextFilters.collection != nil
            || contextFilters.author != nil
            || contextFilters.narrator != nil
            || contextFilters.translator != nil
            || contextFilters.publicationYear != nil
            || contextFilters.rating != nil
            || contextFilters.status != nil
            || contextFilters.location != nil
            || contextFilters.sourceID != nil
    }

    private var tableHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(title)
                    .font(.storytellerTitle(size: headerFontSize))
                if hasActiveFilters {
                    Text("\(cachedDisplayItems.count) books")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            MediaGridSortAndFilterBar(
                selectedSortOption: selectedSortOptionBinding,
                selectedFormatFilter: $selectedFormatFilter,
                selectedTag: $selectedTag,
                selectedSeries: $selectedSeries,
                selectedAuthor: $selectedAuthor,
                selectedNarrator: $selectedNarrator,
                selectedTranslator: $selectedTranslator,
                selectedPublicationYear: $selectedPublicationYear,
                selectedRating: $selectedRating,
                selectedStatus: $selectedStatus,
                selectedProgress: $selectedProgress,
                selectedLocation: $selectedLocation,
                selectedSourceID: $selectedSourceID,
                contextFilters: contextFilters,
                layoutStyle: Binding(
                    get: { layoutStyle },
                    set: { layoutStyleRaw = $0.rawValue },
                ),
                coverPrefRaw: $coverPrefRaw,
                coverSize: $coverSizeValue,
                gridSpacingRaw: $gridSpacingRaw,
                showAudioIndicator: $showAudioIndicator,
                showSourceBadge: $showSourceBadge,
                showSeriesPositionBadge: $showSeriesPositionBadge,
                progressStyleRaw: $progressStyleRaw,
                showOnItemRaw: $showOnItemRaw,
                availableTags: cachedAvailableTags,
                availableSeries: cachedAvailableSeries,
                availableAuthors: cachedAvailableAuthors,
                availableNarrators: cachedAvailableNarrators,
                availableTranslators: cachedAvailableTranslators,
                availablePublicationYears: cachedAvailablePublicationYears,
                availableRatings: cachedAvailableRatings,
                availableStatuses: cachedAvailableStatuses,
                availableSources: mediaViewModel.bookSources,
                filtersSummaryText: cachedFiltersSummary,
                showLayoutOption: true,
                showSortOption: false,
                onAddBook: addBookAction,
                columnCustomization: $columnCustomization,
                availableCreatorRoles: cachedAvailableCreatorRoles,
                enabledCreatorRoles: $enabledCreatorRoles,
                onResetColumns: {
                    columnCustomization = TableColumnCustomization<BookMetadata>()
                    UserDefaults.standard.removeObject(forKey: Self.columnCustomizationKey)
                    enabledCreatorRoles = []
                    MediaTableView.resetColumnDefaults(tableContext: tableContext)
                    columnResetToken += 1
                },
            )
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Text("No media is available here yet!")
                .font(.title)
                .foregroundStyle(.secondary)
            Text(emptyStateMessage)
                .font(.body)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
            if sourceFilterKind == .localFolder {
                Button {
                    showLocalFolderHelp = true
                } label: {
                    Label("Folder Layouts", systemImage: "questionmark.circle")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.blue)
            }
        }
        .frame(maxWidth: 500)
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.top, 60)
    }
    #endif

    private var contentFilterBar: some View {
        MediaGridSortAndFilterBar(
            selectedSortOption: selectedSortOptionBinding,
            selectedFormatFilter: $selectedFormatFilter,
            selectedTag: $selectedTag,
            selectedSeries: $selectedSeries,
            selectedAuthor: $selectedAuthor,
            selectedNarrator: $selectedNarrator,
            selectedTranslator: $selectedTranslator,
            selectedPublicationYear: $selectedPublicationYear,
            selectedRating: $selectedRating,
            selectedStatus: $selectedStatus,
            selectedProgress: $selectedProgress,
            selectedLocation: $selectedLocation,
            selectedSourceID: $selectedSourceID,
            contextFilters: contextFilters,
            layoutStyle: Binding(
                get: { layoutStyle },
                set: { layoutStyleRaw = $0.rawValue },
            ),
            coverPrefRaw: $coverPrefRaw,
            coverSize: $coverSizeValue,
            gridSpacingRaw: $gridSpacingRaw,
            showAudioIndicator: $showAudioIndicator,
            showSourceBadge: $showSourceBadge,
            showSeriesPositionBadge: $showSeriesPositionBadge,
            progressStyleRaw: $progressStyleRaw,
            showOnItemRaw: $showOnItemRaw,
            availableTags: cachedAvailableTags,
            availableSeries: cachedAvailableSeries,
            availableAuthors: cachedAvailableAuthors,
            availableNarrators: cachedAvailableNarrators,
            availableTranslators: cachedAvailableTranslators,
            availablePublicationYears: cachedAvailablePublicationYears,
            availableRatings: cachedAvailableRatings,
            availableStatuses: cachedAvailableStatuses,
            availableSources: mediaViewModel.bookSources,
            filtersSummaryText: cachedFiltersSummary,
            showLayoutOption: true,
            onAddBook: addBookAction,
            isSelectModeActive: bulkSelection.isSelecting,
            onToggleSelectMode: layoutStyle == .table
                ? nil
                : {
                    if bulkSelection.isSelecting {
                        bulkSelection.clear()
                    } else {
                        bulkSelection.isSelecting = true
                    }
                },
        )
    }

    private var addBookAction: (() -> Void)? {
        #if os(macOS)
        guard showAddBookButton else {
            return nil
        }
        return {
            openWindow(id: "UploadNewBook", value: UploadNewBookData(sourceID: addBookSourceID))
        }
        #else
        guard showAddBookButton else {
            return nil
        }
        return {
            showAddBook = true
        }
        #endif
    }

    #if os(macOS)
    private var stickyControlsOverlay: some View {
        ZStack(alignment: .topLeading) {
            if !libraryNavigationSidebarVisible {
                stickyTrafficLightBackground
                    .frame(width: 124, height: 52)
                    .allowsHitTesting(false)
            }

            contentFilterBar
                .padding(.horizontal, gridHorizontalPadding)
                .padding(.leading, 8)
                .padding(.top, 8)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(stickyControlsBackground)
                .padding(.leading, libraryNavigationSidebarVisible ? 0 : 280)
        }
    }

    @ViewBuilder
    private var stickyTrafficLightBackground: some View {
        let edgeMask = LinearGradient(
            stops: [
                .init(color: .white, location: 0),
                .init(color: .white, location: 0.62),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing,
        )
        let bottomMask = LinearGradient(
            stops: [
                .init(color: .white, location: 0),
                .init(color: .white, location: 0.7),
                .init(color: .clear, location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom,
        )

        if #available(macOS 26.0, *) {
            Rectangle()
                .fill(Color.clear)
                .glassEffect(.regular, in: Rectangle())
                .mask(edgeMask)
                .mask(bottomMask)
                .background(
                    LinearGradient(
                        colors: colorScheme == .dark
                            ? [.black.opacity(0.62), .black.opacity(0)]
                            : [.white.opacity(0.55), .white.opacity(0)],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
                    .mask(edgeMask)
                    .mask(bottomMask)
                )
        } else {
            Color(nsColor: .windowBackgroundColor)
                .mask(edgeMask)
                .mask(bottomMask)
        }
    }

    @ViewBuilder
    private var stickyControlsBackground: some View {
        if #available(macOS 26.0, *) {
            Rectangle()
                .fill(Color.clear)
                .glassEffect(.regular.interactive(), in: Rectangle())
                .mask(
                    HStack(spacing: 0) {
                        LinearGradient(
                            stops: [
                                .init(color: .clear, location: 0),
                                .init(color: .clear, location: 0.4),
                                .init(color: .white, location: 1),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing,
                        )
                        .frame(width: 20)
                        Rectangle().fill(Color.white)
                    }
                )
                .mask(
                    LinearGradient(
                        stops: [
                            .init(color: .white, location: 0),
                            .init(color: .white, location: 0.75),
                            .init(color: .white.opacity(0), location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
                )
                .background(
                    LinearGradient(
                        stops: [
                            .init(
                                color: colorScheme == .dark
                                    ? .black.opacity(0.75) : .white.opacity(0.5),
                                location: 0,
                            ),
                            .init(
                                color: colorScheme == .dark
                                    ? .black.opacity(0.5) : .white.opacity(0.25),
                                location: 0.5,
                            ),
                            .init(
                                color: colorScheme == .dark
                                    ? .black.opacity(0) : .white.opacity(0),
                                location: 1,
                            ),
                        ],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
                    .mask(
                        HStack(spacing: 0) {
                            LinearGradient(
                                stops: [
                                    .init(color: .clear, location: 0),
                                    .init(color: .white, location: 1),
                                ],
                                startPoint: .leading,
                                endPoint: .trailing,
                            )
                            .frame(width: 20)
                            Rectangle().fill(Color.white)
                        }
                    )
                )
        } else {
            LinearGradient(
                stops: [
                    .init(color: Color(nsColor: .windowBackgroundColor), location: 0),
                    .init(color: Color(nsColor: .windowBackgroundColor), location: 0.75),
                    .init(color: Color(nsColor: .windowBackgroundColor).opacity(0), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom,
            )
        }
    }
    #endif

    @ViewBuilder
    private func content(for containerWidth: CGFloat) -> some View {
        let layout = resolvedLayout(for: containerWidth)
        let tileMetrics = MediaItemCardMetrics.make(
            for: layout.tileWidth,
            mediaKind: mediaKind,
            coverPreference: coverPreference,
            secondaryLineCount: ShowOnItemField.secondaryLineCount(showOnItem),
        )
        let columnCount = max(layout.columns.count, 1)

        VStack(alignment: .leading, spacing: verticalSpacing) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.storytellerTitle(size: headerFontSize))

                contentFilterBar
            }
            .padding(.horizontal, gridHorizontalPadding)
            .padding(.leading, 8)

            if cachedDisplayItems.isEmpty {
                VStack(spacing: 12) {
                    Text("No media is available here yet!")
                        .font(.title)
                        .foregroundStyle(.secondary)
                    #if os(iOS)
                    Text("To add some media, go to Settings to connect a Storyteller server.")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                    #else
                    Text(emptyStateMessage)
                        .font(.body)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                    #endif
                    if sourceFilterKind == .localFolder {
                        Button {
                            showLocalFolderHelp = true
                        } label: {
                            Label("Folder Layouts", systemImage: "questionmark.circle")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.blue)
                    }
                }
                .frame(maxWidth: 500)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 60)
                .padding(.horizontal, gridHorizontalPadding)
            } else {
                switch layoutStyle {
                    case .grid, .fan:
                        #if os(iOS)
                        let isPhoneSmall =
                            UIDevice.current.userInterfaceIdiom == .phone && coverSize < 90
                        let gridTileSize = isPhoneSmall ? 75.0 : coverSize
                        let gridMaxSize = isPhoneSmall ? 85.0 : gridTileSize + 40
                        let gridRowSpacing: CGFloat = 0
                        #else
                        let gridTileSize = coverSize
                        let gridRowSpacing = gridGap
                        #endif
                        #if os(macOS)
                        let gridColumns = fixedGridColumns(
                            containerWidth: containerWidth,
                            tileSize: gridTileSize,
                            spacing: gridGap,
                        )
                        // Cards fill the flexed column, not the minimum it was solved against.
                        let gridCardWidth = gridTileWidth(
                            containerWidth: containerWidth,
                            tileSize: gridTileSize,
                            spacing: gridGap,
                        )
                        #else
                        let gridColumns = [
                            GridItem(
                                .adaptive(minimum: gridTileSize, maximum: gridMaxSize),
                                spacing: 0,
                            )
                        ]
                        let gridCardWidth = gridTileSize
                        #endif
                        let gridMetrics = MediaItemCardMetrics.make(
                            for: gridCardWidth,
                            mediaKind: mediaKind,
                            coverPreference: coverPreference,
                            secondaryLineCount: ShowOnItemField.secondaryLineCount(showOnItem),
                        )
                        #if os(iOS)
                        let gridAlignment: HorizontalAlignment = .center
                        #else
                        let gridAlignment: HorizontalAlignment = .leading
                        #endif
                        LazyVGrid(
                            columns: gridColumns,
                            alignment: gridAlignment,
                            spacing: gridRowSpacing,
                        ) {
                            ForEach(cachedDisplayItems) { item in
                                card(for: item, metrics: gridMetrics)
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, gridHorizontalPadding)
                    case .compactGrid:
                        #if os(iOS)
                        let isCompactPhoneSmall =
                            UIDevice.current.userInterfaceIdiom == .phone && coverSize < 90
                        let compactTileSize = isCompactPhoneSmall ? 80.0 : coverSize
                        let compactMaxSize = isCompactPhoneSmall ? 90.0 : compactTileSize + 20
                        let compactGap: CGFloat = 4
                        let compactCardWidth = compactTileSize
                        #else
                        let compactTileSize = coverSize
                        let compactGap = gridGap
                        #endif
                        #if os(macOS)
                        let compactColumns = fixedGridColumns(
                            containerWidth: containerWidth,
                            tileSize: compactTileSize,
                            spacing: compactGap,
                        )
                        let compactCardWidth = gridTileWidth(
                            containerWidth: containerWidth,
                            tileSize: compactTileSize,
                            spacing: compactGap,
                        )
                        #else
                        let compactColumns = [
                            GridItem(
                                .adaptive(minimum: compactTileSize, maximum: compactMaxSize),
                                spacing: compactGap,
                            )
                        ]
                        #endif
                        #if os(iOS)
                        let compactGridAlignment: HorizontalAlignment = .center
                        #else
                        let compactGridAlignment: HorizontalAlignment = .leading
                        #endif
                        LazyVGrid(
                            columns: compactColumns,
                            alignment: compactGridAlignment,
                            spacing: compactGap,
                        ) {
                            ForEach(cachedDisplayItems) { item in
                                MediaCompactCardView(
                                    item: item,
                                    mediaKind: mediaKind,
                                    coverPreference: coverPreference,
                                    tileSize: compactCardWidth,
                                    showAudioIndicator: showAudioIndicator,
                                    sourceLabel: showSourceBadge
                                        ? item.source : nil,
                                    seriesPositionBadge: seriesPositionBadge(for: item),
                                    progressStyle: progressStyle,
                                    isSelected: activeInfoItem?.id == item.id,
                                    onSelect: { selected in
                                        handleGridTap(selected)
                                    },
                                    onInfo: { selected in
                                        openSidebar(for: selected)
                                    },
                                    onEditMetadata: editMetadataHandler,
                                    isBulkSelected: bulkSelection.contains(item.id),
                                    isBulkSelectionMode: bulkSelection.isSelecting,
                                    onToggleBulkSelection: { selected in
                                        bulkSelection.toggle(selected.id)
                                    },
                                )
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, gridHorizontalPadding)
                    case .table:
                        LazyVStack(alignment: .leading, spacing: 1) {
                            ForEach(cachedDisplayItems) { item in
                                MediaTableRowView(
                                    item: item,
                                    mediaKind: mediaKind,
                                    coverPreference: coverPreference,
                                    seriesPositionBadge: seriesPositionBadge(for: item),
                                    isSelected: activeInfoItem?.id == item.id,
                                    onSelect: { selected in
                                        selectItem(selected)
                                    },
                                    onInfo: { selected in
                                        openSidebar(for: selected)
                                    },
                                    onEditMetadata: editMetadataHandler,
                                )
                            }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, gridHorizontalPadding)
                }
            }
        }
        .padding(.vertical)
        .onAppear {
            debugLog(
                "[PerfTrace][MediaGridView] gridContent onAppear title='\(title)' libraryVersion=\(mediaViewModel.libraryVersion) cached=\(cachedDisplayItems.count) columns=\(columnCount)"
            )
            lastKnownColumnCount = columnCount
            recomputeAllCaches()
            handleInitialSelectionIfNeeded()
        }
        .onChange(of: cachedDisplayItems) { _, _ in
            handleInitialSelectionIfNeeded()
            bulkSelection.reconcile(with: cachedDisplayItems)
        }
        .onChange(of: columnCount) { oldValue, newValue in
            lastKnownColumnCount = newValue
        }
        .onChange(of: mediaViewModel.libraryVersion) { _, _ in
            debugLog(
                "[PerfTrace][MediaGridView] gridContent libraryVersion changed version=\(mediaViewModel.libraryVersion) title='\(title)'"
            )
            recomputeAllCaches()
        }
        .modifier(
            FilterChangeModifier(
                selectedFormatFilter: selectedFormatFilter,
                selectedTag: selectedTag,
                selectedSeries: selectedSeries,
                selectedStatus: selectedStatus,
                selectedProgress: selectedProgress,
                selectedLocation: selectedLocation,
                selectedSourceID: selectedSourceID,
                selectedNarrator: selectedNarrator,
                selectedAuthor: selectedAuthor,
                selectedTranslator: selectedTranslator,
                selectedPublicationYear: selectedPublicationYear,
                selectedRating: selectedRating,
                selectedSortOption: selectedSortOption,
                mediaKind: mediaKind,
                searchText: searchText,
                initialNarrationFilterOption: initialNarrationFilterOption,
                onFilterChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] gridContent filterChanged title='\(title)'"
                    )
                    recomputeDisplayItems()
                    reconcileSelectionAfterFiltering()
                },
                onMediaKindChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] gridContent mediaKindChanged title='\(title)'"
                    )
                    recomputeAllCaches()
                    reconcileSelectionAfterFiltering()
                },
                onSearchChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] gridContent searchChanged title='\(title)' searchCount=\(searchText.count)"
                    )
                    recomputeDisplayItems()
                },
                onNarrationFilterChanged: {
                    debugLog(
                        "[PerfTrace][MediaGridView] gridContent narrationChanged title='\(title)'"
                    )
                    selectedFormatFilter =
                        MediaGridView.mapNarrationToFormatFilter(initialNarrationFilterOption)
                    recomputeDisplayItems()
                    reconcileSelectionAfterFiltering()
                },
            )
        )
    }

    static func mapNarrationToFormatFilter(_ narration: NarrationFilter) -> FormatFilterOption {
        switch narration {
            case .both: .all
            case .withAudio: .audiobook
            case .withoutAudio: .ebookOnly
        }
    }

    @ViewBuilder
    private func card(for item: BookMetadata, metrics: MediaItemCardMetrics) -> some View {
        let sourceLabel = showSourceBadge ? item.source : nil
        let seriesPositionBadge = seriesPositionBadge(for: item)
        #if os(macOS)
        MediaItemCardView(
            item: item,
            mediaKind: mediaKind,
            metrics: metrics,
            isSelected: activeInfoItem?.id == item.id,
            showAudioIndicator: showAudioIndicator,
            sourceLabel: sourceLabel,
            seriesPositionBadge: seriesPositionBadge,
            coverPreference: coverPreference,
            progressStyle: progressStyle,
            sortOption: selectedSortOption,
            showOnItem: showOnItem,
            onSelect: { selected in
                handleGridTap(selected)
            },
            onInfo: { selected in
                openSidebar(for: selected)
            },
            onEditMetadata: handleEditMetadata,
            isBulkSelected: bulkSelection.contains(item.id),
            isBulkSelectionMode: bulkSelection.isSelecting,
            onToggleBulkSelection: { selected in
                bulkSelection.toggle(selected.id)
            },
        )
        #else
        MediaItemCardView(
            item: item,
            mediaKind: mediaKind,
            metrics: metrics,
            isSelected: activeInfoItem?.id == item.id,
            showAudioIndicator: showAudioIndicator,
            sourceLabel: sourceLabel,
            seriesPositionBadge: seriesPositionBadge,
            coverPreference: coverPreference,
            progressStyle: progressStyle,
            sortOption: selectedSortOption,
            showOnItem: showOnItem,
            onSelect: { selected in
                handleGridTap(selected)
            },
            onInfo: { selected in
                openSidebar(for: selected)
            },
            isBulkSelected: bulkSelection.contains(item.id),
            isBulkSelectionMode: bulkSelection.isSelecting,
            onToggleBulkSelection: { selected in
                bulkSelection.toggle(selected.id)
            },
        )
        #endif
    }

    /// Grid tap entry point layered over `selectItem`. On macOS, Cmd-click toggles the
    /// card in the multi-selection and Shift-click extends a range over the current
    /// visual order; an unmodified click leaves multi-selection entirely and returns the
    /// grid to single-select behavior.
    private func handleGridTap(_ item: BookMetadata) {
        #if os(macOS)
        let flags = NSApp.currentEvent?.modifierFlags ?? []
        if flags.contains(.shift) || flags.contains(.command) {
            cardTapInProgress = true
            bulkSelection.seedIfEmpty(with: activeInfoItem?.id)
            if flags.contains(.shift) {
                bulkSelection.extendRange(to: item.id, in: cachedDisplayItems)
            } else {
                bulkSelection.toggle(item.id)
            }
            activeInfoItem = item
            return
        }
        bulkSelection.clear()
        selectItem(item)
        #else
        if bulkSelection.isSelecting {
            bulkSelection.toggle(item.id)
        } else {
            selectItem(item)
        }
        #endif
    }

    private func seriesPositionBadge(for item: BookMetadata) -> String? {
        guard showSeriesPositionBadge else { return nil }
        guard let seriesList = item.series else { return nil }

        let matchingSeries: BookSeries?
        if let filter = selectedSeries {
            let normalizedFilter = filter.lowercased()
            matchingSeries = seriesList.first(where: { $0.name.lowercased() == normalizedFilter })
        } else {
            matchingSeries = seriesList.first
        }

        guard let series = matchingSeries, let formatted = series.formattedPosition else {
            return nil
        }
        return "#\(formatted)"
    }

    private func selectItem(_ item: BookMetadata, ensureVisible: Bool = false) {
        #if os(macOS)
        cardTapInProgress = true
        #endif
        guard cachedDisplayItems.contains(where: { $0.id == item.id }) else { return }
        shouldEnsureActiveItemVisible = ensureVisible
        activeInfoItem = item
    }

    private var editMetadataHandler: (([BookID]) -> Void)? {
        #if os(macOS)
        return handleEditMetadata
        #else
        return nil
        #endif
    }

    #if os(macOS)
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

    private func openSidebar(for item: BookMetadata) {
        activeInfoItem = item
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

    private func dismissSidebar() {
        #if os(macOS)
        isSidebarVisible = false
        #else
        withAnimation(.easeInOut(duration: 0.2)) {
            isSidebarVisible = false
        }
        #endif
    }

    #if os(iOS)
    private var shouldShowAlphabetScrubber: Bool {
        let isAlphabeticalSort =
            selectedSortOption.field == .title || selectedSortOption.field == .author
        return isAlphabeticalSort
    }
    #endif

    private func reconcileSelectionAfterFiltering() {
        guard let activeInfoItem else { return }
        if !cachedDisplayItems.contains(where: { $0.id == activeInfoItem.id }) {
            clearSelection()
        }
    }

    private func handleInitialSelectionIfNeeded() {
        guard !hasHandledInitialSelection,
            let initialItem = initialSelectedItem,
            cachedDisplayItems.contains(where: { $0.id == initialItem.id })
        else {
            return
        }
        hasHandledInitialSelection = true
        openSidebar(for: initialItem)
    }

    private func clearSelection() {
        activeInfoItem = nil
        isSidebarVisible = false
    }

    private func recomputeDisplayItems() {
        let started = CFAbsoluteTimeGetCurrent()
        debugLog(
            "[PerfTrace][MediaGridView] recomputeDisplayItems start title='\(title)' libraryVersion=\(mediaViewModel.libraryVersion) layout=\(layoutStyle.rawValue)"
        )
        requestRenderSnapshot(includeFilterOptions: false, started: started)
    }

    private func recomputeAllCaches() {
        let started = CFAbsoluteTimeGetCurrent()
        debugLog(
            "[PerfTrace][MediaGridView] recomputeAllCaches start title='\(title)' libraryVersion=\(mediaViewModel.libraryVersion)"
        )
        requestRenderSnapshot(includeFilterOptions: true, started: started)
    }

    private func requestRenderSnapshot(includeFilterOptions: Bool, started: CFAbsoluteTime) {
        renderRequestGeneration += 1
        let generation = renderRequestGeneration
        let request = MediaGridRenderRequest(
            mediaKind: mediaKind,
            contextFilters: contextFilters,
            selectedFormatFilter: selectedFormatFilter,
            selectedTag: selectedTag,
            selectedSeries: selectedSeries,
            selectedCollection: selectedCollection,
            selectedAuthor: selectedAuthor,
            selectedNarrator: selectedNarrator,
            selectedTranslator: selectedTranslator,
            selectedPublicationYear: selectedPublicationYear,
            selectedRating: selectedRating,
            selectedStatus: selectedStatus,
            selectedProgress: selectedProgress,
            selectedLocation: selectedLocation,
            selectedSourceID: selectedSourceID,
            selectedSourceName: sourceName(for: selectedSourceID),
            searchText: searchText,
            sortOption: selectedSortOption,
            filteredItems: filteredItems,
            includeFilterOptions: includeFilterOptions,
        )
        let title = title
        renderSnapshotTask?.cancel()
        renderSnapshotTask = Task { @MainActor in
            let snapshot = await mediaViewModel.mediaGridSnapshot(for: request)
            guard !Task.isCancelled, generation == renderRequestGeneration else { return }
            cachedDisplayItems = snapshot.displayItems
            cachedFiltersSummary = snapshot.filtersSummary
            if includeFilterOptions {
                cachedAvailableTags = snapshot.availableTags
                cachedAvailableSeries = snapshot.availableSeries
                cachedAvailableAuthors = snapshot.availableAuthors
                cachedAvailableNarrators = snapshot.availableNarrators
                cachedAvailableTranslators = snapshot.availableTranslators
                cachedAvailablePublicationYears = snapshot.availablePublicationYears
                cachedAvailableRatings = snapshot.availableRatings
                cachedAvailableStatuses = snapshot.availableStatuses
                cachedAvailableCreatorRoles = snapshot.availableCreatorRoles
                lastCachedLibraryVersion = mediaViewModel.libraryVersion
            }
            let elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000
            debugLog(
                "[PerfTrace][MediaGridView] renderSnapshot title='\(title)' display=\(snapshot.displayItems.count) filters=\(includeFilterOptions) elapsedMs=\(String(format: "%.1f", elapsed))"
            )
        }
    }

    private func sourceName(for sourceID: BookSourceID?) -> String? {
        guard let sourceID else { return nil }
        return mediaViewModel.bookSources.first(where: { $0.id == sourceID })?.name
    }

    #if os(macOS)
    private func handleMoveCommand(_ direction: MoveCommandDirection) {
        let visibleItems = cachedDisplayItems
        guard !visibleItems.isEmpty else {
            clearSelection()
            return
        }

        guard
            let nextItem = MediaGridViewUtilities.nextSelectableItem(
                from: direction,
                in: visibleItems,
                currentItemID: activeInfoItem?.id,
                columnCount: max(lastKnownColumnCount, 1),
            )
        else {
            return
        }
        selectItem(nextItem, ensureVisible: true)
    }
    #endif

}

private struct FilterChangeModifier: ViewModifier {
    let selectedFormatFilter: MediaGridView.FormatFilterOption
    let selectedTag: String?
    let selectedSeries: String?
    let selectedStatus: String?
    let selectedProgress: ProgressCondition?
    let selectedLocation: MediaGridView.LocationFilterOption
    let selectedSourceID: BookSourceID?
    let selectedNarrator: String?
    let selectedAuthor: String?
    let selectedTranslator: String?
    let selectedPublicationYear: String?
    let selectedRating: String?
    let selectedSortOption: MediaGridView.SortOption
    let mediaKind: MediaKind
    let searchText: String
    let initialNarrationFilterOption: NarrationFilter
    let onFilterChanged: () -> Void
    let onMediaKindChanged: () -> Void
    let onSearchChanged: () -> Void
    let onNarrationFilterChanged: () -> Void

    func body(content: Content) -> some View {
        content
            .onChange(of: selectedFormatFilter) { _, _ in onFilterChanged() }
            .onChange(of: selectedTag) { _, _ in onFilterChanged() }
            .onChange(of: selectedSeries) { _, _ in onFilterChanged() }
            .onChange(of: selectedStatus) { _, _ in onFilterChanged() }
            .onChange(of: selectedProgress) { _, _ in onFilterChanged() }
            .onChange(of: selectedLocation) { _, _ in onFilterChanged() }
            .onChange(of: selectedSourceID) { _, _ in onFilterChanged() }
            .onChange(of: selectedNarrator) { _, _ in onFilterChanged() }
            .onChange(of: selectedAuthor) { _, _ in onFilterChanged() }
            .onChange(of: selectedTranslator) { _, _ in onFilterChanged() }
            .onChange(of: selectedPublicationYear) { _, _ in onFilterChanged() }
            .onChange(of: selectedRating) { _, _ in onFilterChanged() }
            .onChange(of: selectedSortOption) { _, _ in onFilterChanged() }
            .onChange(of: mediaKind) { _, _ in onMediaKindChanged() }
            .onChange(of: searchText) { _, _ in onSearchChanged() }
            .onChange(of: initialNarrationFilterOption) { _, _ in onNarrationFilterChanged() }
    }
}

#Preview("Ebooks") {
    MediaGridView(title: "Preview Library", mediaKind: .ebook)
}

#Preview("Audiobooks") {
    MediaGridView(
        title: "Preview Audiobooks",
        mediaKind: .audiobook,
        preferredTileWidth: 200,
        minimumTileWidth: 160,
    )
}

#endif
