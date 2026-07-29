#if os(iOS) || os(macOS)
import SwiftUI

struct CategoryGridLayout<Header: View, StickyHeader: View, ContextMenu: View>: View {
    let groups: [CategoryGroup]
    let mediaKind: MediaKind
    let coverPreference: CoverPreference
    let sortByCount: Bool
    let showBookCountBadge: Bool
    let onNavigate: (CategoryGroup, BookMetadata?) -> Void
    @ViewBuilder let header: () -> Header
    @ViewBuilder let stickyHeader: () -> StickyHeader
    let contextMenuBuilder: ((CategoryGroup) -> ContextMenu)?

    @State private var showStickyControls: Bool = false

    private let horizontalPadding: CGFloat = 24

    init(
        groups: [CategoryGroup],
        mediaKind: MediaKind,
        coverPreference: CoverPreference,
        sortByCount: Bool = false,
        showBookCountBadge: Bool,
        onNavigate: @escaping (CategoryGroup, BookMetadata?) -> Void,
        @ViewBuilder header: @escaping () -> Header = { EmptyView() },
        @ViewBuilder stickyHeader: @escaping () -> StickyHeader = { EmptyView() },
        @ViewBuilder contextMenuBuilder: @escaping (CategoryGroup) -> ContextMenu,
    ) {
        self.groups = groups
        self.mediaKind = mediaKind
        self.coverPreference = coverPreference
        self.sortByCount = sortByCount
        self.showBookCountBadge = showBookCountBadge
        self.onNavigate = onNavigate
        self.header = header
        self.stickyHeader = stickyHeader
        self.contextMenuBuilder = contextMenuBuilder
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

    var body: some View {
        GeometryReader { geometry in
            let contentWidth = geometry.size.width

            #if os(macOS)
            ZStack(alignment: .top) {
                scrollContent(contentWidth: contentWidth)
                if showStickyControls {
                    stickyHeaderOverlay
                        .transition(.opacity)
                }
            }
            .ignoresSafeArea(.container, edges: .top)
            #else
            scrollContent(contentWidth: contentWidth)
            #endif
        }
    }

    @ViewBuilder
    private func scrollContent(contentWidth: CGFloat) -> some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: 24) {
                header()
                    .padding(.horizontal, horizontalPadding)

                let columns = [
                    GridItem(.adaptive(minimum: 125, maximum: 140), spacing: 16)
                ]

                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(sortedGroups) { group in
                        GroupedBooksCardView(
                            title: group.name,
                            books: group.books,
                            mediaKind: mediaKind,
                            coverPreference: coverPreference,
                            showBookCountBadge: showBookCountBadge,
                            pinId: group.pinId,
                            onTap: {
                                onNavigate(group, nil)
                            },
                        )
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
                            if let menuContent = contextMenuBuilder?(group) {
                                if group.pinId != nil {
                                    Divider()
                                }
                                menuContent
                            }
                        }
                        .id(group.id)
                    }
                }
                .padding(.horizontal, horizontalPadding)
            }
            .padding(.bottom, 40)
        }
        #if os(macOS)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentOffset.y
        } action: { _, newValue in
            let threshold: CGFloat = 60
            let shouldShow = newValue > threshold
            if shouldShow != showStickyControls {
                withAnimation(.easeInOut(duration: 0.15)) {
                    showStickyControls = shouldShow
                }
            }
        }
        .contentMargins(.top, 52, for: .scrollContent)
        #endif
        .frame(width: contentWidth)
        .contentMargins(.trailing, 10, for: .scrollIndicators)
        .modifier(SoftScrollEdgeModifier())
    }

    #if os(macOS)
    private var stickyHeaderOverlay: some View {
        stickyHeader()
            .padding(.horizontal, horizontalPadding)
            .padding(.top, 8)
            .padding(.bottom, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(stickyHeaderBackground)
    }

    @ViewBuilder
    private var stickyHeaderBackground: some View {
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
                            .init(color: .black.opacity(0.75), location: 0),
                            .init(color: .black.opacity(0.5), location: 0.5),
                            .init(color: .black.opacity(0), location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom,
                    )
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
}

extension CategoryGridLayout where StickyHeader == EmptyView, ContextMenu == EmptyView {
    init(
        groups: [CategoryGroup],
        mediaKind: MediaKind,
        coverPreference: CoverPreference,
        sortByCount: Bool = false,
        showBookCountBadge: Bool,
        onNavigate: @escaping (CategoryGroup, BookMetadata?) -> Void,
        @ViewBuilder header: @escaping () -> Header = { EmptyView() },
    ) {
        self.groups = groups
        self.mediaKind = mediaKind
        self.coverPreference = coverPreference
        self.sortByCount = sortByCount
        self.showBookCountBadge = showBookCountBadge
        self.onNavigate = onNavigate
        self.header = header
        self.stickyHeader = { EmptyView() }
        self.contextMenuBuilder = nil
    }
}

#endif
