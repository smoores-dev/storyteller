#if os(macOS)
import SwiftUI

struct CustomizeSidebarView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(MediaViewModel.self) private var mediaViewModel
    @State private var groups: [SidebarConfigGroup]
    @State private var editingItemId: String?
    @State private var editingGroupId: UUID?
    @State private var homeSectionConfig: [HomeSectionConfigItem] = HomeSectionConfigHelper.config
    @State private var homePopoverVisible: Bool = false
    @FocusState private var focusedItemId: String?
    @FocusState private var focusedGroupId: UUID?

    private let defaultLookup = SidebarConfigHelper.defaultItemLookup
    private let showHomeSectionsOnAppear: Bool

    init(showHomeSectionsOnAppear: Bool = false) {
        _groups = State(initialValue: SidebarConfigHelper.config)
        self.showHomeSectionsOnAppear = showHomeSectionsOnAppear
    }

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider()
            contentArea
            Divider()
            footerBar
        }
        .frame(width: 450, height: 600)
        .background(Color(nsColor: .controlBackgroundColor))
        .onAppear {
            syncBookSourceItems()
            if showHomeSectionsOnAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    homePopoverVisible = true
                }
            }
        }
        .onChange(of: mediaViewModel.bookSources) {
            syncBookSourceItems()
        }
    }

    private var headerBar: some View {
        HStack {
            Text("Customize Sidebar")
                .font(.headline)
            Spacer()
        }
        .padding()
    }

    private var contentArea: some View {
        List {
            ForEach(Array(groups.enumerated()), id: \.element.id) { groupIndex, group in
                Section {
                    ForEach(Array(group.items.enumerated()), id: \.element.id) { itemIndex, item in
                        itemRow(item: item, groupIndex: groupIndex, itemIndex: itemIndex)
                    }
                    .onMove { from, to in
                        groups[groupIndex].items.move(fromOffsets: from, toOffset: to)
                    }
                } header: {
                    groupHeader(group: group, groupIndex: groupIndex)
                }
            }

            Section {
                Button {
                    groups.append(SidebarConfigGroup(name: "New Group"))
                } label: {
                    Label("Add Group", systemImage: "plus.circle")
                        .font(.callout)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    @ViewBuilder
    private func groupHeader(group: SidebarConfigGroup, groupIndex: Int) -> some View {
        HStack {
            if editingGroupId == group.id {
                TextField(
                    "Group Name",
                    text: Binding(
                        get: { groups[groupIndex].name },
                        set: { groups[groupIndex].name = $0 },
                    ),
                )
                .textFieldStyle(.roundedBorder)
                .font(.subheadline.weight(.semibold))
                .focused($focusedGroupId, equals: group.id)
                .onSubmit {
                    editingGroupId = nil
                    focusedGroupId = nil
                }

                Button {
                    editingGroupId = nil
                    focusedGroupId = nil
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                .buttonStyle(.plain)
            } else {
                Text(group.name)
                    .font(.subheadline.weight(.semibold))

                Button {
                    editingGroupId = group.id
                    focusedGroupId = group.id
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Spacer()

            if groups.count > 1 {
                Button {
                    guard groupIndex > 0 else { return }
                    groups.swapAt(groupIndex, groupIndex - 1)
                } label: {
                    Image(systemName: "chevron.up")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .disabled(groupIndex == 0)
                .help("Move group up")

                Button {
                    guard groupIndex < groups.count - 1 else { return }
                    groups.swapAt(groupIndex, groupIndex + 1)
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .disabled(groupIndex == groups.count - 1)
                .help("Move group down")
            }

            if groups.count > 1 || group.items.isEmpty {
                Button(role: .destructive) {
                    deleteGroup(at: groupIndex)
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                .buttonStyle(.plain)
                .help("Delete group")
            }
        }
    }

    @ViewBuilder
    private func itemRow(item: SidebarConfigItem, groupIndex: Int, itemIndex: Int) -> some View {
        if item.id == SidebarConfigHelper.newPinLocationMarker {
            markerRow(groupIndex: groupIndex, itemIndex: itemIndex)
        } else if item.id.hasPrefix("bookSource.") {
            bookSourceItemRow(item: item, groupIndex: groupIndex, itemIndex: itemIndex)
        } else if item.id.hasPrefix("pin.") {
            pinItemRow(item: item, groupIndex: groupIndex, itemIndex: itemIndex)
        } else {
            permanentItemRow(item: item, groupIndex: groupIndex, itemIndex: itemIndex)
        }
    }

    private func markerRow(groupIndex: Int, itemIndex: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .font(.system(size: 12, weight: .bold))

            Image(systemName: "pin.circle")
                .foregroundStyle(.orange)
                .font(.callout)

            Text("Default location for new pins")
                .font(.callout)
                .foregroundStyle(.secondary)
                .italic()

            Spacer()

            moveMenu(groupIndex: groupIndex, itemIndex: itemIndex)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
    }

    @ViewBuilder
    private func permanentItemRow(item: SidebarConfigItem, groupIndex: Int, itemIndex: Int)
        -> some View
    {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .font(.system(size: 12, weight: .bold))

            visibilityButton(groupIndex: groupIndex, itemIndex: itemIndex, visible: item.visible)

            let resolved = defaultLookup[item.id]

            if editingItemId == item.id {
                let defaultName = resolved?.name ?? item.id
                TextField(
                    defaultName,
                    text: Binding(
                        get: { groups[groupIndex].items[itemIndex].alias ?? "" },
                        set: { groups[groupIndex].items[itemIndex].alias = $0.isEmpty ? nil : $0 },
                    ),
                )
                .textFieldStyle(.roundedBorder)
                .font(.callout)
                .focused($focusedItemId, equals: item.id)
                .onSubmit {
                    editingItemId = nil
                    focusedItemId = nil
                }

                Button {
                    editingItemId = nil
                    focusedItemId = nil
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                .buttonStyle(.plain)
            } else {
                if let icon = resolved?.systemImage {
                    Image(systemName: icon)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(width: 16)
                }

                Text(displayName(for: item))
                    .font(.callout)
                    .foregroundStyle(item.visible ? .primary : .secondary)
                    .strikethrough(!item.visible)

                Button {
                    editingItemId = item.id
                    focusedItemId = item.id
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Rename")

                if item.alias != nil && !item.alias!.isEmpty {
                    Button {
                        groups[groupIndex].items[itemIndex].alias = nil
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Revert to default name")
                }
            }

            Spacer()

            if item.id == "home" {
                Button {
                    homePopoverVisible.toggle()
                } label: {
                    Image(systemName: "gearshape")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Configure home sections")
                .popover(isPresented: $homePopoverVisible, arrowEdge: .trailing) {
                    homeSectionsPopoverContent
                }
            }

            moveMenu(groupIndex: groupIndex, itemIndex: itemIndex)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    @ViewBuilder
    private func bookSourceItemRow(item: SidebarConfigItem, groupIndex: Int, itemIndex: Int)
        -> some View
    {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .font(.system(size: 12, weight: .bold))

            visibilityButton(groupIndex: groupIndex, itemIndex: itemIndex, visible: item.visible)

            let source = bookSource(for: item.id)

            if editingItemId == item.id {
                let defaultName = source?.name ?? "Book Source"
                TextField(
                    defaultName,
                    text: Binding(
                        get: { groups[groupIndex].items[itemIndex].alias ?? "" },
                        set: { groups[groupIndex].items[itemIndex].alias = $0.isEmpty ? nil : $0 },
                    ),
                )
                .textFieldStyle(.roundedBorder)
                .font(.callout)
                .focused($focusedItemId, equals: item.id)
                .onSubmit {
                    editingItemId = nil
                    focusedItemId = nil
                }

                Button {
                    editingItemId = nil
                    focusedItemId = nil
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                .buttonStyle(.plain)
            } else {
                Image(systemName: source?.kind == .storyteller ? "server.rack" : "folder")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(width: 16)

                Text(displayName(for: item))
                    .font(.callout)
                    .foregroundStyle(item.visible ? .primary : .secondary)
                    .strikethrough(!item.visible)

                Button {
                    editingItemId = item.id
                    focusedItemId = item.id
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Rename")

                if let alias = item.alias, !alias.isEmpty {
                    Button {
                        groups[groupIndex].items[itemIndex].alias = nil
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Revert to source name")
                }
            }

            Spacer()

            moveMenu(groupIndex: groupIndex, itemIndex: itemIndex)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    @ViewBuilder
    private func pinItemRow(item: SidebarConfigItem, groupIndex: Int, itemIndex: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal")
                .foregroundStyle(.tertiary)
                .font(.system(size: 12, weight: .bold))

            visibilityButton(groupIndex: groupIndex, itemIndex: itemIndex, visible: item.visible)

            if editingItemId == item.id {
                let defaultName = resolveDefaultPinName(for: item.id)
                TextField(
                    defaultName,
                    text: Binding(
                        get: { groups[groupIndex].items[itemIndex].alias ?? "" },
                        set: { groups[groupIndex].items[itemIndex].alias = $0.isEmpty ? nil : $0 },
                    ),
                )
                .textFieldStyle(.roundedBorder)
                .font(.callout)
                .focused($focusedItemId, equals: item.id)
                .onSubmit {
                    editingItemId = nil
                    focusedItemId = nil
                }

                Button {
                    editingItemId = nil
                    focusedItemId = nil
                } label: {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                .buttonStyle(.plain)
            } else {
                if let icon = pinSystemImage(for: item.id) {
                    Image(systemName: icon)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(width: 16)
                }

                Text(displayName(for: item))
                    .font(.callout)
                    .foregroundStyle(item.visible ? .primary : .secondary)
                    .strikethrough(!item.visible)

                Button {
                    editingItemId = item.id
                    focusedItemId = item.id
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Rename")

                if item.alias != nil && !item.alias!.isEmpty {
                    Button {
                        groups[groupIndex].items[itemIndex].alias = nil
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                    .help("Revert to default name")
                }
            }

            Spacer()

            moveMenu(groupIndex: groupIndex, itemIndex: itemIndex)

            Button(role: .destructive) {
                groups[groupIndex].items.remove(at: itemIndex)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    private func visibilityButton(groupIndex: Int, itemIndex: Int, visible: Bool) -> some View {
        Button {
            groups[groupIndex].items[itemIndex].visible.toggle()
        } label: {
            Image(systemName: visible ? "eye" : "eye.slash")
                .font(.system(size: 10))
                .foregroundStyle(visible ? .secondary : .tertiary)
                .frame(width: 16)
        }
        .buttonStyle(.plain)
        .help(visible ? "Hide" : "Show")
    }

    @ViewBuilder
    private func moveMenu(groupIndex: Int, itemIndex: Int) -> some View {
        if groups.count > 1 {
            Menu {
                ForEach(Array(groups.enumerated()), id: \.element.id) { targetIndex, targetGroup in
                    if targetIndex != groupIndex {
                        Button("Move to \(targetGroup.name)") {
                            let item = groups[groupIndex].items.remove(at: itemIndex)
                            groups[targetIndex].items.append(item)
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .frame(width: 20)
        }
    }

    private func deleteGroup(at index: Int) {
        let group = groups[index]
        if !group.items.isEmpty && groups.count > 1 {
            let targetIndex = index + 1 < groups.count ? index + 1 : index - 1
            groups[targetIndex].items.append(contentsOf: group.items)
        }
        groups.remove(at: index)
    }

    @ViewBuilder
    private var homeSectionsPopoverContent: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Home Sections")
                .font(.headline)
                .padding(.bottom, 4)

            List {
                ForEach(homeSectionConfig) { item in
                    HStack(spacing: 8) {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                        Toggle(
                            isOn: Binding(
                                get: { item.visible },
                                set: { newValue in
                                    if let idx = homeSectionConfig.firstIndex(where: {
                                        $0.id == item.id
                                    }) {
                                        homeSectionConfig[idx].visible = newValue
                                        HomeSectionConfigHelper.save(homeSectionConfig)
                                    }
                                },
                            )
                        ) {
                            Label(
                                homeSectionDisplayName(for: item.id),
                                systemImage: HomeSectionConfigHelper.systemImage(for: item.id),
                            )
                        }
                    }
                }
                .onMove { from, to in
                    homeSectionConfig.move(fromOffsets: from, toOffset: to)
                    HomeSectionConfigHelper.save(homeSectionConfig)
                }
            }
            .listStyle(.plain)
            .frame(height: CGFloat(homeSectionConfig.count) * 34)
        }
        .padding(12)
        .frame(minWidth: 260)
    }

    private func homeSectionDisplayName(for id: String) -> String {
        if id.hasPrefix("pin.smartShelf:") {
            let uuidString = String(id.dropFirst("pin.smartShelf:".count))
            if let uuid = UUID(uuidString: uuidString),
                let shelf = mediaViewModel.smartShelves.first(where: { $0.id == uuid })
            {
                return shelf.name
            }
            return id
        }
        return HomeSectionConfigHelper.displayName(for: id)
    }

    private func displayName(for item: SidebarConfigItem) -> String {
        if let alias = item.alias, !alias.isEmpty {
            return alias
        }
        if item.id.hasPrefix("bookSource.") {
            return bookSource(for: item.id)?.name ?? "Book Source"
        }
        if item.id.hasPrefix("pin.") {
            return resolveDefaultPinName(for: item.id)
        }
        return defaultLookup[item.id]?.name ?? item.id
    }

    private func resolveDefaultPinName(for id: String) -> String {
        if id.hasPrefix("pin.sidebar:") {
            let stableId = String(id.dropFirst("pin.sidebar:".count))
            return defaultLookup[stableId]?.name ?? stableId
        }
        if id.hasPrefix("pin.smartShelf:") {
            let uuidString = String(id.dropFirst("pin.smartShelf:".count))
            if let uuid = UUID(uuidString: uuidString),
                let shelf = mediaViewModel.smartShelves.first(where: { $0.id == uuid })
            {
                return shelf.name
            }
            return "Smart Shelf"
        }
        if id.hasPrefix("pin.series:") { return String(id.dropFirst("pin.series:".count)) }
        if id.hasPrefix("pin.author:") { return String(id.dropFirst("pin.author:".count)) }
        if id.hasPrefix("pin.collection:") { return String(id.dropFirst("pin.collection:".count)) }
        if id.hasPrefix("pin.tag:") { return String(id.dropFirst("pin.tag:".count)) }
        if id.hasPrefix("pin.narrator:") { return String(id.dropFirst("pin.narrator:".count)) }
        if id.hasPrefix("pin.translator:") { return String(id.dropFirst("pin.translator:".count)) }
        if id.hasPrefix("pin.year:") { return String(id.dropFirst("pin.year:".count)) }
        if id.hasPrefix("pin.rating:") {
            let rating = String(id.dropFirst("pin.rating:".count))
            return RatingDisplayHelper.label(for: rating)
        }
        if id.hasPrefix("pin.status:") { return String(id.dropFirst("pin.status:".count)) }
        return id
    }

    private func pinSystemImage(for id: String) -> String? {
        if id.hasPrefix("pin.sidebar:") {
            let stableId = String(id.dropFirst("pin.sidebar:".count))
            return defaultLookup[stableId]?.systemImage
        }
        if id.hasPrefix("pin.series:") { return "books.vertical" }
        if id.hasPrefix("pin.author:") { return "person.2" }
        if id.hasPrefix("pin.collection:") { return "rectangle.stack" }
        if id.hasPrefix("pin.tag:") { return "tag" }
        if id.hasPrefix("pin.narrator:") { return "mic" }
        if id.hasPrefix("pin.translator:") { return "character.book.closed.fill" }
        if id.hasPrefix("pin.year:") { return "calendar" }
        if id.hasPrefix("pin.rating:") { return "star" }
        if id.hasPrefix("pin.status:") {
            let status = String(id.dropFirst("pin.status:".count))
            switch status.lowercased() {
                case "reading": return "arrow.right.circle.fill"
                case "to read": return "bookmark.fill"
                case "read": return "checkmark.circle.fill"
                default: return "questionmark.circle.fill"
            }
        }
        if id.hasPrefix("pin.smartShelf:") { return "sparkles.rectangle.stack" }
        return nil
    }

    private func syncBookSourceItems() {
        let sources = mediaViewModel.bookSources
        let sourceIDs = Set(sources.map(\.id))
        var didChange = false

        for groupIndex in groups.indices {
            let filteredItems = groups[groupIndex].items.filter { item in
                guard let sourceID = bookSourceID(from: item.id) else { return true }
                return sourceIDs.contains(sourceID)
            }
            if filteredItems.count != groups[groupIndex].items.count {
                groups[groupIndex].items = filteredItems
                didChange = true
            }
        }

        let configuredSourceIDs = Set(
            groups
                .flatMap(\.items)
                .compactMap { bookSourceID(from: $0.id) }
        )
        let missingSources = sources.filter { !configuredSourceIDs.contains($0.id) }
        guard !missingSources.isEmpty || didChange else { return }

        if !missingSources.isEmpty {
            if let mediaSourcesIndex = groups.firstIndex(where: { $0.name == "Media Sources" }) {
                groups[mediaSourcesIndex].items.append(
                    contentsOf: missingSources.map {
                        SidebarConfigItem(id: "bookSource.\($0.id)", permanent: true)
                    }
                )
            } else {
                groups.append(
                    SidebarConfigGroup(
                        name: "Media Sources",
                        items: missingSources.map {
                            SidebarConfigItem(id: "bookSource.\($0.id)", permanent: true)
                        },
                    )
                )
            }
        }
    }

    private func bookSource(for itemID: String) -> BookSourceRecord? {
        guard let sourceID = bookSourceID(from: itemID) else { return nil }
        return mediaViewModel.bookSources.first { $0.id == sourceID }
    }

    private func bookSourceID(from itemID: String) -> BookSourceID? {
        guard itemID.hasPrefix("bookSource.") else { return nil }
        return String(itemID.dropFirst("bookSource.".count))
    }

    private var footerBar: some View {
        HStack {
            Button("Reset to Defaults") {
                let existingPins = groups.flatMap { $0.items.filter { $0.id.hasPrefix("pin.") } }
                var defaults = SidebarConfigHelper.defaultConfig()
                if !existingPins.isEmpty,
                    let pinsGroupIndex = defaults.firstIndex(where: {
                        $0.items.contains { $0.id == SidebarConfigHelper.newPinLocationMarker }
                    }),
                    let markerIndex = defaults[pinsGroupIndex].items.firstIndex(where: {
                        $0.id == SidebarConfigHelper.newPinLocationMarker
                    })
                {
                    defaults[pinsGroupIndex].items.insert(
                        contentsOf: existingPins,
                        at: markerIndex,
                    )
                }
                groups = defaults
            }
            .foregroundStyle(.secondary)

            Spacer()

            Button("Cancel") {
                dismiss()
            }
            .keyboardShortcut(.cancelAction)

            Button("Save") {
                SidebarConfigHelper.config = groups
                dismiss()
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding()
    }
}
#endif
