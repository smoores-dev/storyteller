#if os(iOS) || os(macOS)
import SwiftUI

struct FullPlayerStatColumns: View {
    let slots: [PlayerComplication]
    let display: MiniPlayerDisplayModel
    let tint: Color
    var editing: Binding<SlotRef?>? = nil

    private static let columns = 3

    var body: some View {
        let padded = SlotLayout.padded(slots, for: .fullPlayerStats)
        let rows = stride(from: 0, to: padded.count, by: Self.columns).map { start in
            Array(start..<min(start + Self.columns, padded.count))
        }
        let liveRows = rows.filter { row in row.contains { visible(padded[$0]) } }

        if !liveRows.isEmpty {
            VStack(spacing: editing != nil ? 8 : 6) {
                ForEach(liveRows, id: \.self) { row in
                    HStack(alignment: .top, spacing: 10) {
                        ForEach(row, id: \.self) { index in
                            let column = index % Self.columns
                            Group {
                                if visible(padded[index]) {
                                    statSlot(
                                        padded[index],
                                        index: index,
                                        iconTrailing: column == Self.columns - 1,
                                    )
                                } else {
                                    Color.clear.frame(height: 0)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: alignment(for: column))
                        }
                    }
                }
            }
        }
    }

    private func alignment(for column: Int) -> Alignment {
        switch column {
            case 0: .leading
            case Self.columns - 1: .trailing
            default: .center
        }
    }

    private func visible(_ slot: PlayerComplication) -> Bool {
        if editing != nil { return true }
        return slot != .none && (display.hasAudioNarration || !slot.requiresAudio)
    }

    private func statSlot(
        _ slot: PlayerComplication,
        index: Int,
        iconTrailing: Bool,
    ) -> some View {
        PlayerComplicationView(
            complication: slot,
            display: display,
            actions: .noop,
            style: .fullPlayer(tint: tint),
            iconTrailing: iconTrailing,
        )
        .slotEditable(SlotRef(region: .fullPlayerStats, index: index), editing)
    }
}

struct FullPlayerControlsRow: View {
    var availableWidth: CGFloat = .infinity
    let slots: [PlayerComplication]
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    let accent: Color
    let fill: Color
    var editing: Binding<SlotRef?>? = nil
    var onOpenBookmarks: (() -> Void)? = nil
    var onOpenReadingTimeline: (() -> Void)? = nil
    var onOpenImageGallery: (() -> Void)? = nil
    var onOpenSearch: (() -> Void)? = nil
    var onOpenTextSettings: (() -> Void)? = nil
    var onVolumeChange: (Double) -> Void = { _ in }
    var onSleepTimerStart: (TimeInterval?, SleepTimerType) -> Void = { _, _ in }
    var onSleepTimerCancel: () -> Void = {}

    @State private var showVolumePopover = false
    @State private var showSleepTimerPopover = false

    #if os(macOS)
    private static let naturalButtonSize: CGFloat = 40
    private static let naturalIconSize: CGFloat = 17
    #else
    private static let naturalButtonSize: CGFloat = 52
    private static let naturalIconSize: CGFloat = 22
    #endif

    private var scale: CGFloat {
        guard availableWidth.isFinite else { return 1 }
        let slotCount = max(SlotLayout.padded(slots, for: .fullPlayerControls).count { visible($0) }, 1)
        let natural = Self.naturalButtonSize + 14 + (editing != nil ? 10 : 0)
        return min(1, max(0.55, (availableWidth / CGFloat(slotCount)) / natural))
    }

    private var buttonSize: CGFloat { Self.naturalButtonSize * scale }
    private var iconFont: Font { .system(size: Self.naturalIconSize * scale, weight: .semibold) }
    private var cornerRadius: CGFloat { 12 * scale }

    var body: some View {
        let padded = SlotLayout.padded(slots, for: .fullPlayerControls)

        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(padded.enumerated()), id: \.offset) { index, slot in
                if visible(slot) {
                    controlSlot(slot)
                        .slotEditable(
                            SlotRef(region: .fullPlayerControls, index: index), editing)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func visible(_ slot: PlayerComplication) -> Bool {
        if editing != nil { return true }
        guard slot != .none else { return false }
        if !display.hasAudioNarration && slot.requiresAudio { return false }
        switch slot {
            case .bookmarks: return onOpenBookmarks != nil
            case .readingTimeline: return onOpenReadingTimeline != nil
            case .imageGallery: return onOpenImageGallery != nil
            case .search: return onOpenSearch != nil
            case .textSettings: return onOpenTextSettings != nil
            default: return true
        }
    }

    @ViewBuilder
    private func controlSlot(_ slot: PlayerComplication) -> some View {
        switch slot {
            case .playbackSpeed:
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    backgroundColor: accent,
                    foregroundColor: accent,
                    transparency: 1.0,
                    showLabel: true,
                    buttonSize: buttonSize,
                    iconFont: iconFont,
                )
            case .chapters:
                ChaptersButton(
                    chapters: display.chapters,
                    selectedChapterId: display.selectedChapterHref,
                    onChapterSelected: actions.onChapterSelected,
                    backgroundColor: accent,
                    foregroundColor: accent,
                    transparency: 1.0,
                    showLabel: true,
                    buttonSize: buttonSize,
                    iconFont: iconFont,
                )
            case .volume:
                volumeButton
            case .sleepTimer:
                sleepTimerButton
            case .bookmarks:
                labeledControl(icon: "bookmark", label: "Bookmarks") {
                    onOpenBookmarks?()
                }
            case .readingTimeline:
                labeledControl(icon: "clock.arrow.circlepath", label: "Timeline") {
                    onOpenReadingTimeline?()
                }
            case .imageGallery:
                labeledControl(icon: "photo.on.rectangle", label: "Images") {
                    onOpenImageGallery?()
                }
            case .search:
                labeledControl(icon: "magnifyingglass", label: "Search") {
                    onOpenSearch?()
                }
            case .textSettings:
                labeledControl(icon: "textformat.size", label: "Text") {
                    onOpenTextSettings?()
                }
            default:
                PlayerComplicationView(
                    complication: slot,
                    display: display,
                    actions: actions,
                    style: .fullPlayer(tint: accent),
                )
                .frame(minHeight: buttonSize)
        }
    }

    private func labeledControl(
        icon: String,
        label: String,
        action: @escaping () -> Void,
    ) -> some View {
        VStack(spacing: 6) {
            Button(action: action) {
                Image(systemName: icon)
                    .font(iconFont)
                    .foregroundStyle(accent)
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(fill)
                    )
            }
            .buttonStyle(.plain)

            Text(label)
                .font(.footnote)
                .foregroundStyle(accent.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var sleepTimerActive: Bool {
        display.sleepTimerRemaining != nil || display.sleepTimerEndOfChapter
    }

    private var volumeButton: some View {
        VStack(spacing: 6) {
            Button(action: { showVolumePopover = true }) {
                Image(systemName: volumeIconName)
                    .font(iconFont)
                    .foregroundStyle(accent)
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(fill)
                    )
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showVolumePopover) {
                let content = volumePopover
                    .frame(minWidth: 200, maxWidth: 240)
                #if os(iOS)
                content.presentationCompactAdaptation(.popover)
                #else
                content
                #endif
            }

            Text("\(Int(display.volume * 100))%")
                .font(.footnote)
                .foregroundStyle(accent.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var sleepTimerButton: some View {
        VStack(spacing: 6) {
            Button(action: {
                if sleepTimerActive {
                    onSleepTimerCancel()
                } else {
                    showSleepTimerPopover = true
                }
            }) {
                Image(systemName: sleepTimerActive ? "moon.zzz.fill" : "moon.zzz")
                    .font(iconFont)
                    .foregroundStyle(accent)
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(sleepTimerActive ? accent.opacity(0.3) : fill)
                    )
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showSleepTimerPopover) {
                let content = sleepTimerPopover
                    .frame(minWidth: 200, maxWidth: 240)
                #if os(iOS)
                content.presentationCompactAdaptation(.popover)
                #else
                content
                #endif
            }

            Text(sleepTimerLabel)
                .font(.footnote)
                .foregroundStyle(sleepTimerActive ? accent : accent.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var sleepTimerLabel: String {
        guard sleepTimerActive else { return "Sleep" }
        if display.sleepTimerEndOfChapter { return "End Ch." }
        guard let remaining = display.sleepTimerRemaining else { return "Sleep" }
        return formatSleepTimerRemaining(remaining)
    }

    private var volumeIconName: String {
        if display.volume == 0 { return "speaker.slash" }
        if display.volume < 0.33 { return "speaker.wave.1" }
        if display.volume < 0.66 { return "speaker.wave.2" }
        return "speaker.wave.3"
    }

    private var volumePopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Volume")
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 8)

            VStack(spacing: 8) {
                Slider(
                    value: Binding(
                        get: { display.volume },
                        set: { newValue in onVolumeChange(newValue) },
                    ),
                    in: 0...1,
                )
                .padding(.horizontal)

                Text("\(Int(display.volume * 100))%")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 12)
        }
    }

    private var sleepTimerPopover: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sleep Timer")
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 8)

            VStack(spacing: 4) {
                sleepTimerOption(title: "10 minutes", duration: 10 * 60)
                sleepTimerOption(title: "15 minutes", duration: 15 * 60)
                sleepTimerOption(title: "30 minutes", duration: 30 * 60)
                sleepTimerOption(title: "1 hour", duration: 60 * 60)

                Divider()
                    .padding(.horizontal)

                sleepTimerOption(title: "At End of Chapter", duration: nil, type: .endOfChapter)
            }
            .padding(.bottom, 12)
        }
    }

    private func sleepTimerOption(
        title: String,
        duration: TimeInterval?,
        type: SleepTimerType = .duration,
    ) -> some View {
        Button(action: {
            onSleepTimerStart(duration, type)
            showSleepTimerPopover = false
        }) {
            HStack {
                Text(title)
                    .font(.body)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }

    private func formatSleepTimerRemaining(_ time: TimeInterval) -> String {
        let totalSeconds = max(Int(time.rounded()), 0)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else if minutes > 0 {
            return String(format: "%d:%02d", minutes, seconds)
        } else {
            return String(format: "%ds", seconds)
        }
    }
}
#endif
