#if os(iOS)
import Foundation
import UIKit

public struct CarPlayChapter: Identifiable, Sendable {
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

private enum ActivePlayer {
    case smil
    case audiobook
}

@MainActor
@Observable
public final class CarPlayCoordinator {
    public static let shared = CarPlayCoordinator()

    public var onLibraryUpdated: (() -> Void)?
    public var onChaptersUpdated: (() -> Void)?
    public var onPlaybackStateChanged: (() -> Void)?
    public var isCarPlayConnected: Bool = false

    private var smilObserverId: UUID?
    private var audiobookObserverId: UUID?
    private var lmaObserverId: UUID?
    private var currentPlaybackState: SMILPlaybackState?
    private var currentAudiobookState: AudiobookPlaybackState?
    private var cachedSMILChapters: [SMILChapterSummary] = []
    private var cachedAudiobookChapters: [AudiobookSessionChapter] = []
    private var activePlayer: ActivePlayer?
    private var currentBookID: BookID?

    private init() {
        Task {
            await observeSMILPlayerActor()
            await observeAudiobookActor()
            await observeLocalMediaActor()
            await ensureLocalMediaScanned()
        }
    }

    private func observeAudiobookActor() async {
        audiobookObserverId = await AudiobookActor.shared.addStateObserver {
            [weak self] state in
            Task { @MainActor [weak self] in
                self?.handleAudiobookStateChange(state)
            }
        }
    }

    private func ensureLocalMediaScanned() async {
        do {
            try await BookServiceActor.shared.scanLibraryCache()
            debugLog("[CarPlayCoordinator] Local media scan complete")
        } catch {
            debugLog("[CarPlayCoordinator] Failed to scan local media: \(error)")
        }
    }

    private func observeLocalMediaActor() async {
        lmaObserverId = await BookServiceActor.shared.addLibraryCacheObserver { [weak self] in
            Task { @MainActor [weak self] in
                debugLog("[CarPlayCoordinator] Library updated, notifying CarPlay")
                self?.onLibraryUpdated?()
            }
        }
    }

    private func observeSMILPlayerActor() async {
        smilObserverId = await SMILPlayerActor.shared.addStateObserver {
            @MainActor [weak self] state in
            guard let self else { return }

            let previousBookID = self.currentPlaybackState?.bookID
            let previouslyPlaying = self.currentPlaybackState?.isPlaying ?? false

            debugLog(
                "[CarPlayCoordinator] State update: bookID=\(state.bookID?.description ?? "nil"), isPlaying=\(state.isPlaying), prev=\(previouslyPlaying)"
            )
            self.currentPlaybackState = state

            if let bookID = state.bookID {
                if previousBookID != bookID {
                    debugLog("[CarPlayCoordinator] SMIL book changed: \(bookID)")
                    self.currentBookID = bookID
                    self.activePlayer = .smil
                    Task {
                        await self.refreshBookStructure()
                    }
                }

                // SMIL progress syncing is owned by the ReadingSession.
            } else if previousBookID != nil {
                debugLog("[CarPlayCoordinator] SMIL book unloaded")
                self.currentBookID = nil
                self.activePlayer = nil
            }

            self.onPlaybackStateChanged?()
        }
        debugLog(
            "[CarPlayCoordinator] SMILPlayerActor observer registered: \(smilObserverId?.uuidString ?? "nil")"
        )
    }

    private func handleAudiobookStateChange(_ state: AudiobookPlaybackState) {
        guard activePlayer == .audiobook else { return }

        currentAudiobookState = state

        // Audiobook progress syncing is owned by AudioSessionActor.
        onPlaybackStateChanged?()
    }

    private func refreshBookStructure() async {
        cachedSMILChapters = await SMILPlayerActor.shared.getChapterSummaries()
        onChaptersUpdated?()
    }

    public func getDownloadedBooks(category: LocalMediaCategory) async -> [BookMetadata] {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)

        let wantedOwner: PlaybackOwner = category == .synced ? .readaloud : .audiobook
        let result = snapshot.books.filter {
            snapshot.mediaPaths[$0.id]?.playbackOwner == wantedOwner
        }

        return result.sorted { ($0.position?.updatedAt ?? "") > ($1.position?.updatedAt ?? "") }
    }

    public func getCoverImage(for bookId: BookID) async -> UIImage? {
        guard let data = await getCoverImageData(for: bookId) else { return nil }
        return UIImage(data: data)
    }

    private func getCoverImageData(for bookId: BookID) async -> Data? {
        // Try audioSquare first (preferred for CarPlay - square covers)
        if let data = await BookServiceActor.shared.cachedCoverData(for: bookId, audio: true) {
            return data
        }
        // Fall back to standard cover
        if let data = await BookServiceActor.shared.cachedCoverData(for: bookId, audio: false) {
            return data
        }
        // Last resort: extract from local file (for standalone imports)
        return nil
    }

    public var chapters: [CarPlayChapter] {
        switch activePlayer {
            case .audiobook:
                return cachedAudiobookChapters.enumerated().map { idx, chapter in
                    CarPlayChapter(id: idx, label: chapter.title, chapterID: chapter.id)
                }
            case .smil, .none:
                return cachedSMILChapters.enumerated().map { idx, chapter in
                    CarPlayChapter(id: idx, label: chapter.title, chapterID: chapter.id)
                }
        }
    }

    public var currentChapterID: String? {
        switch activePlayer {
            case .audiobook:
                return currentAudiobookState?.currentChapterIndex
                    .flatMap { cachedAudiobookChapters[safe: $0]?.id }
            case .smil, .none:
                guard let sectionIndex = currentPlaybackState?.currentSectionIndex else {
                    return nil
                }
                return cachedSMILChapters.first { $0.sectionIndex == sectionIndex }?.id
        }
    }

    private var currentChapterPosition: Int? {
        guard let id = currentChapterID else { return nil }
        return chapters.firstIndex { $0.chapterID == id }
    }

    public var hasPreviousChapter: Bool {
        chapters.count > 1
    }

    public var hasNextChapter: Bool {
        guard let position = currentChapterPosition else { return false }
        return position + 1 < chapters.count
    }

    public func goToPreviousChapter() {
        Task { await AudioSessionActor.shared.previousChapter() }
    }

    public func goToNextChapter() {
        Task { await AudioSessionActor.shared.nextChapter() }
    }

    public func selectChapter(id: String) {
        Task { await AudioSessionActor.shared.selectChapter(id: id) }
    }

    public func loadAndPlayBook(_ metadata: BookMetadata, category: LocalMediaCategory) async throws
    {
        debugLog("[CarPlayCoordinator] loadAndPlayBook: \(metadata.title), category: \(category)")

        activePlayer = category == .audio ? .audiobook : .smil
        currentBookID = metadata.id

        try await HeadlessAudioSession.open(bookID: metadata.id, category: category)
        try await AudioSessionActor.shared.transport(.play)

        if category == .audio {
            cachedAudiobookChapters =
                (await AudioSessionActor.shared.currentState())?.chapters ?? []
            onChaptersUpdated?()
        } else {
            await refreshBookStructure()
        }
        debugLog("[CarPlayCoordinator] Playback started for \(metadata.title)")
    }

    public var isPlaying: Bool {
        switch activePlayer {
            case .audiobook:
                return currentAudiobookState?.isPlaying ?? false
            case .smil, .none:
                return currentPlaybackState?.isPlaying ?? false
        }
    }

    public var activeBookId: BookID? {
        currentBookID
    }

    public var activeCategory: LocalMediaCategory? {
        switch activePlayer {
            case .audiobook:
                return .audio
            case .smil:
                return .synced
            case .none:
                return nil
        }
    }

    public func isBookCurrentlyLoaded(_ bookID: BookID) -> Bool {
        activeBookId == bookID
    }

    public func isBookCurrentlyPlaying(_ bookID: BookID) -> Bool {
        activeBookId == bookID && isPlaying
    }

    public var currentPlaybackRate: Double {
        switch activePlayer {
            case .audiobook:
                return Double(currentAudiobookState?.playbackRate ?? 1.0)
            case .smil, .none:
                return currentPlaybackState?.playbackRate ?? 1.0
        }
    }

    public func setPlaybackRate(_ rate: Double) async {
        await AudioSessionActor.shared.setPlaybackRate(rate)
        debugLog("[CarPlayCoordinator] Playback rate set to \(rate)x")
    }

}
#endif
