#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#endif

struct SidebarView: View {
    let sections: [SidebarSectionDescription]
    @Binding var selectedItem: SidebarItemDescription?
    @Binding var searchText: String
    @Binding var isSearchFocused: Bool
    #if os(macOS)
    @Binding var sidebarFilter: String
    #endif
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var selectedId: String?
    @State private var isRefreshing: Bool = false
    @State private var hoveredItemId: String?
    #if os(macOS)
    @Environment(StorytellerEnvironment.self) private var storytellerEnvironment
    @Environment(\.openSettings) private var openSettings
    @Environment(\.openWindow) private var openWindow
    @State private var editingShelf: SmartShelf?
    @State private var editingBookSource: BookSourceRecord?
    @State private var showCustomizeSidebar: Bool = false
    @State private var showCustomizeSidebarWithDashboard: Bool = false
    #endif

    @AppStorage("sidebar.config") private var sidebarConfigJSON: String = ""
    @AppStorage("home.sectionConfig") private var homeSectionConfigJSON: String = "[]"

    private var sidebarConfig: [SidebarConfigGroup] {
        let _ = sidebarConfigJSON
        return SidebarConfigHelper.config
    }

    private let defaultLookup = SidebarConfigHelper.defaultItemLookup

    private var storytellerConfigured: Bool {
        mediaViewModel.connectionStatus != .disconnected
    }

    private func resolveConfigItem(_ item: SidebarConfigItem) -> SidebarItemDescription? {
        guard item.visible else { return nil }
        if item.id == SidebarConfigHelper.newPinLocationMarker { return nil }

        if let sourceID = item.id.bookSourceIDFromSidebarItemID {
            guard let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID })
            else { return nil }
            var description = Self.sidebarItem(for: source)
            if let alias = item.alias, !alias.isEmpty {
                description.name = alias
            }
            return description
        }

        if item.id.hasPrefix("pin.") {
            guard var description = resolvePin(id: item.id) else { return nil }
            if let alias = item.alias, !alias.isEmpty {
                description.name = alias
            }
            return description
        }

        guard var description = defaultLookup[item.id] else { return nil }
        if let alias = item.alias, !alias.isEmpty {
            description.name = alias
        }
        return description
    }

    private func resolvePin(id: String) -> SidebarItemDescription? {
        if id.hasPrefix("pin.bookSource:") {
            let sourceID = String(id.dropFirst("pin.bookSource:".count))
            guard let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID }) else {
                return nil
            }
            return Self.sidebarItem(for: source, pinned: true)
        }
        if let resolved = Self.resolveDynamicPin(id: id) {
            return resolved
        }
        guard id.hasPrefix("pin.smartShelf:") else { return nil }
        let uuidString = String(id.dropFirst("pin.smartShelf:".count))
        guard let uuid = UUID(uuidString: uuidString),
            let shelf = mediaViewModel.smartShelves.first(where: { $0.id == uuid })
        else {
            return nil
        }
        return SidebarItemDescription(
            id: id,
            name: shelf.name,
            systemImage: "sparkles.rectangle.stack",
            badge: -1,
            content: .smartShelfDetail(uuid),
        )
    }

    static func resolveDynamicPin(id: String) -> SidebarItemDescription? {
        if id.hasPrefix("pin.sidebar:") {
            let stableId = String(id.dropFirst("pin.sidebar:".count))
            guard var description = SidebarConfigHelper.defaultItemLookup[stableId] else {
                return nil
            }
            description.id = id
            return description
        }
        if id.hasPrefix("pin.series:") {
            let name = String(id.dropFirst("pin.series:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "books.vertical",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        seriesFilter: name,
                        defaultSort: "seriesPosition",
                    )
                ),
            )
        }
        if id.hasPrefix("pin.collection:") {
            let name = String(id.dropFirst("pin.collection:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "rectangle.stack",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        collectionFilter: name,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.author:") {
            let name = String(id.dropFirst("pin.author:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "person.2",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        authorFilter: name,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.narrator:") {
            let name = String(id.dropFirst("pin.narrator:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "mic",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        narratorFilter: name,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.translator:") {
            let name = String(id.dropFirst("pin.translator:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "character.book.closed.fill",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        translatorFilter: name,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.tag:") {
            let name = String(id.dropFirst("pin.tag:".count))
            return SidebarItemDescription(
                id: id,
                name: name,
                systemImage: "tag",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: name,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        tagFilter: name,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.year:") {
            let year = String(id.dropFirst("pin.year:".count))
            return SidebarItemDescription(
                id: id,
                name: year,
                systemImage: "calendar",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: year,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        publicationYearFilter: year,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.rating:") {
            let rating = String(id.dropFirst("pin.rating:".count))
            let label = RatingDisplayHelper.label(for: rating)
            return SidebarItemDescription(
                id: id,
                name: label,
                systemImage: "star",
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: label,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        ratingFilter: rating,
                    )
                ),
            )
        }
        if id.hasPrefix("pin.status:") {
            let status = String(id.dropFirst("pin.status:".count))
            let icon: String
            switch status.lowercased() {
                case "reading": icon = "arrow.right.circle.fill"
                case "to read": icon = "bookmark.fill"
                case "read": icon = "checkmark.circle.fill"
                default: icon = "questionmark.circle.fill"
            }
            return SidebarItemDescription(
                id: id,
                name: status,
                systemImage: icon,
                badge: -1,
                content: .mediaGrid(
                    MediaGridConfiguration(
                        title: status,
                        mediaKind: .ebook,
                        preferredTileWidth: 120,
                        minimumTileWidth: 50,
                        statusFilter: status,
                        defaultSort: "recentlyRead",
                    )
                ),
            )
        }
        return nil
    }

    static func sidebarItem(for source: BookSourceRecord, pinned: Bool = false)
        -> SidebarItemDescription
    {
        SidebarItemDescription(
            id: pinned ? "pin.bookSource:\(source.id)" : "bookSource.\(source.id)",
            name: source.name,
            systemImage: source.kind == .storyteller ? "server.rack" : "folder",
            badge: -1,
            content: .bookSource(source.id),
        )
    }

    var body: some View {
        let _ = mediaViewModel.smartShelves
        let config = sidebarConfig
        #if os(macOS)
        VStack(spacing: 0) {
            if storytellerEnvironment.showStorytellerLockup {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        Image("StorytellerLogo")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 50, height: 50)
                        Text("Storyteller")
                            .font(.storytellerTitle(size: 18))
                        Spacer()
                    }
                    HStack {
                        Spacer()
                        Image("StorytellerLogo")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 40, height: 40)
                        Spacer()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, -8)
                .padding(.bottom, 6)
            }

            DebouncedSearchField(placeholder: "Filter Sidebar", searchText: $sidebarFilter)
                .padding(.horizontal, 16)
                .padding(.bottom, 8)

            sidebarList(config: config)
        }
        #else
        sidebarList(config: config)
        #endif
    }

    private func sidebarList(config: [SidebarConfigGroup]) -> some View {
        List(selection: $selectedId) {
            ForEach(config) { group in
                sidebarSection(for: group, config: config)
            }
        }
        .onChange(of: selectedId) { oldID, newID in
            if let id = newID, let found = findItem(by: id) {
                selectedItem = found
            } else if newID == nil, selectedItem != nil, findItem(by: selectedItem!.id) != nil {
                selectedItem = nil
            }
        }
        .onChange(of: selectedItem) { oldItem, newItem in
            if let newItem {
                if findItem(by: newItem.id) != nil {
                    selectedId = newItem.id
                } else {
                    selectedId = nil
                }
            } else {
                selectedId = nil
            }
        }
        .onAppear {
            syncBookSourcesIntoSidebarConfig()
            HomeSectionConfigHelper.syncWithPinnedItems(SidebarPinHelper.pinnedItemIds)
            homeSectionConfigJSON =
                UserDefaults.standard.string(forKey: "home.sectionConfig") ?? "[]"
            registerSidebarContents(config: config)
        }
        .onChange(of: sidebarConfigJSON) {
            HomeSectionConfigHelper.syncWithPinnedItems(SidebarPinHelper.pinnedItemIds)
            homeSectionConfigJSON =
                UserDefaults.standard.string(forKey: "home.sectionConfig") ?? "[]"
            registerSidebarContents(config: config)
        }
        .onChange(of: mediaViewModel.smartShelves) {
            registerSidebarContents(config: config)
        }
        .onChange(of: mediaViewModel.bookSources) {
            syncBookSourcesIntoSidebarConfig()
            registerSidebarContents(config: config)
        }
        #if !os(macOS)
        .searchable(
            text: $searchText,
            isPresented: $isSearchFocused,
            placement: .sidebar,
            prompt: "Search",
        )
        #endif
        .navigationSplitViewColumnWidth(min: 180, ideal: 250)
        #if os(macOS)
        .toolbar {
            ToolbarItem {
                Menu {
                    Button("Customize Sidebar...") {
                        showCustomizeSidebar = true
                    }
                    Divider()
                    Button {
                        Task {
                            let didDelete = await mediaViewModel.deleteLocalCoverCache()
                            mediaViewModel.showSyncNotification(
                                SyncNotification(
                                    message: didDelete
                                        ? "Local cover cache cleared"
                                        : "Failed to clear local cover cache",
                                    type: didDelete ? .success : .error,
                                )
                            )
                        }
                    } label: {
                        Label("Clear Local Cover Cache", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                    .foregroundStyle(.secondary)
                }
            }
        }
        .sheet(item: $editingShelf) { shelf in
            SmartShelfCreatorView(existingShelf: shelf) { updatedShelf in
                Task { await mediaViewModel.saveSmartShelf(updatedShelf) }
            }
        }
        .sheet(item: $editingBookSource) { source in
            NavigationStack {
                BookSourceEditorView(source: source) {
                    await mediaViewModel.refreshMetadata(source: "SidebarView.editBookSource")
                }
            }
        }
        .sheet(isPresented: $showCustomizeSidebar) {
            CustomizeSidebarView()
        }
        .sheet(isPresented: $showCustomizeSidebarWithDashboard) {
            CustomizeSidebarView(showHomeSectionsOnAppear: true)
        }
        #endif
    }

    private func registerSidebarContents(config: [SidebarConfigGroup]) {
        let configuredContents = config.flatMap { group in
            group.items.compactMap { resolveConfigItem($0)?.content }
        }
        let configuredSourceIDs = configuredBookSourceIDs(in: config)
        let missingSourceContents = mediaViewModel.bookSources
            .filter { !configuredSourceIDs.contains($0.id) }
            .map { SidebarContentKind.bookSource($0.id) }
        let contents = configuredContents + missingSourceContents
        mediaViewModel.updateVisibleSidebarContents(contents)
    }

    private func syncBookSourcesIntoSidebarConfig() {
        let sources = mediaViewModel.bookSources
        var config = SidebarConfigHelper.config
        let sourceIDs = Set(sources.map(\.id))
        var didChange = false

        for groupIndex in config.indices {
            let filteredItems = config[groupIndex].items.filter { item in
                guard let sourceID = item.id.bookSourceIDFromSidebarItemID else { return true }
                return sourceIDs.contains(sourceID)
            }
            if filteredItems.count != config[groupIndex].items.count {
                config[groupIndex].items = filteredItems
                didChange = true
            }
        }

        let configuredSourceIDs = configuredBookSourceIDs(in: config)
        let missingSources = sources.filter { !configuredSourceIDs.contains($0.id) }
        if !missingSources.isEmpty {
            if let mediaSourcesIndex = config.firstIndex(where: { $0.name == "Media Sources" }) {
                config[mediaSourcesIndex].items.append(
                    contentsOf: missingSources.map {
                        SidebarConfigItem(id: "bookSource.\($0.id)", permanent: true)
                    }
                )
            } else {
                config.append(
                    SidebarConfigGroup(
                        name: "Media Sources",
                        items: missingSources.map {
                            SidebarConfigItem(id: "bookSource.\($0.id)", permanent: true)
                        },
                    )
                )
            }
            didChange = true
        }

        if didChange {
            SidebarConfigHelper.config = config
        }
    }

    private func configuredBookSourceIDs(in config: [SidebarConfigGroup]) -> Set<BookSourceID> {
        Set(
            config
                .flatMap(\.items)
                .compactMap(\.id.bookSourceIDFromSidebarItemID)
        )
    }

    @ViewBuilder
    private func sidebarSection(for group: SidebarConfigGroup, config: [SidebarConfigGroup])
        -> some View
    {
        let resolvedItems = resolvedItems(for: group)
        let isPinGroup = group.items.contains { $0.id == SidebarConfigHelper.newPinLocationMarker }

        if isPinGroup && resolvedItems.isEmpty && !isFiltering {
            Section(isExpanded: expandedBinding(for: group.id, config: config)) {
                Text("Right-click any series or category to pin it here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 8)
            } header: {
                sectionHeader(for: group, config: config)
            }
        } else if !resolvedItems.isEmpty {
            Section(
                isExpanded: isFiltering
                    ? .constant(true) : expandedBinding(for: group.id, config: config)
            ) {
                ForEach(resolvedItems) { item in
                    sidebarRow(for: item, isPinned: item.id.hasPrefix("pin."))
                }
            } header: {
                sectionHeader(for: group, config: config)
            }
        }
    }

    private func resolvedItems(for group: SidebarConfigGroup) -> [SidebarItemDescription] {
        let configuredItems = group.items.compactMap { resolveConfigItem($0) }
        guard group.name == "Media Sources" else { return applyFilter(configuredItems) }
        let configuredSourceIDs = configuredBookSourceIDs(in: sidebarConfig)
        let missingSourceItems = mediaViewModel.bookSources
            .filter { !configuredSourceIDs.contains($0.id) }
            .map { Self.sidebarItem(for: $0) }
        return applyFilter(configuredItems + missingSourceItems)
    }

    private func applyFilter(_ items: [SidebarItemDescription]) -> [SidebarItemDescription] {
        #if os(macOS)
        let query = sidebarFilter.trimmingCharacters(in: .whitespaces).lowercased()
        guard !query.isEmpty else { return items }
        return items.filter { $0.name.lowercased().contains(query) }
        #else
        return items
        #endif
    }

    private var isFiltering: Bool {
        #if os(macOS)
        return !sidebarFilter.trimmingCharacters(in: .whitespaces).isEmpty
        #else
        return false
        #endif
    }

    @ViewBuilder
    private func sectionHeader(for group: SidebarConfigGroup, config: [SidebarConfigGroup])
        -> some View
    {
        HStack {
            Text(group.name)
                .font(.headline)
            #if os(macOS)
            if group.name == "Media Sources" {
                Button {
                    SettingsTabRequest.shared.requestBookSources()
                    openSettings()
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 11))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Manage Book Sources")
            }
            #endif
            Spacer()
        }
        .contentShape(Rectangle())
        .onTapGesture { toggleExpanded(group.id) }
        .padding(.bottom, 3)
        .padding(.trailing, 16)
    }

    private func expandedBinding(for groupId: UUID, config: [SidebarConfigGroup]) -> Binding<Bool> {
        Binding(
            get: {
                sidebarConfig.first(where: { $0.id == groupId })?.expanded ?? true
            },
            set: { _ in toggleExpanded(groupId) },
        )
    }

    private func toggleExpanded(_ groupId: UUID) {
        var config = SidebarConfigHelper.config
        if let index = config.firstIndex(where: { $0.id == groupId }) {
            config[index].expanded.toggle()
            SidebarConfigHelper.config = config
        }
    }

    @ViewBuilder
    private func sidebarRow(for item: SidebarItemDescription, isPinned: Bool = false) -> some View {
        HStack {
            Label(item.name, systemImage: item.systemImage)
                .tag(item.id)

            if case .bookSource(let sourceID) = item.content,
                let info = mediaViewModel.sourceConnectionInfos.first(where: { $0.id == sourceID }),
                info.kind == .storyteller
            {
                sourceConnectionDot(for: info.status)
            }

            Spacer()

            #if os(macOS)
            pinButton(for: item, isPinned: isPinned)
            #endif

            if item.content == .storytellerServer {
                #if os(macOS)
                if storytellerConfigured {
                    Button {
                        Task { await refreshMetadata() }
                    } label: {
                        if isRefreshing {
                            ProgressView()
                                .controlSize(.small)
                                .scaleEffect(0.6)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 10))
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .disabled(isRefreshing)
                }
                #endif
                connectionIndicator(for: mediaViewModel.connectionStatus)
            } else if case .bookSource(let sourceID) = item.content {
                bookSourceTrailingContent(sourceID: sourceID)
            } else {
                let count = mediaViewModel.badgeCount(for: item.content)
                if count > 0 {
                    Text("\(count)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        #if os(macOS)
        .onHover { hovering in
            hoveredItemId = hovering ? item.id : nil
        }
        .contextMenu { sidebarRowContextMenu(for: item, isPinned: isPinned) }
        #endif
    }

    @ViewBuilder
    private func bookSourceTrailingContent(sourceID: BookSourceID) -> some View {
        let count = mediaViewModel.library.bookMetaData.filter { $0.sourceID == sourceID }.count
        #if os(macOS)
        if let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID }),
            source.kind == .localFolder,
            let storagePath = source.storagePath?.trimmingCharacters(in: .whitespacesAndNewlines),
            !storagePath.isEmpty
        {
            Button {
                openFolderSourceInFinder(path: storagePath)
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 10))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.secondary)
            .help("Show in Finder")
        }
        #endif
        if count > 0 {
            Text("\(count)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }

    #if os(macOS)
    @ViewBuilder
    private func sidebarRowContextMenu(for item: SidebarItemDescription, isPinned: Bool)
        -> some View
    {
        if isPinned {
            Button {
                SidebarPinHelper.togglePin(item.id)
            } label: {
                Label("Remove Pin", systemImage: "pin.slash")
            }
        }

        if item.id.hasPrefix("pin.smartShelf:") {
            let uuidString = String(item.id.dropFirst("pin.smartShelf:".count))
            if let uuid = UUID(uuidString: uuidString),
                let shelf = mediaViewModel.smartShelves.first(where: { $0.id == uuid })
            {
                Divider()
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
            }
        }

        if let sourceID = item.id.bookSourceIDFromSidebarItemID,
            let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID })
        {
            Button {
                editingBookSource = source
            } label: {
                Label("Edit Source...", systemImage: "pencil")
            }
        }

        if !isPinned && item.content == .home {
            Button {
                showCustomizeSidebarWithDashboard = true
            } label: {
                Label("Edit Dashboard", systemImage: "gearshape")
            }
        }

        if !isPinned && item.content != .home {
            let dashboardPinId = dashboardPinId(for: item.content)
            if !SidebarPinHelper.isPinned(dashboardPinId) {
                Button {
                    if case .bookSource = item.content {
                        SidebarPinHelper.togglePin(dashboardPinId)
                    } else {
                        SidebarPinHelper.addToDashboard(item.content.stableIdentifier)
                    }
                } label: {
                    Label("Add to Dashboard", systemImage: "house")
                }
            }
        }

        Divider()

        Button {
            showCustomizeSidebar = true
        } label: {
            Label("Edit Sidebar...", systemImage: "sidebar.left")
        }
    }

    private func dashboardPinId(for content: SidebarContentKind) -> String {
        if case .bookSource(let sourceID) = content {
            return "pin.bookSource:\(sourceID)"
        }
        return "pin.sidebar:\(content.stableIdentifier)"
    }
    #endif

    #if os(macOS)
    private func openFolderSourceInFinder(path: String) {
        let url = URL(fileURLWithPath: path, isDirectory: true)
        NSWorkspace.shared.open(url)
        NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder")
            .first?.activate()
    }

    @ViewBuilder
    private func pinButton(for item: SidebarItemDescription, isPinned: Bool) -> some View {
        if item.id.hasPrefix("pin.") && !isPinned {
            Button {
                SidebarPinHelper.togglePin(item.id)
            } label: {
                Image(systemName: "pin")
                    .font(.system(size: 10))
                    .foregroundStyle(.gray)
            }
            .buttonStyle(.plain)
            .opacity(hoveredItemId == item.id ? 1 : 0)
        }
    }
    #endif

    private func nonAnimating(_ binding: Binding<Bool>) -> Binding<Bool> {
        Binding(
            get: { binding.wrappedValue },
            set: { newValue in
                var t = Transaction()
                t.animation = nil
                withTransaction(t) {
                    binding.wrappedValue = newValue
                }
            },
        )
    }

    private func findItem(by id: String) -> SidebarItemDescription? {
        if let sourceID = id.bookSourceIDFromSidebarItemID,
            let source = mediaViewModel.bookSources.first(where: { $0.id == sourceID })
        {
            return Self.sidebarItem(for: source, pinned: id.hasPrefix("pin."))
        }
        for section in sections {
            for item in section.items {
                if item.id == id { return item }
                for child in item.children ?? [] {
                    if child.id == id { return child }
                }
            }
        }
        for group in sidebarConfig {
            for configItem in group.items {
                if configItem.id == id, let resolved = resolveConfigItem(configItem) {
                    return resolved
                }
            }
        }
        return resolvePin(id: id)
    }

    @ViewBuilder
    private func sourceConnectionDot(for status: ConnectionStatus) -> some View {
        let color: Color =
            switch status {
                case .connected: .green
                case .connecting: .yellow
                case .error: .red
                case .disconnected: .gray
            }
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
    }

    @ViewBuilder
    private func connectionIndicator(for status: ConnectionStatus) -> some View {
        switch status {
            case .connected:
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)
            case .connecting:
                ProgressView()
                    .controlSize(.small)
                    .scaleEffect(0.6)
            case .disconnected:
                Circle()
                    .fill(.gray)
                    .frame(width: 8, height: 8)
            case .error:
                Circle()
                    .fill(.red)
                    .frame(width: 8, height: 8)
        }
    }

    #if os(macOS)
    private func refreshMetadata() async {
        isRefreshing = true

        if await BookServiceActor.shared.fetchLibraryInformation() != nil {
            await mediaViewModel.refreshMetadata(source: "SidebarView.refresh")
            mediaViewModel.showSyncNotification(
                SyncNotification(message: "Library refreshed", type: .success)
            )
        } else {
            mediaViewModel.showSyncNotification(
                SyncNotification(message: "Failed to fetch metadata from server", type: .error)
            )
        }

        isRefreshing = false
    }
    #endif
}

extension String {
    fileprivate var bookSourceIDFromSidebarItemID: BookSourceID? {
        if hasPrefix("bookSource.") {
            return String(dropFirst("bookSource.".count))
        }
        if hasPrefix("pin.bookSource:") {
            return String(dropFirst("pin.bookSource:".count))
        }
        return nil
    }
}

#endif
