#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
private struct OpenSettingsButton: View {
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Button {
            SettingsTabRequest.shared.requestReaderSettings()
            openSettings()
        } label: {
            Label("Customize Reader", systemImage: "textformat.size")
                .labelStyle(.iconOnly)
        }
        .help("Reader Settings")
        .keyboardShortcut(",", modifiers: [.command, .shift])
    }
}

struct EbookPlayerToolbar: ToolbarContent {
    @Bindable var viewModel: EbookPlayerViewModel

    var body: some ToolbarContent {
        ToolbarItem(id: "chapter-sidebar-toggle", placement: .navigation) {
            Button {
                withAnimation(.easeInOut) { viewModel.showChapterSidebar.toggle() }
            } label: {
                Label("Toggle chapters", systemImage: "sidebar.leading")
                    .labelStyle(.iconOnly)
                    .symbolVariant(viewModel.showChapterSidebar ? .fill : .none)
            }
            .help("Toggle chapters")
        }
        ToolbarItem {
            Spacer()
        }
        ToolbarItem(id: "sidebar-toggle") {
            Button {
                withAnimation(.easeInOut) { viewModel.showAudioSidebar.toggle() }
            } label: {
                Label("Toggle sidebar", systemImage: "sidebar.trailing")
                    .labelStyle(.iconOnly)
                    .symbolVariant(viewModel.showAudioSidebar ? .fill : .none)
            }
            .help("Toggle sidebar")
        }
        if viewModel.hasAudioNarration {
            ToolbarItem(id: "sync-toggle") {
                Button {
                    viewModel.settingsVM.lockViewToAudio.toggle()
                    Task { try? await viewModel.settingsVM.save() }
                } label: {
                    Image(systemName: viewModel.settingsVM.lockViewToAudio ? "lock" : "lock.open")
                        .imageScale(.medium)
                        .foregroundStyle(
                            viewModel.settingsVM.lockViewToAudio
                                ? Color.primary : Color.gray.opacity(0.6)
                        )
                }
                .buttonStyle(.plain)
                .help(
                    viewModel.settingsVM.lockViewToAudio
                        ? "View locked to audio - click to allow free navigation when paused"
                        : "Free navigation when paused - click to lock view to audio"
                )
            }
        }
        ToolbarItem(id: "bookmarks-toggle") {
            Button {
                viewModel.bookmarksPanelInitialTab = .bookmarks
                withAnimation(.easeInOut) { viewModel.showBookmarksPanel.toggle() }
            } label: {
                Label("Bookmarks", systemImage: "bookmark")
                    .labelStyle(.iconOnly)
            }
            .help("Bookmarks & Highlights")
            .keyboardShortcut("b", modifiers: .command)
            .popover(isPresented: $viewModel.showBookmarksPanel) {
                BookmarksPanel(
                    bookmarks: viewModel.bookmarks,
                    highlights: viewModel.coloredHighlights,
                    onDismiss: { viewModel.showBookmarksPanel = false },
                    onNavigate: { highlight in
                        Task {
                            await viewModel.navigateToHighlight(highlight)
                            viewModel.showBookmarksPanel = false
                        }
                    },
                    onDelete: { highlight in
                        Task { await viewModel.deleteHighlight(highlight) }
                    },
                    onAddBookmark: {
                        Task { await viewModel.addBookmarkAtCurrentPage() }
                    },
                    highlightColorResolver: { color in
                        guard let color else { return Color.yellow.opacity(0.4) }
                        let hex = viewModel.settingsVM.hexColor(for: color)
                        return Color(hex: hex) ?? color.color
                    },
                    initialTab: viewModel.bookmarksPanelInitialTab,
                )
            }
        }
        ToolbarItem(id: "search-toggle") {
            Button {
                withAnimation(.easeInOut) { viewModel.showSearchPanel.toggle() }
            } label: {
                Label("Search", systemImage: "magnifyingglass")
                    .labelStyle(.iconOnly)
            }
            .help("Search in book")
            .keyboardShortcut("f", modifiers: .command)
            .popover(isPresented: $viewModel.showSearchPanel) {
                if let searchManager = viewModel.searchManager {
                    EbookSearchPanel(
                        searchManager: searchManager,
                        onDismiss: { viewModel.showSearchPanel = false },
                        onResultSelected: { result in
                            viewModel.handleSearchResultNavigation(result)
                        },
                    )
                    .frame(width: 350, height: 450)
                }
            }
        }
        ToolbarItem(id: "customize-toggle") {
            OpenSettingsButton()
        }
        ToolbarItem(id: "keybindings-help") {
            Button {
                withAnimation(.easeInOut) { viewModel.showKeybindingsPopover.toggle() }
            } label: {
                Label("Keybindings", systemImage: "questionmark.circle")
                    .labelStyle(.iconOnly)
            }
            .help("Keybindings")
            .popover(isPresented: $viewModel.showKeybindingsPopover) {
                EbookKeybindingsHelp()
                    .padding()
                    .frame(width: 280)
            }
        }
    }
}
#endif

#endif
