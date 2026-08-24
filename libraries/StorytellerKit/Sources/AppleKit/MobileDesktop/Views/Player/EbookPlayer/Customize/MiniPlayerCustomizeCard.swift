#if os(iOS)
import SwiftUI

struct MiniPlayerCustomizeCard: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.readerPalette) private var readerPalette

    @State private var selectedSlot: SlotRef?
    @State private var showLeadingPicker = false

    private var paletteRowBackground: Color? {
        #if os(macOS)
        return nil
        #else
        return readerPalette.map { $0.resolved(for: colorScheme).cardBackground }
        #endif
    }

    var body: some View {
        CustomizeCardContainer(title: "Miniplayer", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    SizeDetentSlider(
                        size: Binding(
                            get: { settingsVM.miniPlayerSize },
                            set: { newValue in
                                settingsVM.miniPlayerSize = newValue
                                settingsVM.save()
                            },
                        )
                    )
                    .frame(height: 150)

                    MiniPlayerPreviewFrame(
                        backgroundColor: pageBackground,
                        foregroundColor: pageForeground,
                    ) {
                        editingCard
                    }
                    .frame(height: 240)
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)

                optionsList

                CustomizePreviewDock(
                    settingsVM: settingsVM,
                    backgroundColor: pageBackground,
                    widget: .miniPlayer,
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
                onConfigureTitleBlock: { showLeadingPicker = true },
            )
        }
        .sheet(isPresented: $showLeadingPicker) {
            LeadingStylePickerSheet(settingsVM: settingsVM, display: .sample)
        }
        .onAppear { settingsVM.normalizeSlotArrays() }
    }

    private func resetToDefaults() {
        let defaults = StorytellerGlobalConfig.MiniPlayer()
        settingsVM.miniPlayerSize = defaults.size
        settingsVM.miniPlayerLeadingStyle = defaults.leadingStyle
        settingsVM.miniPlayerCycleFirst = defaults.cycleFirst
        settingsVM.miniPlayerCycleSecond = defaults.cycleSecond
        settingsVM.miniPlayerCycleShowingSecond = defaults.cycleShowingSecond
        settingsVM.miniPlayerMirrored = defaults.mirrored
        settingsVM.miniPlayerContentRowSlots = defaults.contentRowSlots
        settingsVM.miniPlayerStatSlots = defaults.statSlots
        settingsVM.miniPlayerScrubRowSlots = defaults.scrubRowSlots
        settingsVM.miniPlayerExtraSlots = defaults.extraSlots
        settingsVM.alwaysShowMiniPlayer = kDefaultAlwaysShowMiniPlayer
        settingsVM.progressIndicatorMiniPlayer = kDefaultProgressIndicatorMiniPlayer
        settingsVM.progressIndicatorThickness = kDefaultProgressIndicatorThickness
        settingsVM.miniPlayerProgressScope = defaults.progressScope
        settingsVM.normalizeSlotArrays()
        settingsVM.save()
    }

    private var editingCard: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 36, height: 5)
                .padding(.top, MiniPlayerMetrics.grabberTopPadding)

            MiniPlayerCardContent(
                config: settingsVM.miniPlayerConfig,
                display: .sample,
                actions: .noop,
                editing: $selectedSlot,
            )

            MiniPlayerStatBand(
                config: settingsVM.miniPlayerConfig,
                display: .sample,
                actions: .noop,
                editing: $selectedSlot,
            )
            .padding(.top, 10)
            .padding(.bottom, 12)
        }
    }

    private var optionsList: some View {
        List {
            Section {
                Toggle(
                    isOn: Binding(
                        get: { settingsVM.alwaysShowMiniPlayer },
                        set: { newValue in
                            settingsVM.alwaysShowMiniPlayer = newValue
                            settingsVM.save()
                        },
                    )
                ) {
                    Label("Always Show", systemImage: "rectangle.bottomhalf.inset.filled")
                }
            } header: {
                Text(
                    "Tap an outlined element above to choose what appears "
                        + "there. Drag the slider to change the card size."
                )
                .textCase(nil)
                .font(.footnote)
                .foregroundStyle(.secondary)
            } footer: {
                Text(
                    "Keeps the miniplayer on screen and holds space for it, so the page "
                        + "never runs underneath. With it off the miniplayer stays hidden "
                        + "until you tap the page, then floats over the text."
                )
            }
            .listRowBackground(paletteRowBackground)

            ProgressIndicatorSection(
                settingsVM: settingsVM,
                toggleTitle: "Show with Miniplayer",
                enabled: Binding(
                    get: { settingsVM.progressIndicatorMiniPlayer },
                    set: { newValue in
                        settingsVM.progressIndicatorMiniPlayer = newValue
                        settingsVM.save()
                    },
                ),
                scope: Binding(
                    get: { settingsVM.miniPlayerProgressScope },
                    set: { newValue in
                        settingsVM.miniPlayerProgressScope = newValue
                        settingsVM.save()
                    },
                ),
                thickness: Binding(
                    get: { settingsVM.progressIndicatorThickness },
                    set: { newValue in
                        settingsVM.progressIndicatorThickness = newValue
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
