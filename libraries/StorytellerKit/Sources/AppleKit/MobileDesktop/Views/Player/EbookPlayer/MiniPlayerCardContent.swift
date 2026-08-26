#if os(iOS)
import SwiftUI

// Every row the compact card draws, above the bottom band. MiniPlayerCardContent
// pins its rows to these numbers so the card's frame always matches what it
// holds; DraggableAudioCard and EbookPlayerView.webViewBottomInset size
// themselves from the same totals.
enum MiniPlayerMetrics {
    static let scrubRowTopPadding: CGFloat = 16
    static let scrubRowHeight: CGFloat = 46
    static let scrubControlHeight: CGFloat = 30
    static let extraRowTopPadding: CGFloat = 6
    static let extraRowHeight: CGFloat = 30
    static let statBandHeight: CGFloat = 38
    static let grabberTopPadding: CGFloat = 6

    static func contentRowHeight(showStats: Bool) -> CGFloat {
        showStats ? 48 : 54
    }

    // Compact has no scrub row above it, so the content row itself has to clear
    // the grabber; the gap below the grabber matches the taller sizes.
    static func contentRowTopPadding(size: MiniPlayerSize, showStats: Bool) -> CGFloat {
        size == .compact ? (showStats ? 16 : 18) : 4
    }

    static func compactHeight(size: MiniPlayerSize, showStats: Bool) -> CGFloat {
        var height =
            contentRowTopPadding(size: size, showStats: showStats)
            + contentRowHeight(showStats: showStats)
        if size != .compact {
            height += scrubRowTopPadding + scrubRowHeight
        }
        if size == .large {
            height += extraRowTopPadding + extraRowHeight
        }
        return height
    }

    // The strip below the card content: the stat row when there is one, and
    // otherwise just the home indicator's safe area.
    static func bottomBandHeight(showStats: Bool, safeAreaBottom: CGFloat) -> CGFloat {
        showStats ? max(safeAreaBottom, statBandHeight) : safeAreaBottom
    }
}

struct MiniPlayerCardContent: View {
    let config: StorytellerGlobalConfig.MiniPlayer
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    var editing: Binding<SlotRef?>? = nil
    var onExpandTap: (() -> Void)? = nil

    private var effectiveSize: MiniPlayerSize {
        display.hasAudioNarration ? config.size : .compact
    }

    private var hasStatBand: Bool {
        display.hasAudioNarration && config.statSlots.hasActiveComplication
    }

    var body: some View {
        VStack(spacing: 0) {
            if effectiveSize != .compact {
                row(config.scrubRowSlots, region: .miniScrubRow, style: .scrubRow, spacing: 8)
                    .frame(height: MiniPlayerMetrics.scrubRowHeight)
                    .padding(.top, MiniPlayerMetrics.scrubRowTopPadding)
            }

            row(
                config.contentRowSlots,
                region: .miniContentRow,
                style: .miniRow(compact: hasStatBand),
                spacing: editing == nil ? 15 : 8,
            )
            .frame(height: MiniPlayerMetrics.contentRowHeight(showStats: hasStatBand))
            .padding(.top, contentRowTopPadding)

            if effectiveSize == .large {
                row(config.extraSlots, region: .miniExtraRow, style: .statBand, spacing: 0)
                    .frame(height: MiniPlayerMetrics.extraRowHeight)
                    .padding(.top, MiniPlayerMetrics.extraRowTopPadding)
            }
        }
    }

    private func row(
        _ slots: [PlayerComplication],
        region: SlotRegion,
        style: PlayerComplicationStyle,
        spacing: CGFloat,
    ) -> some View {
        MiniPlayerSlotRow(
            config: config,
            slots: slots,
            region: region,
            style: style,
            display: display,
            actions: actions,
            editing: editing,
            spacing: spacing,
            onExpandTap: onExpandTap,
        )
        .padding(.horizontal, 16)
    }

    private var contentRowTopPadding: CGFloat {
        MiniPlayerMetrics.contentRowTopPadding(size: effectiveSize, showStats: hasStatBand)
    }
}

/// One row of the card. Every slot holds any complication; the scrub bar and
/// the title block take whatever width is left over and push the fixed-size
/// controls to the edges, and mirroring just walks the row backwards.
struct MiniPlayerSlotRow: View {
    let config: StorytellerGlobalConfig.MiniPlayer
    let slots: [PlayerComplication]
    let region: SlotRegion
    let style: PlayerComplicationStyle
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    var editing: Binding<SlotRef?>? = nil
    var spacing: CGFloat = 8
    var onExpandTap: (() -> Void)? = nil

    private func isHidden(_ comp: PlayerComplication) -> Bool {
        (comp == .none && editing == nil) || (comp.requiresAudio && !display.hasAudioNarration)
    }

    private var entries: [(index: Int, comp: PlayerComplication)] {
        let all = slots.enumerated()
            .map { (index: $0.offset, comp: $0.element) }
            .filter { !isHidden($0.comp) }
        return config.mirrored ? mirroredRowEntries(all, comp: \.comp) : all
    }

    private var hasExpanding: Bool {
        entries.contains { $0.comp.isExpanding }
    }

    private var hasScrubBar: Bool {
        entries.contains { $0.comp == .scrubBar }
    }

    private var compactBlock: Bool {
        switch style {
            case .miniRow: return false
            default: return true
        }
    }

    private var activeCycle: MiniPlayerCycleBlock {
        guard config.leadingStyle == .cycle else { return config.cycleFirst }
        return config.cycleShowingSecond ? config.cycleSecond : config.cycleFirst
    }

    var body: some View {
        HStack(alignment: hasScrubBar ? .top : .center, spacing: spacing) {
            ForEach(Array(entries.enumerated()), id: \.element.index) { position, entry in
                cell(entry.comp, index: entry.index, position: position)
            }
        }
    }

    private func cell(_ comp: PlayerComplication, index: Int, position: Int) -> some View {
        content(comp, position: position)
            .frame(height: hasScrubBar && comp != .scrubBar && comp != .titleBlock
                ? MiniPlayerMetrics.scrubControlHeight : nil)
            .slotEditable(SlotRef(region: region, index: index), editing)
            .frame(maxWidth: comp.isExpanding || !hasExpanding ? .infinity : nil)
    }

    @ViewBuilder
    private func content(_ comp: PlayerComplication, position: Int) -> some View {
        switch comp {
            case .scrubBar:
                scrubBar
            case .titleBlock:
                titleBlock(trailing: onOuterEdge(position))
            default:
                PlayerComplicationView(
                    complication: comp,
                    display: display,
                    actions: actions,
                    style: style,
                    editingPreview: editing != nil,
                    iconTrailing: iconTrailing(at: position),
                    textOnlySlot: SlotLayout.isTextOnly(region),
                )
        }
    }

    // Stat icons ride the outer edge of the row, so a stat on the right reads
    // as text-then-icon and one on the left as icon-then-text.
    private func iconTrailing(at position: Int) -> Bool {
        Double(position) >= Double(entries.count) / 2
    }

    // An expanding widget with nothing to its right hugs the right edge and
    // pushes the rest of the row left, mirroring how it behaves on the left.
    private func onOuterEdge(_ position: Int) -> Bool {
        entries.count > 1 && position == entries.count - 1
    }

    private var scrubBar: some View {
        VStack(spacing: 0) {
            Slider(
                value: Binding(
                    get: { display.chapterProgress },
                    set: { newValue in
                        actions.onSeek?(min(max(newValue, 0), 1))
                    },
                ),
                in: 0...1,
            )
            .disabled(editing != nil || actions.onSeek == nil)
            .frame(height: MiniPlayerMetrics.scrubControlHeight)

            HStack(spacing: 4) {
                Text(formatTimeClock(scrubElapsed))
                Spacer(minLength: 0)
                Text("-\(formatTimeClock(display.chapterTimeRemaining))")
            }
            .font(.system(size: 10, weight: .medium).monospacedDigit())
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .padding(.horizontal, 2)
        }
    }

    // Remaining time is what the reader shows elsewhere, so it is scaled by the
    // playback rate; the elapsed side is scaled to match rather than reporting a
    // raw playhead the two labels would not add up to.
    private var scrubElapsed: TimeInterval? {
        guard let elapsed = display.chapterElapsedSeconds, display.playbackRate > 0 else {
            return nil
        }
        return elapsed / display.playbackRate
    }

    private func titleBlock(trailing: Bool) -> some View {
        HStack(spacing: compactBlock ? 8 : 12) {
            if trailing {
                Spacer(minLength: 0)
            }

            if activeCycle.showCover && !trailing {
                coverThumb
            }

            VStack(alignment: trailing ? .trailing : .leading, spacing: compactBlock ? 0 : 2) {
                if activeCycle.line1 != .none {
                    Text(cycleComponentDisplayText(activeCycle.line1, display: display))
                        .font(line1Font)
                        .lineLimit(1)
                }
                if activeCycle.line2 != .none {
                    Text(cycleComponentDisplayText(activeCycle.line2, display: display))
                        .font(line2Font)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            if activeCycle.showCover && trailing {
                coverThumb
            }

            if !trailing {
                Spacer(minLength: 0)
            }
        }
        .contentShape(Rectangle())
        // Simultaneous so the card's own drag still sees the touch: a swipe up
        // must open the full player from anywhere, including here.
        .simultaneousGesture(
            TapGesture().onEnded {
                if config.leadingStyle == .cycle {
                    actions.onLeadingTap()
                } else {
                    onExpandTap?()
                }
            }
        )
    }

    private var line1Font: Font {
        if compactBlock { return .caption2.weight(.medium) }
        return editing == nil ? .editorialTitle(16) : .editorialTitle(14)
    }

    private var line2Font: Font {
        if compactBlock { return .caption2.monospacedDigit() }
        return editing == nil ? .caption.monospacedDigit() : .caption2.monospacedDigit()
    }

    private var coverSize: CGFloat {
        compactBlock ? 24 : 40
    }

    @ViewBuilder
    private var coverThumb: some View {
        if let cover = display.cover {
            cover
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: coverSize, height: coverSize)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.secondary.opacity(0.2))
                .frame(width: coverSize, height: coverSize)
                .overlay(
                    Image(systemName: "book.fill")
                        .font(compactBlock ? .caption2 : .body)
                        .foregroundStyle(.secondary)
                )
        }
    }
}

func cycleComponentDisplayText(
    _ component: MiniPlayerCycleComponent,
    display: MiniPlayerDisplayModel,
) -> String {
    switch component {
        case .none:
            return ""
        case .bookTitle:
            return display.bookTitle ?? ""
        case .chapterTitle:
            return display.chapterTitle ?? display.bookTitle ?? ""
        case .author:
            return display.authorName ?? ""
        case .statPage:
            if let current = display.currentPage, let total = display.totalPages, total > 0 {
                return "pg. \(current) / \(total)"
            }
            return "pg. - / -"
        case .statPercent:
            guard let fraction = display.bookFraction else { return "--%" }
            return String(format: "%.0f%% of book", max(min(fraction, 1), 0) * 100)
        case .statTimeInChapter:
            return "\(formatTimeMinutesSeconds(display.chapterTimeRemaining)) left in chapter"
        case .statTimeInBook:
            return "\(formatTimeHoursMinutes(display.bookTimeRemaining)) left in book"
    }
}

struct MiniPlayerStatBand: View {
    let config: StorytellerGlobalConfig.MiniPlayer
    let display: MiniPlayerDisplayModel
    let actions: MiniPlayerActions
    var editing: Binding<SlotRef?>? = nil

    var body: some View {
        MiniPlayerSlotRow(
            config: config,
            slots: config.statSlots,
            region: .miniStatBand,
            style: .statBand,
            display: display,
            actions: actions,
            editing: editing,
            spacing: 0,
        )
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .padding(.bottom, 8)
    }
}
#endif
