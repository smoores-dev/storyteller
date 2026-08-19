#if os(iOS) || os(macOS)
import SwiftUI

extension SlotRef: Identifiable {
    var id: String { "\(region)-\(index)" }
}

enum SlotLayout {
    static func slotCount(for region: SlotRegion) -> Int {
        switch region {
            case .miniContentRow: return 5
            case .miniStatBand: return 4
            case .miniScrubRow: return 4
            case .miniExtraRow: return 4
            case .dockLeading: return 2
            case .dockTrailing: return 2
            case .dockCenter: return 3
            case .menuBar: return 6
        }
    }

    static func isMiniRow(_ region: SlotRegion) -> Bool {
        switch region {
            case .miniContentRow, .miniStatBand, .miniScrubRow, .miniExtraRow: return true
            case .dockLeading, .dockTrailing, .dockCenter, .menuBar: return false
        }
    }

    static let stats: [PlayerComplication] = [
        .statPercent, .statPage, .statPagesLeft, .statChapterOf, .statChapterPercent,
        .statTimeInBook, .statTimeInChapter, .statChapterElapsed, .statChapterLength,
        .statFinishTime, .statSessionTime, .statSleepTimer,
    ]

    // The dock stands in for the hidden status bar, so it alone carries the
    // stats the system would otherwise be showing.
    #if os(iOS)
    static let dockOnlyStats: [PlayerComplication] = [.statClock, .statBattery]
    #else
    static let dockOnlyStats: [PlayerComplication] = [.statClock]
    #endif

    // The stat band sits in the home-indicator strip, too close to the edge of
    // the screen to aim at, so it carries readouts only.
    static func isTextOnly(_ region: SlotRegion) -> Bool {
        region == .miniStatBand
    }

    static func readerControls(for region: SlotRegion) -> [PlayerComplication] {
        if isTextOnly(region) { return [] }
        #if os(iOS)
        return [
            .chapters, .bookmarks, .readingTimeline, .imageGallery, .search, .textSettings,
            .sleepTimer, .mirror, .scrollMode, .freeBrowseLock, .orientationLock,
        ]
        #else
        return [
            .chapters, .bookmarks, .readingTimeline, .imageGallery, .search, .textSettings,
            .sleepTimer, .scrollMode, .freeBrowseLock,
        ]
        #endif
    }

    // Every mini row takes every widget: the scrub bar and the title block are
    // just complications that expand to fill whatever room is left.
    static func playbackControls(for region: SlotRegion) -> [PlayerComplication] {
        if isTextOnly(region) { return [] }
        if isMiniRow(region) {
            return [
                .titleBlock, .scrubBar, .skipBackward, .playPause, .skipForward, .playbackSpeed,
            ]
        }
        switch region {
            case .dockCenter, .menuBar:
                return [.playPause, .skipBackward, .skipForward, .playbackSpeed]
            default:
                return []
        }
    }

    static func statComplications(for region: SlotRegion) -> [PlayerComplication] {
        switch region {
            case .dockLeading, .dockTrailing:
                return stats + dockOnlyStats
            default:
                return stats
        }
    }

    static func allowedComplications(for region: SlotRegion) -> [PlayerComplication] {
        [.none] + playbackControls(for: region) + readerControls(for: region)
            + statComplications(for: region)
    }

    static func sanitized(
        _ slots: [PlayerComplication],
        for region: SlotRegion,
    ) -> [PlayerComplication] {
        // macOS hides unsupported complications at render time instead of
        // rewriting them, so a layout authored on iOS survives a round trip
        // through the mac customize cards.
        #if os(macOS)
        return padded(slots, for: region)
        #else
        let allowed = allowedComplications(for: region)
        return padded(slots, for: region).map { allowed.contains($0) ? $0 : .none }
        #endif
    }

    static func padded(
        _ slots: [PlayerComplication],
        for region: SlotRegion,
    ) -> [PlayerComplication] {
        let count = slotCount(for: region)
        var result = Array(slots.prefix(count))
        while result.count < count { result.append(.none) }
        return result
    }
}

/// Mirrors a row, except skip back/forward keep their relative order when
/// both land in the same row.
func mirroredRowEntries<T>(
    _ entries: [T],
    comp: (T) -> PlayerComplication,
) -> [T] {
    var reversed = Array(entries.reversed())
    guard let origBack = entries.firstIndex(where: { comp($0) == .skipBackward }),
        let origForward = entries.firstIndex(where: { comp($0) == .skipForward }),
        let newBack = reversed.firstIndex(where: { comp($0) == .skipBackward }),
        let newForward = reversed.firstIndex(where: { comp($0) == .skipForward })
    else { return reversed }
    if (origBack < origForward) != (newBack < newForward) {
        reversed.swapAt(newBack, newForward)
    }
    return reversed
}

extension SettingsViewModel {
    func normalizeSlotArrays() {
        #if os(iOS)
        miniPlayerContentRowSlots = SlotLayout.sanitized(
            miniPlayerContentRowSlots, for: .miniContentRow)
        miniPlayerStatSlots = SlotLayout.sanitized(miniPlayerStatSlots, for: .miniStatBand)
        miniPlayerScrubRowSlots = SlotLayout.sanitized(miniPlayerScrubRowSlots, for: .miniScrubRow)
        miniPlayerExtraSlots = SlotLayout.sanitized(miniPlayerExtraSlots, for: .miniExtraRow)
        #endif
        dockLeadingSlots = SlotLayout.sanitized(dockLeadingSlots, for: .dockLeading)
        dockTrailingSlots = SlotLayout.sanitized(dockTrailingSlots, for: .dockTrailing)
        dockCenterSlots = SlotLayout.sanitized(dockCenterSlots, for: .dockCenter)
        menuBarSlots = SlotLayout.sanitized(menuBarSlots, for: .menuBar)
    }

    func slotComplication(_ slot: SlotRef) -> PlayerComplication {
        let slots = slotArray(for: slot.region)
        guard slot.index >= 0 && slot.index < slots.count else { return .none }
        return slots[slot.index]
    }

    func setSlotComplication(_ comp: PlayerComplication, at slot: SlotRef) {
        var slots = SlotLayout.padded(slotArray(for: slot.region), for: slot.region)
        guard slot.index >= 0 && slot.index < slots.count else { return }
        slots[slot.index] = comp
        setSlotArray(slots, for: slot.region)
        save()
    }

    private func slotArray(for region: SlotRegion) -> [PlayerComplication] {
        switch region {
            #if os(iOS)
            case .miniContentRow: return miniPlayerContentRowSlots
            case .miniStatBand: return miniPlayerStatSlots
            case .miniScrubRow: return miniPlayerScrubRowSlots
            case .miniExtraRow: return miniPlayerExtraSlots
            #else
            case .miniContentRow, .miniStatBand, .miniScrubRow, .miniExtraRow: return []
            #endif
            case .dockLeading: return dockLeadingSlots
            case .dockTrailing: return dockTrailingSlots
            case .dockCenter: return dockCenterSlots
            case .menuBar: return menuBarSlots
        }
    }

    private func setSlotArray(_ slots: [PlayerComplication], for region: SlotRegion) {
        switch region {
            #if os(iOS)
            case .miniContentRow: miniPlayerContentRowSlots = slots
            case .miniStatBand: miniPlayerStatSlots = slots
            case .miniScrubRow: miniPlayerScrubRowSlots = slots
            case .miniExtraRow: miniPlayerExtraSlots = slots
            #else
            case .miniContentRow, .miniStatBand, .miniScrubRow, .miniExtraRow: break
            #endif
            case .dockLeading: dockLeadingSlots = slots
            case .dockTrailing: dockTrailingSlots = slots
            case .dockCenter: dockCenterSlots = slots
            case .menuBar: menuBarSlots = slots
        }
    }
}
#endif
