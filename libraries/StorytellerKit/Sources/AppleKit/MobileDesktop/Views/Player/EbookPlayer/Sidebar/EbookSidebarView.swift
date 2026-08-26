#if os(macOS)
import SwiftUI

enum EbookSidebarTab: String, CaseIterable {
    case navigation
    case annotations
    case bookInfo

    var title: String {
        switch self {
            case .navigation: return "Navigation"
            case .annotations: return "Annotations"
            case .bookInfo: return "Book Info"
        }
    }
}

struct EbookSidebarTheme {
    let foreground: Color
    let accent: Color
    let secondary: Color
    let tertiary: Color

    var rowHighlight: Color { accent.opacity(0.14) }
}

struct EbookSidebarView: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme
    // Clears the traffic lights and toggle button floating over full-size content.
    var topInset: CGFloat = 0
    var quickBookSwitcher: AnyView? = nil

    @AppStorage("EbookPlayerSidebarTab")
    private var tabRaw = EbookSidebarTab.navigation.rawValue

    private var selectedTab: EbookSidebarTab {
        EbookSidebarTab(rawValue: tabRaw) ?? .navigation
    }

    var body: some View {
        VStack(spacing: 0) {
            tabPicker
                .padding(.horizontal, 12)
                .padding(.top, topInset + 10)
                .padding(.bottom, 8)

            Divider()

            switch selectedTab {
                case .navigation:
                    SidebarNavigationTab(
                        viewModel: viewModel,
                        sidebarModel: sidebarModel,
                        theme: theme,
                    )
                case .annotations:
                    SidebarAnnotationsTab(
                        viewModel: viewModel,
                        sidebarModel: sidebarModel,
                        theme: theme,
                    )
                case .bookInfo:
                    SidebarBookInfoTab(viewModel: viewModel, theme: theme)
            }

            if let quickBookSwitcher {
                Divider()
                quickBookSwitcher
            }
        }
        .onAppear { sidebarModel.startObservingVisits() }
        .onDisappear { sidebarModel.stopObservingVisits() }
    }

    private var tabPicker: some View {
        HStack(spacing: 6) {
            ForEach(EbookSidebarTab.allCases, id: \.self) { tab in
                Button {
                    tabRaw = tab.rawValue
                } label: {
                    Text(tab.title)
                        .font(.subheadline)
                        .fontWeight(selectedTab == tab ? .semibold : .regular)
                        .foregroundStyle(selectedTab == tab ? theme.foreground : theme.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(
                                    selectedTab == tab
                                        ? theme.foreground.opacity(0.12)
                                        : theme.foreground.opacity(0.05)
                                )
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct SidebarSubTabPicker<Tab: Hashable>: View {
    let tabs: [(tab: Tab, title: String)]
    let selected: Tab
    let theme: EbookSidebarTheme
    let onSelect: (Tab) -> Void

    var body: some View {
        HStack(spacing: 14) {
            ForEach(tabs, id: \.tab) { entry in
                Button {
                    onSelect(entry.tab)
                } label: {
                    VStack(spacing: 3) {
                        Text(entry.title)
                            .font(.subheadline)
                            .fontWeight(selected == entry.tab ? .semibold : .regular)
                            .foregroundStyle(
                                selected == entry.tab ? theme.foreground : theme.secondary)
                        Rectangle()
                            .fill(selected == entry.tab ? theme.accent : Color.clear)
                            .frame(height: 2)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}
#endif
