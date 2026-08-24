#if os(iOS) || os(macOS)
import SwiftUI

struct FullPlayerCustomizeCard: View {
    @Bindable var settingsVM: SettingsViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.readerPalette) private var readerPalette

    @State private var selectedSlot: SlotRef?
    @State private var panelWidth: CGFloat = 0
    @State private var demoRate = 1.0
    @State private var demoVolume = 1.0
    @State private var demoSleepRemaining: TimeInterval?
    @State private var demoSleepEndOfChapter = false

    private var paletteRowBackground: Color? {
        #if os(macOS)
        return nil
        #else
        return readerPalette.map { $0.resolved(for: colorScheme).cardBackground }
        #endif
    }

    var body: some View {
        CustomizeCardContainer(title: "Full Player", onReset: resetToDefaults) {
            VStack(spacing: 0) {
                editingPanel
                    .padding(.horizontal, 14)
                    .padding(.top, 4)

                optionsList

                livePreview
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

    private var editingPanel: some View {
        VStack(spacing: 18) {
            fakeTransport

            FullPlayerStatColumns(
                slots: settingsVM.fullPlayerStatSlots,
                display: .sample,
                tint: pageForeground.opacity(0.7),
                editing: $selectedSlot,
            )

            FullPlayerControlsRow(
                availableWidth: max(panelWidth - 36, 1),
                slots: settingsVM.fullPlayerControlSlots,
                display: .sample,
                actions: .noop,
                accent: pageForeground,
                fill: pageForeground.opacity(0.12),
                editing: $selectedSlot,
                onOpenBookmarks: {},
                onOpenReadingTimeline: {},
                onOpenImageGallery: {},
                onOpenSearch: {},
                onOpenTextSettings: {},
            )
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.width
        } action: { width in
            panelWidth = width
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(pageBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.2), lineWidth: 2)
        )
    }

    private var demoDisplay: MiniPlayerDisplayModel {
        var model = MiniPlayerDisplayModel.sample
        model.playbackRate = demoRate
        model.volume = demoVolume
        model.sleepTimerRemaining = demoSleepRemaining
        model.sleepTimerEndOfChapter = demoSleepEndOfChapter
        return model
    }

    private var livePreview: some View {
        VStack(spacing: 0) {
            CustomizePreviewLabel()

            VStack(spacing: 20) {
                FullPlayerStatColumns(
                    slots: settingsVM.fullPlayerStatSlots,
                    display: demoDisplay,
                    tint: pageForeground.opacity(0.7),
                )

                FullPlayerControlsRow(
                    slots: settingsVM.fullPlayerControlSlots,
                    display: demoDisplay,
                    actions: MiniPlayerActions(onRateChange: { demoRate = $0 }),
                    accent: pageForeground,
                    fill: pageForeground.opacity(0.12),
                    onOpenBookmarks: {},
                    onOpenReadingTimeline: {},
                    onOpenImageGallery: {},
                    onOpenSearch: {},
                    onOpenTextSettings: {},
                    onVolumeChange: { demoVolume = $0 },
                    onSleepTimerStart: { duration, type in
                        demoSleepEndOfChapter = type == .endOfChapter
                        demoSleepRemaining = type == .endOfChapter ? nil : duration
                    },
                    onSleepTimerCancel: {
                        demoSleepRemaining = nil
                        demoSleepEndOfChapter = false
                    },
                )
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 22)
            .frame(maxWidth: .infinity)
            .background(pageBackground)
        }
    }

    private var fakeTransport: some View {
        HStack(spacing: 16) {
            Image(systemName: "backward.end.fill")
            Image(systemName: "gobackward")
            Image(systemName: "play.fill")
                .font(.title3)
                .frame(width: 40, height: 40)
                .background(Circle().fill(Color.primary.opacity(0.1)))
            Image(systemName: "goforward")
            Image(systemName: "forward.end.fill")
        }
        .foregroundStyle(pageForeground.opacity(0.4))
        .allowsHitTesting(false)
    }

    private var optionsList: some View {
        List {
            Section {
            } header: {
                Text(
                    "Tap an outlined slot to choose what appears there. "
                        + "Set a slot to Empty to hide it."
                )
                .textCase(nil)
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .listRowBackground(paletteRowBackground)
        }
    }

    private func resetToDefaults() {
        let defaults = StorytellerGlobalConfig.FullPlayer()
        settingsVM.fullPlayerStatSlots = defaults.statSlots
        settingsVM.fullPlayerControlSlots = defaults.controlSlots
        settingsVM.normalizeSlotArrays()
        settingsVM.save()
    }

    private var pageBackground: Color { settingsVM.pageBackground(for: colorScheme) }
    private var pageForeground: Color { settingsVM.pageForeground(for: colorScheme) }
}
#endif
