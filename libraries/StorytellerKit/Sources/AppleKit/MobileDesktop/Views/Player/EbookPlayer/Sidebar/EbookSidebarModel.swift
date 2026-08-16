#if os(macOS)
import Foundation
import SwiftUI

@MainActor
@Observable
final class EbookSidebarModel {
    let bookID: BookID?

    var recentVisits: [ReadingVisit] = []
    var spineFileSizes: [String: Int] = [:]
    var sectionDurations: [Int: Double] = [:]
    var navSearchText = ""
    var annotationSearchText = ""

    private var visitObserverID: UUID?
    private var isObservingVisits = false
    private var spineSizesRoot: URL?
    private var durationsSectionCount = -1

    init(bookID: BookID?) {
        self.bookID = bookID
        startObservingVisits()
    }

    func startObservingVisits() {
        guard !isObservingVisits, bookID != nil else { return }
        isObservingVisits = true
        Task {
            await refreshVisits()
            visitObserverID = await ReadingTimelineActor.shared.addObserver { [weak self] in
                Task { @MainActor [weak self] in
                    await self?.refreshVisits()
                }
            }
        }
    }

    func stopObservingVisits() {
        isObservingVisits = false
        guard let visitObserverID else { return }
        self.visitObserverID = nil
        Task {
            await ReadingTimelineActor.shared.removeObserver(id: visitObserverID)
        }
    }

    func refreshVisits() async {
        guard let bookID else { return }
        let visits = await ReadingTimelineActor.shared.getVisits(for: bookID)
        recentVisits = visits.sorted { $0.endedAt > $1.endedAt }
    }

    func clearVisits() {
        guard let bookID else { return }
        Task {
            await ReadingTimelineActor.shared.clearVisits(for: bookID)
            recentVisits = []
        }
    }

    func loadSpineFileSizes(structure: [SectionInfo], root: URL?) async {
        guard let root, spineSizesRoot != root else { return }
        spineSizesRoot = root
        let ids = structure.map(\.id)
        let sizes = await Task.detached(priority: .utility) {
            var result: [String: Int] = [:]
            for id in ids {
                let path = root.appendingPathComponent(id).path
                if let attrs = try? FileManager.default.attributesOfItem(atPath: path),
                    let size = attrs[.size] as? Int
                {
                    result[id] = size
                }
            }
            return result
        }.value
        spineFileSizes = sizes
    }

    func deriveSectionDurations(structure: [SectionInfo]) {
        guard structure.count != durationsSectionCount else { return }
        durationsSectionCount = structure.count
        var durations: [Int: Double] = [:]
        for section in structure where !section.mediaOverlay.isEmpty {
            durations[section.index] = section.mediaOverlay.reduce(0) {
                $0 + max(0, $1.end - $1.begin)
            }
        }
        sectionDurations = durations
    }
}
#endif
