#if os(iOS) || os(macOS)
import SwiftUI

struct SmartShelfDetailNavigation: Hashable {
    let shelfId: UUID
    let initialSelectedBook: BookMetadata?

    func hash(into hasher: inout Hasher) {
        hasher.combine(shelfId)
        hasher.combine(initialSelectedBook?.id)
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.shelfId == rhs.shelfId && lhs.initialSelectedBook?.id == rhs.initialSelectedBook?.id
    }
}

struct SmartShelvesView: View {
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
    @State private var settingsViewModel = SettingsViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var showCreator = false
    @State private var editingShelf: SmartShelf?
    @AppStorage("viewLayout.smartShelves") private var layoutStyleRaw: String = CategoryLayoutStyle
        .fan.rawValue
    @AppStorage("coverPref.smartShelves") private var coverPrefRaw: String = CoverPreference
        .storytellerDouble.rawValue
    @AppStorage("smartShelves.showBookCountBadge") private var showBookCountBadge: Bool = true

    #if os(macOS)
    @State private var selectedGroupId: String? = nil
    @State private var listWidth: CGFloat = CategoryListSidebarDefaults.width
    @State private var sortByCount = false
    #endif

    private var layoutStyle: CategoryLayoutStyle {
        get { CategoryLayoutStyle(rawValue: layoutStyleRaw) ?? .fan }
        set { layoutStyleRaw = newValue.rawValue }
    }

    private var coverPreference: CoverPreference {
        get { CoverPreference(rawValue: coverPrefRaw) ?? .preferEbook }
        set { coverPrefRaw = newValue.rawValue }
    }

    private let horizontalPadding: CGFloat = 24
    private let sectionSpacing: CGFloat = 32

    private var categoryGroups: [CategoryGroup] {
        let shelves = filteredShelves()
        return shelves.map { shelf in
            let books = mediaViewModel.booksForShelf(shelf)
            return CategoryGroup(
                id: shelf.id.uuidString,
                name: shelf.name,
                books: books,
                pinId: SidebarPinHelper.pinId(forSmartShelf: shelf.id),
            )
        }
    }

    private func handleNavigation(_ group: CategoryGroup, _ book: BookMetadata?) {
        guard let shelfId = UUID(uuidString: group.id) else { return }
        navigationPath.append(
            SmartShelfDetailNavigation(shelfId: shelfId, initialSelectedBook: book)
        )
    }

    private func shelfForGroup(_ group: CategoryGroup) -> SmartShelf? {
        guard let shelfId = UUID(uuidString: group.id) else { return nil }
        return mediaViewModel.smartShelves.first { $0.id == shelfId }
    }

    #if os(iOS)
    private var hasConnectionError: Bool {
        if mediaViewModel.lastNetworkOpSucceeded == false { return true }
        if case .error = mediaViewModel.connectionStatus { return true }
        return false
    }

    private var connectionErrorIcon: String {
        if case .error = mediaViewModel.connectionStatus {
            return "exclamationmark.triangle"
        }
        return "wifi.slash"
    }
    #endif

    var body: some View {
        #if os(macOS)
        macOSBody
        #else
        iOSBody
        #endif
    }
}

#if os(iOS)
extension SmartShelvesView {
    private var iOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list: listContent
                    case .fan, .grid: fanGridContent
                }
            }
            .navigationTitle("Smart Shelves")
            .navigationBarTitleDisplayMode(.inline)
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
            .navigationDestination(for: SmartShelfDetailNavigation.self) { nav in
                shelfDetailView(for: nav.shelfId, initialSelectedItem: nav.initialSelectedBook)
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
                            )
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .contextMenu { shelfContextMenu(for: group) }
                        Divider().padding(.leading, 48)
                    }
                }
            }
            .padding(.top, 8)
        }
    }

    @ViewBuilder
    private var fanGridContent: some View {
        if layoutStyle == .fan {
            CategoryFanLayout(
                groups: categoryGroups,
                mediaKind: .ebook,
                coverPreference: coverPreference,
                onNavigate: handleNavigation,
                header: { headerView },
                contextMenuBuilder: shelfContextMenu,
            )
        } else {
            CategoryGridLayout(
                groups: categoryGroups,
                mediaKind: .ebook,
                coverPreference: coverPreference,
                showBookCountBadge: showBookCountBadge,
                onNavigate: handleNavigation,
                header: { headerView },
                contextMenuBuilder: shelfContextMenu,
            )
        }
    }

    @ViewBuilder
    private func shelfContextMenu(for group: CategoryGroup) -> some View {
        if let shelf = shelfForGroup(group) {
            Button(role: .destructive) {
                Task { await mediaViewModel.deleteSmartShelf(id: shelf.id) }
            } label: {
                Label("Delete Shelf", systemImage: "trash")
            }
        }
    }

}
#endif

#if os(macOS)
extension SmartShelvesView {
    private var macOSBody: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                switch layoutStyle {
                    case .list:
                        CategoryListSidebar(
                            sidebarTitle: "Shelves",
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
                                if let shelfId = UUID(uuidString: group.id),
                                    let shelf = mediaViewModel.smartShelves.first(where: {
                                        $0.id == shelfId
                                    })
                                {
                                    let books = mediaViewModel.booksForShelf(shelf)
                                    SmartShelfDetailView(
                                        shelf: shelf,
                                        books: books,
                                        searchText: searchText,
                                        viewOptionsKey: "smartShelfDetail.\(shelfId)",
                                        initialSelectedItem: nil,
                                    )
                                } else {
                                    Text("Shelf not found").foregroundStyle(.secondary)
                                }
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
                            headerAccessory: AnyView(
                                HStack {
                                    Button {
                                        showCreator = true
                                    } label: {
                                        Label("Create New Shelf", systemImage: "plus.circle")
                                    }
                                    .buttonStyle(.borderless)
                                    .fixedSize()
                                    Spacer()
                                }
                            ),
                            contextMenuBuilder: shelfContextMenu,
                        )
                    case .fan, .grid:
                        fanGridContent
                }
            }
            .navigationDestination(for: SmartShelfDetailNavigation.self) { nav in
                shelfDetailView(for: nav.shelfId, initialSelectedItem: nav.initialSelectedBook)
            }
        }
        .sheet(isPresented: $showCreator) {
            SmartShelfCreatorView { shelf in
                Task { await mediaViewModel.saveSmartShelf(shelf) }
            }
        }
        .sheet(item: $editingShelf) { shelf in
            SmartShelfCreatorView(existingShelf: shelf) { updatedShelf in
                Task { await mediaViewModel.saveSmartShelf(updatedShelf) }
            }
        }
    }

    @ViewBuilder
    private var fanGridContent: some View {
        if layoutStyle == .fan {
            CategoryFanLayout(
                groups: categoryGroups,
                mediaKind: .ebook,
                coverPreference: coverPreference,
                onNavigate: handleNavigation,
                header: { headerView },
                contextMenuBuilder: shelfContextMenu,
            )
        } else {
            CategoryGridLayout(
                groups: categoryGroups,
                mediaKind: .ebook,
                coverPreference: coverPreference,
                showBookCountBadge: showBookCountBadge,
                onNavigate: handleNavigation,
                header: { headerView },
                contextMenuBuilder: shelfContextMenu,
            )
        }
    }

    @ViewBuilder
    private func shelfContextMenu(for group: CategoryGroup) -> some View {
        if let shelf = shelfForGroup(group) {
            Button {
                editingShelf = shelf
            } label: {
                Label("Edit Shelf", systemImage: "pencil")
            }
            Button(role: .destructive) {
                Task { await mediaViewModel.deleteSmartShelf(id: shelf.id) }
            } label: {
                Label("Delete Shelf", systemImage: "trash")
            }
            if let onEditMetadata {
                Divider()
                CategoryGroupMetadataContextMenuContent(
                    group: group,
                    onEditMetadata: onEditMetadata,
                )
            }
        }
    }
}
#endif

extension SmartShelvesView {
    fileprivate var headerView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Smart Shelves")
                .font(.storytellerTitle(size: 32))

            HStack(spacing: 12) {
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
            }
            .font(.callout)

            HStack {
                Button {
                    showCreator = true
                } label: {
                    Label("Create New Shelf", systemImage: "plus.circle")
                }
                #if os(macOS)
                .buttonStyle(.borderless)
                #endif
                Spacer()
            }
            .font(.callout)
        }
    }

    fileprivate func filteredShelves() -> [SmartShelf] {
        guard !searchText.isEmpty else { return mediaViewModel.smartShelves }
        let searchLower = searchText.lowercased()
        return mediaViewModel.smartShelves.filter { shelf in
            shelf.name.lowercased().contains(searchLower)
        }
    }

    @ViewBuilder
    fileprivate func shelfDetailView(for shelfId: UUID, initialSelectedItem: BookMetadata? = nil)
        -> some View
    {
        if let shelf = mediaViewModel.smartShelves.first(where: { $0.id == shelfId }) {
            let books = mediaViewModel.booksForShelf(shelf)
            SmartShelfDetailView(
                shelf: shelf,
                books: books,
                searchText: "",
                viewOptionsKey: "smartShelfDetail.\(shelfId)",
                initialSelectedItem: initialSelectedItem,
            )
            .navigationTitle(shelf.name)
        } else {
            Text("Shelf not found").foregroundStyle(.secondary)
        }
    }
}

struct SmartShelfDetailView: View {
    let shelf: SmartShelf
    let books: [BookMetadata]
    let searchText: String
    let viewOptionsKey: String
    let initialSelectedItem: BookMetadata?
    @Environment(MediaViewModel.self) private var mediaViewModel

    init(
        shelf: SmartShelf,
        books: [BookMetadata],
        searchText: String,
        viewOptionsKey: String = "smartShelves",
        initialSelectedItem: BookMetadata? = nil,
    ) {
        self.shelf = shelf
        self.books = books
        self.searchText = searchText
        self.viewOptionsKey = viewOptionsKey
        self.initialSelectedItem = initialSelectedItem
    }

    var body: some View {
        MediaGridView(
            title: shelf.name,
            searchText: searchText,
            mediaKind: .ebook,
            viewOptionsKey: viewOptionsKey,
            preferredTileWidth: 120,
            minimumTileWidth: 50,
            initialNarrationFilterOption: .both,
            scrollPosition: nil,
            initialSelectedItem: initialSelectedItem,
            filteredItems: books,
        )
    }
}

#endif
