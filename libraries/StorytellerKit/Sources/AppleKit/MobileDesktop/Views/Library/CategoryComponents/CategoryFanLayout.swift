#if os(iOS) || os(macOS)
import SwiftUI

struct CategoryFanLayout<Header: View, StickyHeader: View, ContextMenu: View>: View {
    let groups: [CategoryGroup]
    let mediaKind: MediaKind
    let coverPreference: CoverPreference
    let sortByCount: Bool
    let onNavigate: (CategoryGroup, BookMetadata?) -> Void
    @ViewBuilder let header: () -> Header
    @ViewBuilder let stickyHeader: () -> StickyHeader
    let contextMenuBuilder: ((CategoryGroup) -> ContextMenu)?

    @State private var showStickyControls: Bool = false

    private let sectionSpacing: CGFloat = 32
    private let horizontalPadding: CGFloat = 24

    init(
        groups: [CategoryGroup],
        mediaKind: MediaKind,
        coverPreference: CoverPreference,
        sortByCount: Bool = false,
        onNavigate: @escaping (CategoryGroup, BookMetadata?) -> Void,
        @ViewBuilder header: @escaping () -> Header = { EmptyView() },
        @ViewBuilder stickyHeader: @escaping () -> StickyHeader = { EmptyView() },
        @ViewBuilder contextMenuBuilder: @escaping (CategoryGroup) -> ContextMenu,
    ) {
        self.groups = groups
        self.mediaKind = mediaKind
        self.coverPreference = coverPreference
        self.sortByCount = sortByCount
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
            let stackWidth = max(contentWidth - (horizontalPadding * 2), 100)

            #if os(macOS)
            ZStack(alignment: .top) {
                scrollContent(contentWidth: contentWidth, stackWidth: stackWidth)
                if showStickyControls {
                    stickyHeaderOverlay
                        .transition(.opacity)
                }
            }
            .ignoresSafeArea(.container, edges: .top)
            #else
            scrollContent(contentWidth: contentWidth, stackWidth: stackWidth)
            #endif
        }
    }

    @ViewBuilder
    private func scrollContent(contentWidth: CGFloat, stackWidth: CGFloat) -> some View {
        ScrollView(.vertical, showsIndicators: true) {
            VStack(alignment: .leading, spacing: sectionSpacing) {
                header()
                    .padding(.horizontal, horizontalPadding)

                LazyVStack(alignment: .leading, spacing: sectionSpacing) {
                    ForEach(sortedGroups) { group in
                        CategoryFanSection(
                            group: group,
                            mediaKind: mediaKind,
                            stackWidth: stackWidth,
                            coverPreference: coverPreference,
                            onNavigate: onNavigate,
                            contextMenu: contextMenuBuilder?(group),
                        )
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

extension CategoryFanLayout where StickyHeader == EmptyView, ContextMenu == EmptyView {
    init(
        groups: [CategoryGroup],
        mediaKind: MediaKind,
        coverPreference: CoverPreference,
        sortByCount: Bool = false,
        onNavigate: @escaping (CategoryGroup, BookMetadata?) -> Void,
        @ViewBuilder header: @escaping () -> Header = { EmptyView() },
    ) {
        self.groups = groups
        self.mediaKind = mediaKind
        self.coverPreference = coverPreference
        self.sortByCount = sortByCount
        self.onNavigate = onNavigate
        self.header = header
        self.stickyHeader = { EmptyView() }
        self.contextMenuBuilder = nil
    }
}

struct CategoryFanSection<ContextMenu: View>: View {
    let group: CategoryGroup
    let mediaKind: MediaKind
    let stackWidth: CGFloat
    let coverPreference: CoverPreference
    let onNavigate: (CategoryGroup, BookMetadata?) -> Void
    let contextMenu: ContextMenu?

    @State private var settingsViewModel = SettingsViewModel()
    @State private var isCoverHovered = false
    @State private var isTitleHovered = false

    var body: some View {
        VStack(alignment: .center, spacing: 12) {
            SeriesStackView(
                books: group.books,
                mediaKind: mediaKind,
                availableWidth: stackWidth,
                showAudioIndicator: settingsViewModel.showAudioIndicator,
                coverPreference: coverPreference,
                onSelect: { book in
                    onNavigate(group, book)
                },
                onInfo: { book in
                    onNavigate(group, book)
                },
            )
            .frame(maxWidth: stackWidth, alignment: .center)
            .onHover { hovering in
                isCoverHovered = hovering
            }

            VStack(alignment: .center, spacing: 6) {
                HStack(spacing: 6) {
                    Button {
                        onNavigate(group, nil)
                    } label: {
                        Text(group.name)
                            .font(.system(size: 20, weight: .regular))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)

                }

                Text("\(group.books.count) book\(group.books.count == 1 ? "" : "s")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(.top, 8)
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
            .onHover { hovering in
                isTitleHovered = hovering
            }
        }
        .frame(maxWidth: .infinity)
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
