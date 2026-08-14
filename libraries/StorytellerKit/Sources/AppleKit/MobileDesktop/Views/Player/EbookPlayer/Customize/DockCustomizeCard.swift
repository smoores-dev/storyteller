#if os(iOS) || os(macOS)
import SwiftUI

struct DockCustomizeCard: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme

    @State private var selectedSlot: SlotRef?

    var body: some View {
        CustomizeCardContainer(title: "Dock", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                MiniPlayerPreviewFrame(
                    backgroundColor: pageBackground,
                    foregroundColor: pageForeground,
                    chromeOnCard: false,
                ) {
                    EbookDockIos(
                        leadingSlots: settingsVM.dockLeadingSlots,
                        trailingSlots: settingsVM.dockTrailingSlots,
                        centerSlots: settingsVM.dockCenterSlots,
                        dockTransparency: settingsVM.dockTransparency,
                        display: .sample,
                        backgroundColor: pageBackground,
                        positionAtTop: false,
                        actions: .noop,
                        editing: $selectedSlot,
                    )
                }
                .frame(height: 210)
                .padding(.horizontal, 10)
                .padding(.top, 4)

                optionsList

                CustomizePreviewDock(
                    settingsVM: settingsVM,
                    backgroundColor: pageBackground,
                    widget: .dock,
                )
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .sheet(item: $selectedSlot) { slot in
            ComplicationPickerSheet(
                slot: slot,
                current: settingsVM.slotComplication(slot),
                display: .sample,
                onSelect: { comp in
                    settingsVM.setSlotComplication(comp, at: slot)
                },
            )
        }
        .onAppear { settingsVM.normalizeSlotArrays() }
    }

    private func resetToDefaults() {
        let defaults = StorytellerGlobalConfig.ReadingBar()
        settingsVM.dockLeadingSlots = defaults.dockLeadingSlots
        settingsVM.dockTrailingSlots = defaults.dockTrailingSlots
        settingsVM.dockCenterSlots = defaults.dockCenterSlots
        settingsVM.dockTransparency = kDefaultDockTransparency
        settingsVM.progressIndicatorScopeDock = .chapter
        settingsVM.progressIndicatorDock = kDefaultProgressIndicatorDock
        settingsVM.progressIndicatorThicknessDock = kDefaultProgressIndicatorThickness
        settingsVM.normalizeSlotArrays()
        settingsVM.save()
    }

    private var optionsList: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Opacity: \(Int(settingsVM.dockTransparency * 100))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: Binding(
                            get: { settingsVM.dockTransparency },
                            set: { newValue in
                                settingsVM.dockTransparency = newValue
                                settingsVM.save()
                            },
                        ),
                        in: 0.1...1.0,
                        step: 0.05,
                    )
                }
            } header: {
                Text(
                    "Tap an outlined element above to choose what appears at that "
                        + "position. Set a slot to Empty to hide it."
                )
                .textCase(nil)
                .font(.footnote)
                .foregroundStyle(.secondary)
            } footer: {
                Text("Opacity sets how solid the dock looks over the page.")
            }

            ProgressIndicatorSection(
                settingsVM: settingsVM,
                toggleTitle: "Show with Dock",
                enabled: Binding(
                    get: { settingsVM.progressIndicatorDock },
                    set: { newValue in
                        settingsVM.progressIndicatorDock = newValue
                        settingsVM.save()
                    },
                ),
                scope: Binding(
                    get: { settingsVM.progressIndicatorScopeDock },
                    set: { newValue in
                        settingsVM.progressIndicatorScopeDock = newValue
                        settingsVM.save()
                    },
                ),
                thickness: Binding(
                    get: { settingsVM.progressIndicatorThicknessDock },
                    set: { newValue in
                        settingsVM.progressIndicatorThicknessDock = newValue
                        settingsVM.save()
                    },
                ),
            )
        }
    }

    private var pageBackground: Color { settingsVM.pageBackground(for: colorScheme) }
    private var pageForeground: Color { settingsVM.pageForeground(for: colorScheme) }
}
#endif
