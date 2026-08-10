#if os(iOS)
import SwiftUI

struct MenuBarCustomizeCard: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme

    @State private var selectedSlot: SlotRef?

    var body: some View {
        CustomizeCardContainer(title: "Menu Bar", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                MenuBarPreviewFrame(
                    backgroundColor: pageBackground,
                    foregroundColor: pageForeground,
                ) {
                    barPreview
                }
                .frame(height: 150)
                .padding(.horizontal, 10)
                .padding(.top, 4)

                optionsList
            }
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

    private var barPreview: some View {
        HStack(alignment: .center, spacing: 4) {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(pageForeground.opacity(0.4))
                .frame(width: 24, height: 34)

            Spacer(minLength: 0)

            HStack(spacing: 2) {
                ForEach(
                    Array(SlotLayout.padded(settingsVM.menuBarSlots, for: .menuBar).enumerated()),
                    id: \.offset,
                ) { index, comp in
                    PlayerComplicationView(
                        complication: comp,
                        display: .sample,
                        actions: .noop,
                        style: .pickerThumb,
                        editingPreview: true,
                    )
                    .slotEditable(SlotRef(region: .menuBar, index: index), $selectedSlot)
                }
            }

            Image(systemName: "slider.horizontal.3")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(pageForeground.opacity(0.4))
                .frame(width: 24, height: 34)
        }
        .padding(.horizontal, 8)
        .frame(height: 40)
        .background(pageBackground)
    }

    private var optionsList: some View {
        List {
            Section {
            } header: {
                Text(
                    "Tap an outlined slot above to choose what appears at that "
                        + "position. Set a slot to Empty to hide it. The back button "
                        + "and this customize menu always stay."
                )
                .textCase(nil)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func resetToDefaults() {
        settingsVM.menuBarSlots = StorytellerGlobalConfig.ReadingBar.defaultMenuBarSlots
        settingsVM.normalizeSlotArrays()
        settingsVM.save()
    }

    private var pageBackground: Color { settingsVM.pageBackground(for: colorScheme) }
    private var pageForeground: Color { settingsVM.pageForeground(for: colorScheme) }
}

/// Top-half mirror of MiniPlayerPreviewFrame.
struct MenuBarPreviewFrame<Chrome: View>: View {
    let backgroundColor: Color
    let foregroundColor: Color
    @ViewBuilder let chrome: () -> Chrome

    private let bezelShape = UnevenRoundedRectangle(
        topLeadingRadius: 38,
        bottomLeadingRadius: 8,
        bottomTrailingRadius: 8,
        topTrailingRadius: 38,
        style: .continuous,
    )

    var body: some View {
        ZStack(alignment: .top) {
            backgroundColor

            fakePage
                .frame(maxHeight: .infinity, alignment: .bottom)

            chrome()
        }
        .clipShape(bezelShape)
        .overlay(
            bezelShape
                .strokeBorder(Color.primary.opacity(0.25), lineWidth: 4)
        )
        .padding(.horizontal, 4)
    }

    private var fakePage: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(0..<12, id: \.self) { line in
                RoundedRectangle(cornerRadius: 2)
                    .fill(foregroundColor.opacity(0.35))
                    .frame(height: 6)
                    .frame(maxWidth: .infinity)
                    .padding(.trailing, lineTrailingPadding(line))
            }
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 18)
    }

    private func lineTrailingPadding(_ line: Int) -> CGFloat {
        switch line % 5 {
            case 0: return 0
            case 1: return 12
            case 2: return 4
            case 3: return 40
            default: return 8
        }
    }
}
#endif
