#if os(macOS)
import Foundation
import SwiftUI

struct ImageViewerRequest: Codable, Hashable {
    let bookID: BookID
    let imageID: String
}

struct ChapterReferenceRequest: Codable, Hashable {
    let bookID: BookID
    let sectionIndex: Int
}

// New-highlight case carries only the cfi; the editor reads the live selection off the view model.
struct HighlightEditorRequest: Codable, Hashable {
    let bookID: BookID
    let highlightID: UUID?
    let selectionCfi: String?
}

@MainActor
final class EbookWindowRouter {
    static let shared = EbookWindowRouter()

    private struct WeakEntry {
        weak var viewModel: EbookPlayerViewModel?
    }

    private var entries: [BookID: WeakEntry] = [:]

    func register(_ viewModel: EbookPlayerViewModel, for bookID: BookID) {
        entries[bookID] = WeakEntry(viewModel: viewModel)
    }

    func unregister(for bookID: BookID) {
        entries.removeValue(forKey: bookID)
    }

    func viewModel(for bookID: BookID) -> EbookPlayerViewModel? {
        entries[bookID]?.viewModel
    }
}
#endif
