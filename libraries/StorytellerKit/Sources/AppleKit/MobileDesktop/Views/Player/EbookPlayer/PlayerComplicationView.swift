#if os(iOS) || os(macOS)
import SwiftUI

struct MiniPlayerDisplayModel {
    var bookTitle: String?
    var chapterTitle: String?
    var authorName: String?
    var cover: Image?
    var isPlaying: Bool
    var playbackRate: Double
    var chapterProgress: Double
    var chapterElapsedSeconds: TimeInterval?
    var chapterTotalSeconds: TimeInterval?
    var bookTimeRemaining: TimeInterval?
    var bookFraction: Double?
    var currentPage: Int?
    var totalPages: Int?
    var chapterIndex: Int?
    var chapterCount: Int?
    var sleepTimerRemaining: TimeInterval?
    var sleepTimerEndOfChapter: Bool = false
    var sessionStart: Date?
    var chapters: [ChapterItem] = []
    var selectedChapterHref: String?
    var hasAudioNarration: Bool
    var isScrollingMode: Bool = false
    var freeBrowseMode: String = kDefaultFreeBrowseMode

    var chapterTimeRemaining: TimeInterval? {
        guard let elapsed = chapterElapsedSeconds, let total = chapterTotalSeconds,
            playbackRate > 0
        else { return nil }
        return max(0, total - elapsed) / playbackRate
    }

    var chapterLength: TimeInterval? {
        guard let total = chapterTotalSeconds, playbackRate > 0 else { return nil }
        return total / playbackRate
    }

    static var sample: MiniPlayerDisplayModel {
        MiniPlayerDisplayModel(
            bookTitle: "The Wind in the Willows",
            chapterTitle: "Chapter 4: Mr. Badger",
            authorName: "Kenneth Grahame",
            cover: nil,
            isPlaying: false,
            playbackRate: 1.0,
            chapterProgress: 0.42,
            chapterElapsedSeconds: 312,
            chapterTotalSeconds: 745,
            bookTimeRemaining: 4.5 * 3600,
            bookFraction: 0.42,
            currentPage: 118,
            totalPages: 284,
            chapterIndex: 3,
            chapterCount: 12,
            sleepTimerRemaining: 18 * 60,
            sessionStart: Date(timeIntervalSinceNow: -23 * 60),
            hasAudioNarration: true,
        )
    }
}

struct MiniPlayerActions {
    var onPlayPause: () -> Void = {}
    var onSkipBackward: () -> Void = {}
    var onSkipForward: () -> Void = {}
    var onRateChange: (Double) -> Void = { _ in }
    var onSeek: ((Double) -> Void)? = nil
    var onLeadingTap: () -> Void = {}
    var onChapterSelected: (ChapterItem) -> Void = { _ in }
    var onOpenBookmarks: () -> Void = {}
    var onOpenReadingTimeline: () -> Void = {}
    var onOpenSearch: () -> Void = {}
    var onOpenTextSettings: () -> Void = {}
    var onOpenSleepTimer: () -> Void = {}
    var onToggleMirror: () -> Void = {}
    var onToggleScrollingMode: () -> Void = {}
    var onToggleFreeBrowse: () -> Void = {}
    var onToggleOrientationLock: () -> Void = {}

    static var noop: MiniPlayerActions { MiniPlayerActions() }
}

enum SlotRegion: Hashable {
    case miniContentRow
    case miniStatBand
    case miniScrubRow
    case miniExtraRow
    case dockLeading
    case dockTrailing
    case dockCenter
    case menuBar
}

struct SlotRef: Hashable {
    let region: SlotRegion
    let index: Int
}

private struct SlotEditableModifier: ViewModifier {
    let ref: SlotRef
    let editing: Binding<SlotRef?>?

    func body(content: Content) -> some View {
        if let editing {
            let isSelected = editing.wrappedValue == ref
            content
                .allowsHitTesting(false)
                .frame(minWidth: 26, minHeight: 22)
                .padding(3)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(isSelected ? Color.accentColor.opacity(0.15) : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(
                            isSelected ? Color.accentColor : Color.secondary.opacity(0.55),
                            style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]),
                        )
                )
                .contentShape(Rectangle())
                .onTapGesture { editing.wrappedValue = ref }
        } else {
            content
        }
    }
}

extension View {
    func slotEditable(_ ref: SlotRef, _ editing: Binding<SlotRef?>?) -> some View {
        modifier(SlotEditableModifier(ref: ref, editing: editing))
    }
}

#if os(iOS)
/// Battery monitoring is off by default and the level only updates while it is
/// enabled, so the complication owns turning it on for as long as it is shown.
private struct BatteryStat<Content: View>: View {
    @ViewBuilder let content: (Float, Bool) -> Content

    @State private var level: Float = UIDevice.current.batteryLevel
    @State private var charging = UIDevice.current.batteryState == .charging

    var body: some View {
        content(level, charging)
            .onAppear {
                UIDevice.current.isBatteryMonitoringEnabled = true
                refresh()
            }
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIDevice.batteryLevelDidChangeNotification,
                )
            ) { _ in refresh() }
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIDevice.batteryStateDidChangeNotification,
                )
            ) { _ in refresh() }
    }

    private func refresh() {
        level = UIDevice.current.batteryLevel
        charging = UIDevice.current.batteryState == .charging
            || UIDevice.current.batteryState == .full
    }
}
#endif

enum PlayerComplicationStyle {
    case miniRow(compact: Bool)
    case scrubRow
    case statBand
    case dock(transparency: Double)
    case pickerThumb
    case menuBar(tint: Color)
    // Native macOS toolbar items: no explicit frames, fonts, or button styles,
    // so AppKit gives them the same treatment as system toolbar buttons.
    case macToolbar
}

struct PlayerComplicationView: View {
    let complication: PlayerComplication
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    let style: PlayerComplicationStyle
    var editingPreview: Bool = false
    var iconTrailing: Bool = false
    var textOnlySlot: Bool = false

    var body: some View {
        switch complication {
            case .none:
                emptyPlaceholder
            case .playPause:
                playPauseButton
            case .skipBackward:
                skipButton(systemName: "arrow.counterclockwise", action: actions.onSkipBackward)
            case .skipForward:
                skipButton(systemName: "arrow.clockwise", action: actions.onSkipForward)
            case .playbackSpeed:
                speedControl
            case .scrubBar:
                scrubBarGlyph
            case .statPercent:
                statView(icon: "book.fill", text: percentText)
            case .statPage:
                statView(icon: "bookmark.fill", text: pageText)
            case .statTimeInBook:
                statView(
                    icon: "book.fill",
                    text: formatTimeHoursMinutes(display.bookTimeRemaining),
                )
            case .statTimeInChapter:
                statView(
                    icon: "bookmark.fill",
                    text: formatTimeMinutesSeconds(display.chapterTimeRemaining),
                )
            case .statPagesLeft:
                statView(icon: "doc.text", text: pagesLeftText)
            case .statChapterOf:
                statView(icon: "list.bullet", text: chapterOfText)
            case .statChapterPercent:
                statView(icon: "bookmark", text: chapterPercentText)
            case .statChapterElapsed:
                statView(
                    icon: "bookmark.fill",
                    text: formatTimeMinutesSeconds(display.chapterElapsedSeconds),
                )
            case .statChapterLength:
                statView(
                    icon: "hourglass",
                    text: formatTimeMinutesSeconds(display.chapterLength),
                )
            case .statSleepTimer:
                statView(
                    icon: "moon.zzz.fill",
                    text: formatTimeMinutesSeconds(display.sleepTimerRemaining),
                )
            case .statFinishTime:
                tickingStat(icon: "flag.checkered") { now in
                    finishTimeText(now: now)
                }
            case .statSessionTime:
                tickingStat(icon: "timer") { now in
                    sessionTimeText(now: now)
                }
            case .statClock:
                tickingStat(icon: "clock") { now in
                    now.formatted(date: .omitted, time: .shortened)
                }
            case .statBattery:
                #if os(iOS)
                BatteryStat { level, charging in
                    statView(
                        icon: batteryIcon(level: level, charging: charging),
                        text: batteryText(level: level),
                    )
                }
                #else
                EmptyView()
                #endif
            case .chapters:
                chaptersControl
            case .bookmarks:
                controlButton(systemName: "bookmark", action: actions.onOpenBookmarks)
            case .readingTimeline:
                controlButton(
                    systemName: "clock.arrow.circlepath",
                    action: actions.onOpenReadingTimeline,
                )
            case .search:
                controlButton(systemName: "magnifyingglass", action: actions.onOpenSearch)
            case .textSettings:
                controlButton(systemName: "textformat.size", action: actions.onOpenTextSettings)
            case .sleepTimer:
                sleepTimerControl
            case .mirror:
                #if os(iOS)
                controlButton(
                    systemName: "arrow.left.and.right.righttriangle.left.righttriangle.right",
                    action: actions.onToggleMirror,
                )
                #else
                EmptyView()
                #endif
            case .titleBlock:
                titleBlockThumb
            case .scrollMode:
                scrollModeButton
            case .freeBrowseLock:
                freeBrowseLockButton
            case .orientationLock:
                #if os(iOS)
                orientationLockButton
                #else
                EmptyView()
                #endif
        }
    }

    private var scrollModeButton: some View {
        controlButton(
            systemName: display.isScrollingMode ? "scroll.fill" : "scroll",
            action: actions.onToggleScrollingMode,
        )
    }

    private var freeBrowseLockButton: some View {
        let browsing = display.freeBrowseMode == "always"
        return complicationButtonStyle(
            Button(action: actions.onToggleFreeBrowse) {
                if isNativeToolbar {
                    Image(systemName: "link")
                        .foregroundStyle(
                            browsing
                                ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.primary)
                        )
                        .overlay {
                            if browsing {
                                Capsule()
                                    .fill(Color.accentColor)
                                    .frame(width: controlGlyphSize + 6, height: 1.8)
                                    .rotationEffect(.degrees(-45))
                            }
                        }
                } else {
                    Image(systemName: "link")
                        .font(.system(size: controlGlyphSize))
                        .foregroundStyle(
                            browsing ? AnyShapeStyle(Color.accentColor) : controlStyle
                        )
                        .overlay {
                            if browsing {
                                Capsule()
                                    .fill(Color.accentColor)
                                    .frame(width: controlGlyphSize + 6, height: 1.8)
                                    .rotationEffect(.degrees(-45))
                            }
                        }
                        .frame(width: controlSize, height: controlSize)
                        .contentShape(Rectangle())
                }
            }
        )
    }

    #if os(iOS)
    private var orientationLockButton: some View {
        let locked = OrientationLock.shared.isLocked
        return Button(action: actions.onToggleOrientationLock) {
            Image(systemName: locked ? "lock.rotation" : "lock.open.rotation")
                .font(.system(size: controlGlyphSize))
                .foregroundStyle(
                    locked ? AnyShapeStyle(Color.accentColor) : controlStyle
                )
                .frame(width: controlSize, height: controlSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    #endif

    // The real card draws the title block itself; this stands in for it in the
    // picker, where only a swatch is needed.
    private var titleBlockThumb: some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 18, height: 18)
            VStack(alignment: .leading, spacing: 3) {
                Capsule().fill(Color.primary.opacity(0.6)).frame(width: 34, height: 4)
                Capsule().fill(Color.secondary.opacity(0.5)).frame(width: 22, height: 3)
            }
        }
    }

    private var chaptersControl: some View {
        ChaptersButton(
            chapters: display.chapters,
            selectedChapterId: display.selectedChapterHref,
            onChapterSelected: actions.onChapterSelected,
            backgroundColor: controlColor,
            foregroundColor: controlColor,
            transparency: controlTransparency,
            showLabel: false,
            buttonSize: controlSize,
            showBackground: false,
            nativeToolbar: isNativeToolbar,
        )
    }

    // Matches the top bar: while a timer runs the glyph fills in and the
    // remaining time rides alongside it.
    @ViewBuilder
    private var sleepTimerControl: some View {
        let running = display.sleepTimerRemaining != nil || display.sleepTimerEndOfChapter
        complicationButtonStyle(
            Button(action: actions.onOpenSleepTimer) {
                HStack(spacing: 3) {
                    Image(systemName: running ? "moon.zzz.fill" : "moon.zzz")
                        .font(isNativeToolbar ? nil : .system(size: controlGlyphSize))
                    if let remaining = display.sleepTimerRemaining {
                        Text(formatTimeMinutesSeconds(remaining))
                            .font(isNativeToolbar ? nil : .caption2)
                            .monospacedDigit()
                    } else if display.sleepTimerEndOfChapter {
                        Text("End Ch.")
                            .font(isNativeToolbar ? nil : .caption2)
                    }
                }
                .foregroundStyle(
                    running
                        ? AnyShapeStyle(Color.accentColor)
                        : (isNativeToolbar ? AnyShapeStyle(.primary) : controlStyle)
                )
                .frame(
                    minWidth: isNativeToolbar ? nil : controlSize,
                    minHeight: isNativeToolbar ? nil : controlSize,
                )
                .contentShape(Rectangle())
            }
        )
    }

    private var isNativeToolbar: Bool {
        if case .macToolbar = style { return true }
        return false
    }

    @ViewBuilder
    private func complicationButtonStyle<V: View>(_ button: V) -> some View {
        if isNativeToolbar {
            button
        } else {
            button.buttonStyle(.plain)
        }
    }

    private func controlButton(systemName: String, action: @escaping () -> Void) -> some View {
        complicationButtonStyle(
            Button(action: action) {
                if isNativeToolbar {
                    Image(systemName: systemName)
                } else {
                    Image(systemName: systemName)
                        .font(.system(size: controlGlyphSize))
                        .foregroundStyle(controlStyle)
                        .frame(width: controlSize, height: controlSize)
                        .contentShape(Rectangle())
                }
            }
        )
    }

    private var controlSize: CGFloat {
        switch style {
            case .miniRow: return 34
            case .dock: return 36
            case .menuBar: return 44
            default: return 30
        }
    }

    private var controlGlyphSize: CGFloat {
        switch style {
            case .dock: return 16
            case .menuBar: return 20
            default: return 17
        }
    }

    private var controlColor: Color {
        if case .dock = style { return .gray }
        if case .menuBar(let tint) = style { return tint }
        return .primary
    }

    private var controlTransparency: Double {
        if case .dock(let transparency) = style { return transparency }
        return 1
    }

    private var controlStyle: AnyShapeStyle {
        if case .dock(let transparency) = style {
            return AnyShapeStyle(.gray.opacity(transparency))
        }
        if case .menuBar(let tint) = style {
            return AnyShapeStyle(tint)
        }
        return AnyShapeStyle(.primary)
    }

    private var pagesLeftText: String {
        guard let current = display.currentPage, let total = display.totalPages, total > 0 else {
            return "- left"
        }
        let left = max(0, total - current)
        return left == 1 ? "1 pg. left" : "\(left) pgs. left"
    }

    private var chapterOfText: String {
        guard let index = display.chapterIndex, let count = display.chapterCount, count > 0 else {
            return "ch. - / -"
        }
        return "ch. \(index + 1) / \(count)"
    }

    private var chapterPercentText: String {
        String(format: "%.0f%% of ch.", max(min(display.chapterProgress, 1), 0) * 100)
    }

    private func finishTimeText(now: Date) -> String {
        guard let remaining = display.bookTimeRemaining, remaining > 0 else { return "--:--" }
        let finish = now.addingTimeInterval(remaining / max(display.playbackRate, 0.1))
        return finish.formatted(date: .omitted, time: .shortened)
    }

    private func sessionTimeText(now: Date) -> String {
        guard let start = display.sessionStart else { return "-- read" }
        let elapsed = max(0, now.timeIntervalSince(start))
        let minutes = Int(elapsed / 60)
        if minutes < 60 { return "\(minutes)m read" }
        return "\(minutes / 60)h\(minutes % 60)m read"
    }

    private func batteryText(level: Float) -> String {
        level < 0 ? "--%" : "\(Int((level * 100).rounded()))%"
    }

    private func batteryIcon(level: Float, charging: Bool) -> String {
        if charging { return "battery.100percent.bolt" }
        switch level {
            case ..<0: return "battery.0percent"
            case ..<0.15: return "battery.0percent"
            case ..<0.4: return "battery.25percent"
            case ..<0.65: return "battery.50percent"
            case ..<0.9: return "battery.75percent"
            default: return "battery.100percent"
        }
    }

    private func tickingStat(
        icon: String,
        text: @escaping (Date) -> String,
    ) -> some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            statView(icon: icon, text: text(context.date))
        }
    }

    // A wide, short box in the text-only rows so the shape itself says a
    // readout goes here rather than a button.
    private var emptyPlaceholder: some View {
        Image(systemName: "plus")
            .font(.caption2)
            .foregroundStyle(.secondary.opacity(0.6))
            .frame(width: textOnlySlot ? 52 : 26, height: textOnlySlot ? 16 : 22)
    }

    private var scrubBarGlyph: some View {
        HStack(spacing: 5) {
            Capsule()
                .fill(Color.accentColor.opacity(0.8))
                .frame(width: 16, height: 4)
            Circle()
                .fill(Color.primary.opacity(0.7))
                .frame(width: 9, height: 9)
            Capsule()
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 20, height: 4)
        }
        .frame(height: 22)
    }

    private var percentText: String {
        guard let fraction = display.bookFraction else { return "--%" }
        return String(format: "%.0f%%", max(min(fraction, 1), 0) * 100)
    }

    private var pageText: String {
        guard let current = display.currentPage, let total = display.totalPages, total > 0 else {
            return "Page - of -"
        }
        return "Page \(current) of \(total)"
    }

    private var playPauseButton: some View {
        complicationButtonStyle(
            Button(action: actions.onPlayPause) {
                playPauseLabel
            }
        )
    }

    @ViewBuilder
    private var playPauseLabel: some View {
        switch style {
            case .macToolbar:
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
            case .miniRow(let compact):
                // The editing preview is narrower than the real card, so
                // the full-size circle would spill out of its slot box.
                let diameter: CGFloat = editingPreview ? 36 : (compact ? 48 : 54)
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
                    .font(editingPreview ? .title3 : (compact ? .title2 : .title))
                    .frame(width: diameter, height: diameter)
                    .background(Circle().fill(Color.primary.opacity(0.1)))
            case .scrubRow:
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
                    .font(.body)
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            case .dock(let transparency):
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(.gray.opacity(transparency))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            case .menuBar(let tint):
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            case .statBand, .pickerThumb:
                Image(systemName: display.isPlaying ? "pause.fill" : "play.fill")
                    .font(.callout)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Color.primary.opacity(0.1)))
        }
    }

    private func skipButton(systemName: String, action: @escaping () -> Void) -> some View {
        complicationButtonStyle(
            Button(action: action) {
                skipLabel(systemName: systemName)
            }
        )
    }

    @ViewBuilder
    private func skipLabel(systemName: String) -> some View {
        switch style {
            case .macToolbar:
                Image(systemName: systemName)
            case .miniRow, .scrubRow:
                Image(systemName: systemName)
                    .font(.body.weight(.medium))
                    .frame(width: 34, height: 34)
                    .contentShape(Rectangle())
            case .dock(let transparency):
                Image(systemName: systemName)
                    .font(.system(size: 16))
                    .foregroundStyle(.gray.opacity(transparency))
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            case .menuBar(let tint):
                Image(systemName: systemName)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            case .statBand, .pickerThumb:
                Image(systemName: systemName)
                    .font(.callout)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private var speedControl: some View {
        switch style {
            case .macToolbar:
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    showLabel: false,
                    showBackground: false,
                    compactLabel: true,
                    textButton: true,
                    nativeToolbar: true,
                )
            case .miniRow(let compact):
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    showLabel: !editingPreview,
                    buttonSize: compact ? 32 : 36,
                    showBackground: false,
                    compactLabel: true,
                    iconFont: compact ? .body : .title3,
                )
            case .scrubRow, .statBand:
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    showLabel: false,
                    buttonSize: 30,
                    showBackground: false,
                    compactLabel: true,
                    iconFont: .body,
                )
            case .dock(let transparency):
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    foregroundColor: .gray,
                    transparency: transparency,
                    showLabel: false,
                    buttonSize: 36,
                    showBackground: false,
                    compactLabel: true,
                    iconFont: .body,
                )
            case .menuBar(let tint):
                PlaybackRateButton(
                    currentRate: display.playbackRate,
                    onRateChange: actions.onRateChange,
                    foregroundColor: tint,
                    showLabel: false,
                    buttonSize: 44,
                    showBackground: false,
                    compactLabel: true,
                    iconFont: .system(size: 17, weight: .medium),
                    textButton: true,
                )
            case .pickerThumb:
                HStack(spacing: 3) {
                    Image(systemName: "speedometer")
                        .font(.callout)
                    Text(String(format: "%.1fx", display.playbackRate))
                        .font(.caption2.monospacedDigit())
                }
                .foregroundStyle(.primary)
        }
    }

    private func statView(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            if !iconTrailing {
                Image(systemName: icon).font(statFont)
                Text(text).font(statFont.monospacedDigit())
            } else {
                Text(text).font(statFont.monospacedDigit())
                Image(systemName: icon).font(statFont)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .foregroundStyle(statColor)
    }

    private var statFont: Font {
        switch style {
            case .miniRow: return .caption
            case .macToolbar: return .callout
            default: return .caption2
        }
    }

    private var statColor: some ShapeStyle {
        switch style {
            case .dock(let transparency):
                return AnyShapeStyle(.gray.opacity(transparency))
            case .menuBar(let tint):
                return AnyShapeStyle(tint.opacity(0.75))
            default:
                return AnyShapeStyle(.secondary)
        }
    }
}
#endif
