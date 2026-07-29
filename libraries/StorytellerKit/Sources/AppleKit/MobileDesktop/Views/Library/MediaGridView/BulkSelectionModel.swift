#if os(iOS) || os(macOS)
import SwiftUI

/// Multi-select state for the library grid. Lives alongside the grid's single-item
/// `activeInfoItem` selection: the info sidebar keeps tracking the last-tapped item
/// while this set drives the bulk action bar.
@MainActor
@Observable
final class BulkSelectionModel {
    var selectedIDs: Set<BookID> = []
    /// Explicit select mode (iOS). On macOS selection is entered implicitly via
    /// Cmd/Shift-click and this flag stays false.
    var isSelecting: Bool = false
    var isRunningAction: Bool = false
    var errorMessage: String? = nil
    private var rangeAnchorID: BookID?

    var isEmpty: Bool { selectedIDs.isEmpty }
    var count: Int { selectedIDs.count }

    func contains(_ id: BookID) -> Bool {
        selectedIDs.contains(id)
    }

    func toggle(_ id: BookID) {
        if selectedIDs.contains(id) {
            selectedIDs.remove(id)
        } else {
            selectedIDs.insert(id)
        }
        rangeAnchorID = id
    }

    /// Extends the selection from the last anchor to `id` over the given visual order.
    func extendRange(to id: BookID, in orderedItems: [BookMetadata]) {
        guard let anchor = rangeAnchorID,
            let anchorIndex = orderedItems.firstIndex(where: { $0.id == anchor }),
            let targetIndex = orderedItems.firstIndex(where: { $0.id == id })
        else {
            toggle(id)
            return
        }
        let range = min(anchorIndex, targetIndex)...max(anchorIndex, targetIndex)
        selectedIDs.formUnion(orderedItems[range].map(\.id))
    }

    /// Folds the grid's existing single-card highlight into a starting multi-selection so
    /// the first Cmd/Shift-click extends from what is already highlighted instead of
    /// discarding it.
    func seedIfEmpty(with id: BookID?) {
        guard selectedIDs.isEmpty, let id else { return }
        selectedIDs = [id]
        rangeAnchorID = id
    }

    func selectAll(_ items: [BookMetadata]) {
        selectedIDs = Set(items.map(\.id))
    }

    func deselectAll() {
        selectedIDs.removeAll()
        rangeAnchorID = nil
    }

    func clear() {
        selectedIDs.removeAll()
        rangeAnchorID = nil
        isSelecting = false
        errorMessage = nil
    }

    /// Drops selected books that are no longer visible after filtering or a refresh.
    func reconcile(with items: [BookMetadata]) {
        guard !selectedIDs.isEmpty else { return }
        let visible = Set(items.map(\.id))
        selectedIDs.formIntersection(visible)
        if let anchor = rangeAnchorID, !visible.contains(anchor) {
            rangeAnchorID = nil
        }
    }
}
#endif
