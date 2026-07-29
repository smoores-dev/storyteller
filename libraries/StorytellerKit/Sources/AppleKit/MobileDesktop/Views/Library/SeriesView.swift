#if os(iOS) || os(macOS)
import SwiftUI

struct SeriesView: View {
    let mediaKind: MediaKind
    #if os(iOS)
    @Binding var searchText: String
    #else
    let searchText: String
    #endif
    @Binding var sidebarSections: [SidebarSectionDescription]
    @Binding var selectedSidebarItem: SidebarItemDescription?
    @Binding var showSettings: Bool
    #if os(iOS)
    var showOfflineSheet: Binding<Bool>?
    #endif
    #if os(macOS)
    var onEditMetadata: (([BookID]) -> Void)? = nil
    #endif
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var navigationPath = NavigationPath()
    @AppStorage("viewLayout.series") private var layoutStyleRaw: String = CategoryLayoutStyle.fan
        .rawValue
    @AppStorage("coverPref.series") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble
        .rawValue
    @AppStorage("series.showBookCountBadge") private var showBookCountBadge: Bool = true

    #if os(macOS)
    @State private var selectedGroupId: String? = nil
    @State private var listWidth: CGFloat = CategoryListSidebarDefaults.width
    @State private var sortByCount = false
    #endif

    private var layoutStyle: CategoryLayoutStyle {
        CategoryLayoutStyle(rawValue: layoutStyleRaw) ?? .fan
    }
    private var coverPreference: CoverPreference {
        CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook
    }

    static let noSeriesFilterKey = BookMetadata.noSeriesSentinel

    #if os(iOS)
    private var hasConnectionError: Bool {
        if mediaViewModel.lastNetworkOpSucceeded == false { return true }
        if case .error = mediaViewModel.connectionStatus { return true }
        return false
    }
    private var connectionErrorIcon: String {
        if case .error = mediaViewModel.connectionStatus { return "exclamationmark.triangle" }
        return "wifi.slash"
    }
    #endif

    private var categoryGroups: [CategoryGroup] {
        let groups = mediaViewModel.booksBySeries(for: mediaKind)
        let filtered = filterGroups(groups)
        return filtered.map { group in
            let name = group.series?.name ?? "No Series"
            let id = group.series?.name ?? Self.noSeriesFilterKey
            return CategoryGroup(
                id: id,
                name: name,
                books: group.books,
                pinId: group.series?.name != nil ? SidebarPinHelper.pinId(forSeries: name) : nil,
            )
        }
    }

    private func filterGroups(_ groups: [(series: BookSeries?, books: [BookMetadata])]) -> [(
        series: BookSeries?, books: [BookMetadata]
    )] {
        guard !searchText.isEmpty else { return groups }
        let searchLower = searchText.lowercased()
        return groups.compactMap { group in
            let nameMatches = group.series?.name.lowercased().contains(searchLower) ?? false
            let filteredBooks = group.books.filter {
                $0.title.lowercased().contains(searchLower)
                    || $0.authors?.contains(where: {
                        $0.name?.lowercased().contains(searchLower) ?? false
                    }) ?? false
            }
            if nameMatches { return group }
            guard !filteredBooks.isEmpty else { return nil }
            return (series: group.series, books: filteredBooks)
        }
    }

    var body: some View {
        #if os(macOS)
        macOSBody
        #else
        iOSBody
        #endif
    }

    private func handleNavigation(_ group: CategoryGroup, _ book: BookMetadata?) {
        navigationPath.append(
            SeriesDetailNavigation(seriesName: group.id, initialSelectedBook: book)
        )
    }
}

#if os(iOS)
extension SeriesView {
    private var iOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list: listContent
                    case .fan, .grid: fanGridContent
                }
            }
            .navigationTitle("Series").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        if hasConnectionError, let showOfflineSheet {
                            Button {
                                showOfflineSheet.wrappedValue = true
                            } label: {
                                Image(systemName: connectionErrorIcon).foregroundStyle(.red)
                            }
                        }
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
            .navigationDestination(for: SeriesDetailNavigation.self) { nav in
                seriesDetailView(for: nav.seriesName, initialSelectedItem: nav.initialSelectedBook)
                    .iOSLibraryToolbar(
                        showSettings: $showSettings,
                        showOfflineSheet: showOfflineSheet ?? .constant(false),
                    )
            }
            .navigationDestination(for: BookMetadata.self) { item in
                iOSBookDetailView(item: item, mediaKind: mediaKind).iOSLibraryToolbar(
                    showSettings: $showSettings,
                    showOfflineSheet: showOfflineSheet ?? .constant(false),
                )
            }
        }.environment(\.mediaNavigationPath, $navigationPath)
    }

    private var listContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                headerView.padding(.horizontal).padding(.bottom, 16)
                LazyVStack(spacing: 0) {
                    ForEach(categoryGroups) { group in
                        Button {
                            handleNavigation(group, nil)
                        } label: {
                            CategoryRowContent(
                                iconName: "books.vertical.fill",
                                name: group.name,
                                bookCount: group.books.count,
                                isSelected: false,
                            ).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                        Divider().padding(.leading, 48)
                    }
                }
            }.padding(.top, 8)
        }
    }

    @ViewBuilder
    private var fanGridContent: some View {
        if layoutStyle == .fan {
            CategoryFanLayout(
                groups: categoryGroups,
                mediaKind: mediaKind,
                coverPreference: coverPreference,
                onNavigate: handleNavigation,
            ) { headerView }
        } else {
            CategoryGridLayout(
                groups: categoryGroups,
                mediaKind: mediaKind,
                coverPreference: coverPreference,
                showBookCountBadge: showBookCountBadge,
                onNavigate: handleNavigation,
            ) { headerView }
        }
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Series").font(.storytellerTitle(size: 32))
            HStack {
                CategoryViewOptionsMenu(
                    layoutStyle: Binding(
                        get: { layoutStyle },
                        set: { layoutStyleRaw = $0.rawValue },
                    ),
                    coverPreference: Binding(
                        get: { coverPreference },
                        set: { coverPrefRaw = $0.rawValue },
                    ),
                    showBookCountBadge: $showBookCountBadge,
                )
                Spacer()
            }.font(.callout)
        }
    }

}
#endif

#if os(macOS)
extension SeriesView {
    private var macOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list:
                        CategoryListSidebar(
                            sidebarTitle: "Series",
                            groups: categoryGroups,
                            selectedGroupId: $selectedGroupId,
                            listWidth: $listWidth,
                            sortByCount: $sortByCount,
                            rowContent: { group, isSelected, isHovered in
                                CategoryRowContent(
                                    iconName: "books.vertical.fill",
                                    name: group.name,
                                    bookCount: group.books.count,
                                    isSelected: isSelected,
                                    showBookCount: showBookCountBadge,
                                    pinId: group.pinId,
                                    isHovered: isHovered,
                                )
                            },
                            detailContent: { group in
                                let isNoSeries = group.id == Self.noSeriesFilterKey
                                let sortKey = isNoSeries ? "title" : "seriesPosition"
                                return MediaGridView(
                                    title: group.name,
                                    searchText: searchText,
                                    mediaKind: mediaKind,
                                    viewOptionsKey: "seriesView.\(mediaKind.rawValue)",
                                    seriesFilter: group.id,
                                    defaultSort: sortKey,
                                    tableContext: "category",
                                    preferredTileWidth: 120,
                                    minimumTileWidth: 50,
                                    onSeriesSelected: { newSeriesName in
                                        navigationPath.append(
                                            SeriesDetailNavigation(
                                                seriesName: newSeriesName,
                                                initialSelectedBook: nil,
                                            )
                                        )
                                    },
                                    initialNarrationFilterOption: .both,
                                    scrollPosition: nil,
                                )
                            },
                            toolbarContent: {
                                CategoryViewOptionsMenu(
                                    layoutStyle: Binding(
                                        get: { layoutStyle },
                                        set: { layoutStyleRaw = $0.rawValue },
                                    ),
                                    coverPreference: Binding(
                                        get: { coverPreference },
                                        set: { coverPrefRaw = $0.rawValue },
                                    ),
                                    showBookCountBadge: $showBookCountBadge,
                                )
                            },
                            contextMenuBuilder: categoryContextMenu,
                        )
                    case .fan, .grid: fanGridContent
                }
            }.navigationDestination(for: SeriesDetailNavigation.self) { nav in
                seriesDetailView(for: nav.seriesName, initialSelectedItem: nav.initialSelectedBook)
            }
        }
    }

    @ViewBuilder
    private var fanGridContent: some View {
        if layoutStyle == .fan {
            CategoryFanLayout(
                groups: categoryGroups,
                mediaKind: mediaKind,
                coverPreference: coverPreference,
                sortByCount: sortByCount,
                onNavigate: handleNavigation,
            ) {
                headerView
            } stickyHeader: {
                stickyHeaderView
            } contextMenuBuilder: {
                categoryContextMenu(for: $0)
            }
        } else {
            CategoryGridLayout(
                groups: categoryGroups,
                mediaKind: mediaKind,
                coverPreference: coverPreference,
                sortByCount: sortByCount,
                showBookCountBadge: showBookCountBadge,
                onNavigate: handleNavigation,
            ) {
                headerView
            } stickyHeader: {
                stickyHeaderView
            } contextMenuBuilder: {
                categoryContextMenu(for: $0)
            }
        }
    }

    private var headerView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Series").font(.storytellerTitle(size: 32))
            stickyHeaderView
        }
    }

    private var stickyHeaderView: some View {
        HStack {
            SidebarSortButton(sortByCount: $sortByCount)
            CategoryViewOptionsMenu(
                layoutStyle: Binding(get: { layoutStyle }, set: { layoutStyleRaw = $0.rawValue }),
                coverPreference: Binding(
                    get: { coverPreference },
                    set: { coverPrefRaw = $0.rawValue },
                ),
                showBookCountBadge: $showBookCountBadge,
            )
            Spacer()
        }.font(.callout)
    }

    @ViewBuilder
    private func categoryContextMenu(for group: CategoryGroup) -> some View {
        if let onEditMetadata {
            CategoryGroupMetadataContextMenuContent(
                group: group,
                onEditMetadata: onEditMetadata,
            )
        }
    }
}
#endif

extension SeriesView {
    @ViewBuilder fileprivate func seriesDetailView(
        for seriesName: String,
        initialSelectedItem: BookMetadata? = nil,
    ) -> some View {
        let isNoSeries = seriesName == Self.noSeriesFilterKey
        let displayTitle = isNoSeries ? "No Series" : seriesName
        let sortKey = isNoSeries ? "title" : "seriesPosition"
        #if os(iOS)
        MediaGridView(
            title: displayTitle,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "seriesView.\(mediaKind.rawValue)",
            seriesFilter: seriesName,
            defaultSort: sortKey,
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)],
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(displayTitle)
        #else
        MediaGridView(
            title: displayTitle,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "seriesView.\(mediaKind.rawValue)",
            seriesFilter: seriesName,
            defaultSort: sortKey,
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            onSeriesSelected: { newSeriesName in
                navigationPath.append(
                    SeriesDetailNavigation(seriesName: newSeriesName, initialSelectedBook: nil)
                )
            },
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(displayTitle)
        #endif
    }
}

#endif
