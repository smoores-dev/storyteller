#if os(iOS) || os(macOS)
import SwiftUI

struct SourceView: View {
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
    @Environment(\.openWindow) private var openWindow
    #endif
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var navigationPath = NavigationPath()
    @AppStorage("viewLayout.source") private var layoutStyleRaw: String = CategoryLayoutStyle.list
        .rawValue
    @AppStorage("coverPref.source") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble
        .rawValue
    @AppStorage("source.showBookCountBadge") private var showBookCountBadge: Bool = true

    #if os(macOS)
    @State private var selectedGroupId: String? = nil
    @State private var listWidth: CGFloat = 210
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
        mediaViewModel.hasServerConnectionIssue
    }
    private var connectionErrorIcon: String {
        mediaViewModel.connectionIssueIcon
    }
    #endif

    private var categoryGroups: [CategoryGroup] {
        let sourceBooks = booksBySourceID()
        let groups = mediaViewModel.bookSources.map { source in
            (source: source, books: sourceBooks[source.id] ?? [])
        }
        let filtered = filterGroups(groups)
        return filtered.map { group in
            CategoryGroup(
                id: group.source.id,
                name: group.source.name,
                books: group.books,
                pinId: nil,
            )
        }
    }

    private func booksBySourceID() -> [BookSourceID: [BookMetadata]] {
        var grouped: [BookSourceID: [BookMetadata]] = [:]
        for book in mediaViewModel.library.bookMetaData {
            grouped[book.sourceID, default: []].append(book)
        }
        for sourceID in grouped.keys {
            grouped[sourceID]?.sort {
                $0.title.articleStrippedCompare($1.title) == .orderedAscending
            }
        }
        return grouped
    }

    private func filterGroups(_ groups: [(source: BookSourceRecord, books: [BookMetadata])]) -> [(
        source: BookSourceRecord, books: [BookMetadata]
    )] {
        guard !searchText.isEmpty else { return groups }
        let searchLower = searchText.lowercased()
        return groups.compactMap { group in
            let sourceMatches = group.source.name.lowercased().contains(searchLower)
            let filteredBooks = group.books.filter { $0.title.lowercased().contains(searchLower) }
            if sourceMatches { return group }
            guard !filteredBooks.isEmpty else { return nil }
            return (source: group.source, books: filteredBooks)
        }
    }

    private func sourceRecord(for sourceID: BookSourceID) -> BookSourceRecord? {
        mediaViewModel.bookSources.first { $0.id == sourceID }
    }

    private func iconName(for sourceID: BookSourceID) -> String {
        switch sourceRecord(for: sourceID)?.kind {
            case .storyteller:
                return "server.rack"
            case .localFolder:
                return "folder.fill"
            case nil:
                return "questionmark.circle.fill"
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
            SourceDetailNavigation(sourceID: group.id, initialSelectedBook: book)
        )
    }
}

struct SourceDetailNavigation: Hashable {
    let sourceID: BookSourceID
    let initialSelectedBook: BookMetadata?
}

#if os(iOS)
extension SourceView {
    private var iOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list: listContent
                    case .fan, .grid: fanGridContent
                }
            }
            .navigationTitle("Sources").navigationBarTitleDisplayMode(.inline)
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
            .navigationDestination(for: SourceDetailNavigation.self) { nav in
                sourceDetailView(for: nav.sourceID, initialSelectedItem: nav.initialSelectedBook)
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
                                iconName: iconName(for: group.id),
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
            Text("Sources").font(.storytellerTitle(size: 32))
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
extension SourceView {
    private var macOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list:
                        CategoryListSidebar(
                            sidebarTitle: "Sources",
                            groups: categoryGroups,
                            selectedGroupId: $selectedGroupId,
                            listWidth: $listWidth,
                            sortByCount: $sortByCount,
                            rowContent: { group, isSelected, isHovered in
                                CategoryRowContent(
                                    iconName: iconName(for: group.id),
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
                                    viewOptionsKey: "sourceView.\(mediaKind.rawValue).\(group.id)",
                                    defaultSort: "title",
                                    tableContext: "category",
                                    preferredTileWidth: 120,
                                    minimumTileWidth: 50,
                                    initialNarrationFilterOption: .both,
                                    scrollPosition: nil,
                                    showAddBookButton: true,
                                    addBookSourceID: group.id,
                                    sourceFilterID: group.id,
                                    sourceFilterName: group.name,
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
            }.navigationDestination(for: SourceDetailNavigation.self) { nav in
                sourceDetailView(for: nav.sourceID, initialSelectedItem: nav.initialSelectedBook)
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
            Text("Sources").font(.storytellerTitle(size: 32))
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

extension SourceView {
    @ViewBuilder fileprivate func sourceDetailView(
        for sourceID: BookSourceID,
        initialSelectedItem: BookMetadata? = nil,
    ) -> some View {
        let source = sourceRecord(for: sourceID)
        let sourceName = source?.name ?? "Unknown Source"
        #if os(iOS)
        MediaGridView(
            title: sourceName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "sourceView.\(mediaKind.rawValue).\(sourceID)",
            defaultSort: "title",
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)],
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
            showAddBookButton: true,
            addBookSourceID: sourceID,
            sourceFilterID: sourceID,
            sourceFilterName: sourceName,
            sourceFilterKind: source?.kind,
            emptyStateMessage:
                source?.kind == .localFolder
                ? "Copy files into this folder source to add books."
                : "Use Add Book to add files to this source.",
        ).navigationTitle(sourceName)
        #else
        MediaGridView(
            title: sourceName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "sourceView.\(mediaKind.rawValue).\(sourceID)",
            defaultSort: "title",
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
            showAddBookButton: true,
            addBookSourceID: sourceID,
            sourceFilterID: sourceID,
            sourceFilterName: sourceName,
            sourceFilterKind: source?.kind,
            emptyStateMessage:
                source?.kind == .localFolder
                ? "Copy files into this folder source to add books."
                : "Use Add Book to add files to this source.",
        ).navigationTitle(sourceName)
        #endif
    }
}

#endif
