#if os(macOS)
import SwiftUI

enum EbookSidebarNavTab: String, CaseIterable {
    case toc
    case images
    case history
    case spine

    var title: String {
        switch self {
            case .toc: return "ToC"
            case .images: return "Images"
            case .history: return "History"
            case .spine: return "Spine"
        }
    }
}

struct SidebarNavigationTab: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    @AppStorage("EbookPlayerSidebarNavTab")
    private var navTabRaw = EbookSidebarNavTab.toc.rawValue

    private var selectedTab: EbookSidebarNavTab {
        let tab = EbookSidebarNavTab(rawValue: navTabRaw) ?? .toc
        if tab == .images && viewModel.isComicBook {
            return .toc
        }
        return tab
    }

    private var availableTabs: [(tab: EbookSidebarNavTab, title: String)] {
        EbookSidebarNavTab.allCases
            .filter { $0 != .images || !viewModel.isComicBook }
            .map { ($0, $0.title) }
    }

    var body: some View {
        VStack(spacing: 0) {
            SidebarSubTabPicker(
                tabs: availableTabs,
                selected: selectedTab,
                theme: theme,
                onSelect: { navTabRaw = $0.rawValue },
            )

            DebouncedSearchField(
                placeholder: "Search book",
                searchText: Bindable(sidebarModel).navSearchText,
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if !sidebarModel.navSearchText.isEmpty {
                SidebarSearchResults(
                    viewModel: viewModel,
                    theme: theme,
                    query: sidebarModel.navSearchText,
                )
            } else {
                paneContent
            }
        }
        .task(id: "\(viewModel.bookStructure.count)-\(viewModel.extractedEbookPath?.path ?? "")") {
            sidebarModel.deriveSectionDurations(structure: viewModel.bookStructure)
            await sidebarModel.loadSpineFileSizes(
                structure: viewModel.bookStructure,
                root: viewModel.extractedEbookPath,
            )
        }
    }

    @ViewBuilder
    private var paneContent: some View {
        switch selectedTab {
            case .toc:
                SidebarTocList(
                    viewModel: viewModel,
                    sidebarModel: sidebarModel,
                    theme: theme,
                )
            case .spine:
                SidebarSpineList(
                    viewModel: viewModel,
                    sidebarModel: sidebarModel,
                    theme: theme,
                )
            case .images:
                SidebarImagesGrid(
                    viewModel: viewModel,
                    sidebarModel: sidebarModel,
                    theme: theme,
                )
            case .history:
                SidebarHistoryList(
                    viewModel: viewModel,
                    sidebarModel: sidebarModel,
                    theme: theme,
                )
        }
    }
}
#endif
