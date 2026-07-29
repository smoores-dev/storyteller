import Foundation

@globalActor
public actor BookmarkActor {
    public static let shared = BookmarkActor()

    private var highlightsByBook: [BookID: [Highlight]] = [:]
    private var loadedBooks: Set<BookID> = []
    private var observers: [UUID: @Sendable @MainActor () -> Void] = [:]

    public init() {}

    public func getHighlights(bookID: BookID) async -> [Highlight] {
        guard await ensureLoaded(bookID: bookID) else { return [] }
        return highlightsByBook[bookID] ?? []
    }

    public func getBookmarks(bookID: BookID) async -> [Highlight] {
        let all = await getHighlights(bookID: bookID)
        return all.filter { $0.isBookmark }
    }

    public func getColoredHighlights(bookID: BookID) async -> [Highlight] {
        let all = await getHighlights(bookID: bookID)
        return all.filter { !$0.isBookmark }
    }

    public func addHighlight(_ highlight: Highlight) async {
        guard await ensureLoaded(bookID: highlight.bookID) else { return }

        var highlights = highlightsByBook[highlight.bookID] ?? []
        highlights.append(highlight)
        highlights.sort { $0.createdAt > $1.createdAt }
        highlightsByBook[highlight.bookID] = highlights

        await saveToDisk(bookID: highlight.bookID)
        await notifyObservers()

        debugLog(
            "[BookmarkActor] addHighlight: id=\(highlight.id), bookID=\(highlight.bookID), isBookmark=\(highlight.isBookmark)"
        )
    }

    public func deleteHighlight(id: UUID, bookID: BookID) async {
        guard await ensureLoaded(bookID: bookID) else { return }

        guard var highlights = highlightsByBook[bookID] else { return }

        let before = highlights.count
        highlights.removeAll { $0.id == id }
        highlightsByBook[bookID] = highlights

        if highlights.count != before {
            await saveToDisk(bookID: bookID)
            await notifyObservers()
            debugLog("[BookmarkActor] deleteHighlight: id=\(id), bookID=\(bookID)")
        }
    }

    public func updateHighlight(_ highlight: Highlight) async {
        guard await ensureLoaded(bookID: highlight.bookID) else { return }

        guard var highlights = highlightsByBook[highlight.bookID] else { return }

        if let index = highlights.firstIndex(where: { $0.id == highlight.id }) {
            highlights[index] = highlight
            highlightsByBook[highlight.bookID] = highlights
            await saveToDisk(bookID: highlight.bookID)
            await notifyObservers()
            debugLog(
                "[BookmarkActor] updateHighlight: id=\(highlight.id), bookID=\(highlight.bookID)"
            )
        }
    }

    public func deleteAllHighlights(bookID: BookID) async {
        highlightsByBook[bookID] = []
        loadedBooks.insert(bookID)

        do {
            try await FilesystemActor.shared.deleteHighlights(bookID: bookID)
            debugLog("[BookmarkActor] deleteAllHighlights: bookID=\(bookID)")
        } catch {
            debugLog("[BookmarkActor] deleteAllHighlights failed: \(error)")
        }

        await notifyObservers()
    }

    @discardableResult
    public func addObserver(_ callback: @escaping @Sendable @MainActor () -> Void) -> UUID {
        let id = UUID()
        observers[id] = callback
        debugLog("[BookmarkActor] addObserver: id=\(id), total=\(observers.count)")
        return id
    }

    public func removeObserver(id: UUID) {
        observers.removeValue(forKey: id)
        debugLog("[BookmarkActor] removeObserver: id=\(id), total=\(observers.count)")
    }

    private func ensureLoaded(bookID: BookID) async -> Bool {
        guard !loadedBooks.contains(bookID) else { return true }

        do {
            if let highlights = try await FilesystemActor.shared.loadHighlights(bookID: bookID) {
                highlightsByBook[bookID] = highlights
                debugLog("[BookmarkActor] loaded \(highlights.count) highlights for book \(bookID)")
            } else {
                highlightsByBook[bookID] = []
                debugLog("[BookmarkActor] no highlights file for book \(bookID)")
            }
            loadedBooks.insert(bookID)
            return true
        } catch {
            debugLog("[BookmarkActor] loadHighlights failed for \(bookID): \(error)")
            return false
        }
    }

    private func saveToDisk(bookID: BookID) async {
        let highlights = highlightsByBook[bookID] ?? []
        do {
            try await FilesystemActor.shared.saveHighlights(bookID: bookID, highlights: highlights)
            debugLog("[BookmarkActor] saved \(highlights.count) highlights for book \(bookID)")
        } catch {
            debugLog("[BookmarkActor] saveHighlights failed for \(bookID): \(error)")
        }
    }

    private func notifyObservers() async {
        for (_, callback) in observers {
            await callback()
        }
    }
}
