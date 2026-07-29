#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
struct CategoryListSidebar<
    RowContent: View,
    DetailContent: View,
    ToolbarContent: View,
    ContextMenu: View,
>: View {
    let sidebarTitle: String
    let groups: [CategoryGroup]
    @Binding var selectedGroupId: String?
    @Binding var listWidth: CGFloat
    @Binding var sortByCount: Bool
    @ViewBuilder let rowContent: (CategoryGroup, Bool, Bool) -> RowContent
    @ViewBuilder let detailContent: (CategoryGroup) -> DetailContent
    @ViewBuilder let toolbarContent: () -> ToolbarContent
    let headerAccessory: AnyView?
    let contextMenuBuilder: ((CategoryGroup) -> ContextMenu)?

    init(
        sidebarTitle: String,
        groups: [CategoryGroup],
        selectedGroupId: Binding<String?>,
        listWidth: Binding<CGFloat>,
        sortByCount: Binding<Bool>,
        @ViewBuilder rowContent: @escaping (CategoryGroup, Bool, Bool) -> RowContent,
        @ViewBuilder detailContent: @escaping (CategoryGroup) -> DetailContent,
        @ViewBuilder toolbarContent: @escaping () -> ToolbarContent = { EmptyView() },
        headerAccessory: AnyView? = nil,
        @ViewBuilder contextMenuBuilder: @escaping (CategoryGroup) -> ContextMenu,
    ) {
        self.sidebarTitle = sidebarTitle
        self.groups = groups
        self._selectedGroupId = selectedGroupId
        self._listWidth = listWidth
        self._sortByCount = sortByCount
        self.rowContent = rowContent
        self.detailContent = detailContent
        self.toolbarContent = toolbarContent
        self.headerAccessory = headerAccessory
        self.contextMenuBuilder = contextMenuBuilder
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                headerSection
                sidebarList
            }
            .frame(width: listWidth)
            ResizableDivider(width: $listWidth, minWidth: 150, maxWidth: 400)
            contentArea
        }
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(sidebarTitle)
                .font(.storytellerTitle(size: 32))
                .lineLimit(1)
                .truncationMode(.tail)
            HStack {
                SidebarSortButton(sortByCount: $sortByCount)
                toolbarContent()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .font(.callout)

            if let headerAccessory {
                headerAccessory
                    .font(.callout)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 16)
    }

    private var sortedGroups: [CategoryGroup] {
        guard sortByCount else { return groups }
        return groups.sorted { lhs, rhs in
            if lhs.books.count != rhs.books.count {
                return lhs.books.count > rhs.books.count
            }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    private var sidebarList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(sortedGroups) { group in
                        CategoryListRow(
                            group: group,
                            isSelected: selectedGroupId == group.id,
                            rowContent: rowContent,
                            contextMenu: contextMenuBuilder?(group),
                            onSelect: { selectedGroupId = group.id },
                        )
                    }
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 16)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
    }

    @ViewBuilder
    private var contentArea: some View {
        if let groupId = selectedGroupId, let group = groups.first(where: { $0.id == groupId }) {
            detailContent(group)
                .id(groupId)
        } else {
            VStack {
                Spacer()
                Text("Select an item")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
    }
}

extension CategoryListSidebar where ContextMenu == EmptyView {
    init(
        sidebarTitle: String,
        groups: [CategoryGroup],
        selectedGroupId: Binding<String?>,
        listWidth: Binding<CGFloat>,
        sortByCount: Binding<Bool>,
        @ViewBuilder rowContent: @escaping (CategoryGroup, Bool, Bool) -> RowContent,
        @ViewBuilder detailContent: @escaping (CategoryGroup) -> DetailContent,
        @ViewBuilder toolbarContent: @escaping () -> ToolbarContent = { EmptyView() },
        headerAccessory: AnyView? = nil,
    ) {
        self.sidebarTitle = sidebarTitle
        self.groups = groups
        self._selectedGroupId = selectedGroupId
        self._listWidth = listWidth
        self._sortByCount = sortByCount
        self.rowContent = rowContent
        self.detailContent = detailContent
        self.toolbarContent = toolbarContent
        self.headerAccessory = headerAccessory
        self.contextMenuBuilder = nil
    }
}

private struct CategoryListRow<RowContent: View, ContextMenu: View>: View {
    let group: CategoryGroup
    let isSelected: Bool
    @ViewBuilder let rowContent: (CategoryGroup, Bool, Bool) -> RowContent
    let contextMenu: ContextMenu?
    let onSelect: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: onSelect) {
            rowContent(group, isSelected, isHovered)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            if let pinId = group.pinId {
                Button {
                    SidebarPinHelper.togglePin(pinId)
                } label: {
                    if SidebarPinHelper.isPinned(pinId) {
                        Label("Remove Pin", systemImage: "pin.slash")
                    } else {
                        Label("Pin", systemImage: "pin")
                    }
                }
            }
            if let menuContent = contextMenu {
                if group.pinId != nil {
                    Divider()
                }
                menuContent
            }
        }
    }
}

#endif

struct CategoryRowContent: View {
    let iconName: String
    let name: String
    let bookCount: Int
    let isSelected: Bool
    var showBookCount: Bool = true
    var pinId: String? = nil
    var isHovered: Bool = false

    #if os(macOS)
    @State private var isPinned: Bool = false
    #endif

    var body: some View {
        HStack {
            #if os(iOS)
            Image(systemName: iconName)
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(width: 28)
            #endif

            Text(name)
                #if os(iOS)
            .font(.body)
                #else
            .font(.system(size: 14))
                #endif
                .lineLimit(1)

            Spacer()

            if showBookCount {
                Text("\(bookCount)")
                    #if os(iOS)
                .font(.subheadline)
                    #else
                .font(.system(size: 12))
                    #endif
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(Color.secondary.opacity(0.15))
                    )
            }
        }
        #if os(iOS)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        #else
        .padding(.leading, 8)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isSelected ? Color.accentColor.opacity(0.2) : Color.clear)
        )
        .onAppear { isPinned = pinId.map { SidebarPinHelper.isPinned($0) } ?? false }
        .onReceive(NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)) {
            _ in
            let newValue = pinId.map { SidebarPinHelper.isPinned($0) } ?? false
            if isPinned != newValue { isPinned = newValue }
        }
        #endif
    }
}

#if os(iOS)
struct CategoryListView: View {
    let groups: [CategoryGroup]
    let onNavigate: (CategoryGroup) -> Void
    @ViewBuilder let rowContent: (CategoryGroup) -> AnyView

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(groups) { group in
                    Button {
                        onNavigate(group)
                    } label: {
                        rowContent(group)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Divider()
                        .padding(.leading, 48)
                }
            }
            .padding(.top, 8)
        }
    }
}
#endif

#endif
