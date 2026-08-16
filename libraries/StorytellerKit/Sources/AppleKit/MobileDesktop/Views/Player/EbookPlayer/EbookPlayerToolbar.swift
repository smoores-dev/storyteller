#if os(macOS)
import SwiftUI

struct EbookPlayerToolbar: ToolbarContent {
    @Bindable var viewModel: EbookPlayerViewModel
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    @Binding var customizeCard: CustomizeCard?

    private var visibleSlots: [PlayerComplication] {
        viewModel.settingsVM.menuBarSlots.filter {
            $0 != .none && (display.hasAudioNarration || !$0.requiresAudio)
        }
    }

    var body: some ToolbarContent {
        ToolbarItem(id: "chapter-sidebar-toggle", placement: .navigation) {
            Button {
                withAnimation(.easeInOut) { viewModel.showChapterSidebar.toggle() }
            } label: {
                Label("Toggle sidebar", systemImage: "sidebar.leading")
                    .labelStyle(.iconOnly)
                    .symbolVariant(viewModel.showChapterSidebar ? .fill : .none)
            }
            .help("Toggle sidebar")
        }
        ToolbarItem {
            Spacer()
        }
        ToolbarItemGroup(placement: .primaryAction) {
            ForEach(Array(visibleSlots.enumerated()), id: \.offset) { _, comp in
                PlayerComplicationView(
                    complication: comp,
                    display: display,
                    actions: actions,
                    style: .macToolbar,
                )
            }
        }
        if #available(macOS 26.0, *) {
            ToolbarSpacer(.fixed, placement: .primaryAction)
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Menu {
                CustomizeMenuContent(
                    customizeCard: $customizeCard,
                    settingsVM: viewModel.settingsVM,
                    hasAudioNarration: display.hasAudioNarration,
                    onShowKeybindings: { viewModel.showKeybindingsPopover = true },
                )
            } label: {
                Label("Customize", systemImage: "slider.horizontal.3")
                    .labelStyle(.iconOnly)
            }
            .help("Customize reader")

            Button {
                withAnimation(.easeInOut) { viewModel.showAudioSidebar.toggle() }
            } label: {
                Label("Toggle sidebar", systemImage: "sidebar.trailing")
                    .labelStyle(.iconOnly)
                    .symbolVariant(viewModel.showAudioSidebar ? .fill : .none)
            }
            .help("Toggle sidebar")
        }
    }
}
#endif
