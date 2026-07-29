#if os(iOS) || os(macOS)
import SwiftUI

struct RatingView: View {
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
    @AppStorage("viewLayout.ratings") private var layoutStyleRaw: String = CategoryLayoutStyle.list
        .rawValue
    @AppStorage("coverPref.ratings") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble
        .rawValue
    @AppStorage("ratings.showBookCountBadge") private var showBookCountBadge: Bool = true

    #if os(macOS)
    @State private var selectedGroupId: String? = nil
    @State private var listWidth: CGFloat = CategoryListSidebarDefaults.width
    @State private var sortByCount = false
    #endif

    private var layoutStyle: CategoryLayoutStyle {
        CategoryLayoutStyle(rawValue: layoutStyleRaw) ?? .list
    }
    private var coverPreference: CoverPreference {
        CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook
    }

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
        let groups = mediaViewModel.booksByRating(for: mediaKind)
        let filtered = filterGroups(groups)
        return filtered.map { group in
            let displayName = RatingDisplayHelper.label(for: group.rating)
            return CategoryGroup(
                id: group.rating,
                name: displayName,
                books: group.books,
                pinId: SidebarPinHelper.pinId(forRating: group.rating),
            )
        }
    }

    private func filterGroups(_ groups: [(rating: String, books: [BookMetadata])]) -> [(
        rating: String, books: [BookMetadata]
    )] {
        guard !searchText.isEmpty else { return groups }
        let searchLower = searchText.lowercased()
        return groups.compactMap { group in
            let ratingMatches = RatingDisplayHelper.label(for: group.rating).lowercased().contains(
                searchLower
            )
            let filteredBooks = group.books.filter { $0.title.lowercased().contains(searchLower) }
            if ratingMatches { return group }
            guard !filteredBooks.isEmpty else { return nil }
            return (rating: group.rating, books: filteredBooks)
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
        navigationPath.append(RatingDetailNavigation(rating: group.id, initialSelectedBook: book))
    }
}

struct RatingDetailNavigation: Hashable {
    let rating: String
    let initialSelectedBook: BookMetadata?
}

#if os(iOS)
extension RatingView {
    private var iOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list: listContent
                    case .fan, .grid: fanGridContent
                }
            }
            .navigationTitle("User Ratings").navigationBarTitleDisplayMode(.inline)
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
            .navigationDestination(for: RatingDetailNavigation.self) { nav in
                ratingDetailView(for: nav.rating, initialSelectedItem: nav.initialSelectedBook)
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
                                iconName: "star.fill",
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
            Text("User Ratings").font(.storytellerTitle(size: 32))
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
extension RatingView {
    private var macOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list:
                        CategoryListSidebar(
                            sidebarTitle: "User Ratings",
                            groups: categoryGroups,
                            selectedGroupId: $selectedGroupId,
                            listWidth: $listWidth,
                            sortByCount: $sortByCount,
                            rowContent: { group, isSelected, isHovered in
                                CategoryRowContent(
                                    iconName: "star.fill",
                                    name: group.name,
                                    bookCount: group.books.count,
                                    isSelected: isSelected,
                                    showBookCount: showBookCountBadge,
                                    pinId: group.pinId,
                                    isHovered: isHovered,
                                )
                            },
                            detailContent: { group in
                                MediaGridView(
                                    title: group.name,
                                    searchText: searchText,
                                    mediaKind: mediaKind,
                                    viewOptionsKey: "ratingView.\(mediaKind.rawValue)",
                                    ratingFilter: group.id,
                                    defaultSort: "title",
                                    tableContext: "category",
                                    preferredTileWidth: 120,
                                    minimumTileWidth: 50,
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
            }.navigationDestination(for: RatingDetailNavigation.self) { nav in
                ratingDetailView(for: nav.rating, initialSelectedItem: nav.initialSelectedBook)
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
            Text("User Ratings").font(.storytellerTitle(size: 32))
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

extension RatingView {
    @ViewBuilder fileprivate func ratingDetailView(
        for rating: String,
        initialSelectedItem: BookMetadata? = nil,
    ) -> some View {
        let displayName = RatingDisplayHelper.label(for: rating)
        #if os(iOS)
        MediaGridView(
            title: displayName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "ratingView.\(mediaKind.rawValue)",
            ratingFilter: rating,
            defaultSort: "title",
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)],
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(displayName)
        #else
        MediaGridView(
            title: displayName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "ratingView.\(mediaKind.rawValue)",
            ratingFilter: rating,
            defaultSort: "title",
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(displayName)
        #endif
    }
}

enum RatingDisplayHelper {
    static func label(for rating: String) -> String {
        if rating == "Unrated" { return "Unrated" }
        guard let stars = Int(rating) else { return rating }
        return String(repeating: "\u{2605}", count: stars)
            + String(repeating: "\u{2606}", count: 5 - stars)
    }
}

#endif
