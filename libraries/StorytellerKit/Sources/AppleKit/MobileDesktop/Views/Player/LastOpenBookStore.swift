#if os(iOS)
import Foundation
import SwiftUI
import UIKit

public enum LastOpenBookStore {
    public struct Route: Codable, Equatable {
        public let category: LocalMediaCategory
        public let openedAt: Date
        public let metadata: BookMetadata

        public var bookID: BookID { metadata.id }

        public init(
            category: LocalMediaCategory,
            openedAt: Date,
            metadata: BookMetadata,
        ) {
            self.category = category
            self.openedAt = openedAt
            self.metadata = metadata
        }
    }

    private static let key = "iOSLastOpenBookRoute"

    public static var hasSavedRoute: Bool {
        UserDefaults.standard.data(forKey: key) != nil
    }

    static func save(bookData: PlayerBookData) async {
        let route = Route(
            category: bookData.category,
            openedAt: Date(),
            metadata: bookData.metadata,
        )
        guard let data = try? JSONEncoder().encode(route) else { return }
        UserDefaults.standard.set(data, forKey: key)
        debugLog(
            "[LastOpenBookStore] saved bookID=\(route.bookID) category=\(route.category.rawValue)"
        )
    }

    public static func load() -> Route? {
        guard let data = UserDefaults.standard.data(forKey: key) else {
            debugLog("[LastOpenBookStore] load: no saved route")
            return nil
        }
        guard let route = try? JSONDecoder().decode(Route.self, from: data) else {
            debugLog("[LastOpenBookStore] load: failed to decode saved route")
            return nil
        }
        debugLog(
            "[LastOpenBookStore] load: bookID=\(route.bookID) category=\(route.category.rawValue) openedAt=\(route.openedAt)"
        )
        return route
    }

    public static func loadPlayerBookData() async -> PlayerBookData? {
        guard let route = load() else { return nil }
        let metadata = route.metadata

        var checkpoint = CFAbsoluteTimeGetCurrent()
        func mark(_ name: String) {
            let now = CFAbsoluteTimeGetCurrent()
            debugLog(
                "[RestoreTrace][Restore] loadPlayerBookData.\(name) deltaMs=\(String(format: "%.1f", (now - checkpoint) * 1000))"
            )
            checkpoint = now
        }

        guard
            let localMediaPath = await BookServiceActor.shared.resolveLocalMedia(
                for: route.bookID,
                category: route.category,
            )?.url
        else { return nil }
        mark("resolvePath")

        // coverArt is not Codable, so it is lost when the route is persisted. Reload it from
        // the on-disk cover cache, mirroring MediaItemCardView.makePlayerBookData: the primary
        // art is the audio square when an audiobook exists, otherwise the standard cover.
        let hasAudio = metadata.hasAvailableAudiobook
        let audioCover = await loadCachedCover(bookID: metadata.id, audio: true)
        let standardCover = await loadCachedCover(bookID: metadata.id, audio: false)
        mark("loadCovers")
        // Primary art is the audio square when an audiobook exists, falling back to the
        // standard cover (and vice versa) so the player shows something when only one variant
        // was cached.
        let primaryCover = hasAudio ? (audioCover ?? standardCover) : (standardCover ?? audioCover)
        let ebookCover = hasAudio ? standardCover : nil

        return PlayerBookData(
            metadata: metadata,
            localMediaPath: localMediaPath,
            category: route.category,
            coverArt: primaryCover,
            ebookCoverArt: ebookCover,
        )
    }

    private static func loadCachedCover(bookID: BookID, audio: Bool) async -> Image? {
        guard let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: audio),
            let uiImage = UIImage(data: data)
        else { return nil }
        return Image(uiImage: uiImage)
    }

    static func clearIfMatching(bookId: BookID, category: LocalMediaCategory) {
        guard let route = load(),
            route.bookID == bookId,
            route.category == category
        else { return }
        debugLog(
            "[LastOpenBookStore] clearIfMatching: matched bookId=\(bookId) category=\(category.rawValue)"
        )
        clear()
    }

    static func clear() {
        debugLog("[LastOpenBookStore] clear")
        UserDefaults.standard.removeObject(forKey: key)
    }
}
#endif
