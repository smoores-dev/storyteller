#if os(iOS) || os(macOS)
import SwiftUI

struct TranslatorView: View {
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
    @AppStorage("viewLayout.translators") private var layoutStyleRaw: String = CategoryLayoutStyle
        .list.rawValue
    @AppStorage("coverPref.translators") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble
        .rawValue
    @AppStorage("translators.showBookCountBadge") private var showBookCountBadge: Bool = true

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
        mediaViewModel.connectionIssueIcon
    }
    #endif

    private var categoryGroups: [CategoryGroup] {
        let groups = mediaViewModel.booksByTranslator(for: mediaKind)
        let filtered = filterGroups(groups)
        return filtered.map { group in
            let name = group.translator?.name ?? "Unknown Translator"
            return CategoryGroup(
                id: name,
                name: name,
                books: group.books,
                pinId: group.translator?.name != nil
                    ? SidebarPinHelper.pinId(forTranslator: name) : nil,
            )
        }
    }

    private func filterGroups(_ groups: [(translator: BookCreator?, books: [BookMetadata])]) -> [(
        translator: BookCreator?, books: [BookMetadata]
    )] {
        guard !searchText.isEmpty else { return groups }
        let searchLower = searchText.lowercased()
        return groups.compactMap { group in
            let nameMatches = group.translator?.name?.lowercased().contains(searchLower) ?? false
            let filteredBooks = group.books.filter { $0.title.lowercased().contains(searchLower) }
            if nameMatches { return group }
            guard !filteredBooks.isEmpty else { return nil }
            return (translator: group.translator, books: filteredBooks)
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
            TranslatorDetailNavigation(translatorName: group.id, initialSelectedBook: book)
        )
    }
}

struct TranslatorDetailNavigation: Hashable {
    let translatorName: String
    let initialSelectedBook: BookMetadata?
}

#if os(iOS)
extension TranslatorView {
    private var iOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list: listContent
                    case .fan, .grid: fanGridContent
                }
            }
            .navigationTitle("Translators").navigationBarTitleDisplayMode(.inline)
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
            .navigationDestination(for: TranslatorDetailNavigation.self) { nav in
                translatorDetailView(
                    for: nav.translatorName,
                    initialSelectedItem: nav.initialSelectedBook,
                ).iOSLibraryToolbar(
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
                                iconName: "character.book.closed.fill",
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
            Text("Translators").font(.storytellerTitle(size: 32))
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
extension TranslatorView {
    private var macOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list:
                        CategoryListSidebar(
                            sidebarTitle: "Translators",
                            groups: categoryGroups,
                            selectedGroupId: $selectedGroupId,
                            listWidth: $listWidth,
                            sortByCount: $sortByCount,
                            rowContent: { group, isSelected, isHovered in
                                CategoryRowContent(
                                    iconName: "character.book.closed.fill",
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
                                    viewOptionsKey: "translatorView.\(mediaKind.rawValue)",
                                    translatorFilter: group.name,
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
            }.navigationDestination(for: TranslatorDetailNavigation.self) { nav in
                translatorDetailView(
                    for: nav.translatorName,
                    initialSelectedItem: nav.initialSelectedBook,
                )
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
            Text("Translators").font(.storytellerTitle(size: 32))
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

extension TranslatorView {
    @ViewBuilder fileprivate func translatorDetailView(
        for translatorName: String,
        initialSelectedItem: BookMetadata? = nil,
    ) -> some View {
        #if os(iOS)
        MediaGridView(
            title: translatorName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "translatorView.\(mediaKind.rawValue)",
            translatorFilter: translatorName,
            defaultSort: "title",
            preferredTileWidth: 110,
            minimumTileWidth: 90,
            columnBreakpoints: [MediaGridView.ColumnBreakpoint(columns: 3, minWidth: 0)],
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(translatorName)
        #else
        MediaGridView(
            title: translatorName,
            searchText: "",
            mediaKind: mediaKind,
            viewOptionsKey: "translatorView.\(mediaKind.rawValue)",
            translatorFilter: translatorName,
            defaultSort: "title",
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
        ).navigationTitle(translatorName)
        #endif
    }
}

#endif
