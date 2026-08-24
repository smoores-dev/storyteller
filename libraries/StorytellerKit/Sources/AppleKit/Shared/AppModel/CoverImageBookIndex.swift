import CoreGraphics
import Foundation

enum CoverImageBookIndex {
    private final class Entry {
        let bookID: BookID
        let audio: Bool

        init(bookID: BookID, audio: Bool) {
            self.bookID = bookID
            self.audio = audio
        }
    }

    nonisolated(unsafe) private static let table: NSCache<CGImage, Entry> = {
        let cache = NSCache<CGImage, Entry>()
        cache.countLimit = 64
        return cache
    }()

    static func register(_ image: CGImage, bookID: BookID, audio: Bool) {
        table.setObject(Entry(bookID: bookID, audio: audio), forKey: image)
    }

    static func lookup(_ image: CGImage) -> (bookID: BookID, audio: Bool)? {
        guard let entry = table.object(forKey: image) else { return nil }
        return (entry.bookID, entry.audio)
    }
}
