#if os(iOS)
import Foundation
import Observation
import UIKit

public struct CarPlayChapter: Identifiable, Sendable, Equatable {
    public let id: Int
    public let label: String
    /// Engine-agnostic chapter identity; the session actor resolves it.
    public let chapterID: String

    init(id: Int, label: String, chapterID: String) {
        self.id = id
        self.label = label
        self.chapterID = chapterID
    }
}

/// Displays chapters and handles CarPlay playback commands.
@MainActor
@Observable
public final class CarPlayCoordinator {
    public static let shared = CarPlayCoordinator()
    public var onLibraryUpdated: (() -> Void)?
    public var onChaptersUpdated: (() -> Void)?
    public var onPlaybackStateChanged: (() -> Void)?
    public var isCarPlayConnected = false {
        didSet {
            guard isCarPlayConnected != oldValue else { return }
            Task {
                _ = await ActiveReadingSession.shared.current?.ensureSynced(
                    reason: "CarPlay connection changed"
                )
            }
        }
    }
    private var snapshot: AudioSessionSnapshot?
    public private(set) var chapters: [CarPlayChapter] = []
    public private(set) var currentChapterID: String?

    private init() {
        Task {
            observePlayback()
            _ = await BookServiceActor.shared.addLibraryCacheObserver { [weak self] in
                Task { @MainActor in self?.onLibraryUpdated?() }
            }
            try? await BookServiceActor.shared.scanLibraryCache()
        }
    }
    private func observePlayback() {
        let (snapshot, listing) = withObservationTracking {
            let session = ActiveReadingSession.shared.current
            return (session?.playbackSnapshot, session?.chapters)
        } onChange: { [weak self] in
            Task { @MainActor in self?.observePlayback() }
        }
        self.snapshot = snapshot
        let newChapters = (listing?.chapters ?? []).enumerated().map { index, chapter in
            CarPlayChapter(id: index, label: chapter.title, chapterID: chapter.id)
        }
        if currentChapterID != listing?.currentChapterID || chapters != newChapters {
            currentChapterID = listing?.currentChapterID
            chapters = newChapters
            onChaptersUpdated?()
        }
        onPlaybackStateChanged?()
    }

    public func getDownloadedBooks(category: LocalMediaCategory) async -> [BookMetadata] {
        let library = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        let owner: PlaybackOwner = category == .synced ? .readaloud : .audiobook
        return library.books.filter { library.mediaPaths[$0.id]?.playbackOwner == owner }
            .sorted { ($0.position?.updatedAt ?? "") > ($1.position?.updatedAt ?? "") }
    }
    public func getCoverImage(for bookID: BookID) async -> UIImage? {
        if let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: true) {
            return UIImage(data: data)
        }
        if let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: false) {
            return UIImage(data: data)
        }
        return nil
    }
    public var hasPreviousChapter: Bool { chapters.count > 1 }
    public var hasNextChapter: Bool {
        guard let index = chapters.firstIndex(where: { $0.chapterID == currentChapterID }) else {
            return false
        }
        return index + 1 < chapters.count
    }
    public func goToPreviousChapter() {
        Task { await ActiveReadingSession.shared.current?.previousChapter() }
    }
    public func goToNextChapter() {
        Task { await ActiveReadingSession.shared.current?.nextChapter() }
    }
    public func selectChapter(id: String) {
        Task { await ActiveReadingSession.shared.current?.selectChapter(id: id) }
    }
    public func loadAndPlayBook(_ metadata: BookMetadata, category: LocalMediaCategory) async throws
    {
        let session = try await ActiveReadingSession.shared.open(
            bookID: metadata.id,
            category: category,
        )
        try await session.play()
    }
    public var isPlaying: Bool { snapshot?.isPlaying ?? false }
    public var activeBookId: BookID? { snapshot?.kind.bookID }
    public var activeCategory: LocalMediaCategory? {
        switch snapshot?.kind {
            case .audiobook: .audio
            case .readaloud: .synced
            case nil: nil
        }
    }
    public func isBookCurrentlyLoaded(_ bookID: BookID) -> Bool { activeBookId == bookID }
    public func isBookCurrentlyPlaying(_ bookID: BookID) -> Bool {
        activeBookId == bookID && isPlaying
    }
    public var currentPlaybackRate: Double { snapshot?.playbackRate ?? 1 }
    public func setPlaybackRate(_ rate: Double) async {
        await ActiveReadingSession.shared.current?.setPlaybackRate(rate)
    }
}
#endif
