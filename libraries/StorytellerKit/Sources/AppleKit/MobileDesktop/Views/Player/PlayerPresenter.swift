#if os(iOS)
import StorytellerKit
import SwiftUI
import UIKit

public struct PresentedPlayerCard: Identifiable {
    public let data: PlayerBookData
    public var id: String { "\(data.metadata.id)-\(data.category.rawValue)" }
}

/// Owns the single full-screen player card and the one-card rule: presenting a
/// new book ends whatever session the previous card (or the mini player) had.
@MainActor
@Observable
public final class PlayerPresenter {
    public static let shared = PlayerPresenter()

    public private(set) var card: PresentedPlayerCard?
    @ObservationIgnored private var dismissalKeepsSession = false

    private init() {}

    public var cardItemBinding: Binding<PresentedPlayerCard?> {
        Binding(
            get: { self.card },
            set: { newValue in
                if newValue == nil, self.card != nil {
                    self.dismissCard()
                }
            },
        )
    }

    public func present(_ data: PlayerBookData) {
        if let current = card, current.data == data {
            return
        }
        debugLog(
            "[PlayerPresenter] Presenting card for \(data.metadata.id) (\(data.category.rawValue))"
        )
        dismissalKeepsSession = false
        let replacingCard = card != nil
        card = PresentedPlayerCard(data: data)
        Task { await LastOpenBookStore.save(bookData: data) }
        if !replacingCard {
            // A replaced card ends its own session through its view teardown;
            // a live headless session (mini player, CarPlay) has no view to do
            // that, so end it here.
            Task { await Self.endLiveSession(excluding: data.metadata.id) }
        }
    }

    public func dismissCard() {
        guard let current = card else { return }
        let bookID = current.data.metadata.id
        Task { @MainActor in
            let kind = ActiveReadingSession.shared.current?.audioKind
            let snapshot = ActiveReadingSession.shared.current?.playbackSnapshot
            let keepsSession = kind?.bookID == bookID && snapshot?.isPlaying == true
            debugLog(
                "[PlayerPresenter] Dismissing card for \(bookID), keepsSession=\(keepsSession)"
            )
            self.dismissalKeepsSession = keepsSession
            if !keepsSession {
                LastOpenBookStore.clearIfMatching(
                    bookId: bookID,
                    category: current.data.category,
                )
            }
            self.card = nil
        }
    }

    /// Read by the card views in onDisappear to pick their close policy; the
    /// flag resets on read so a later replacement defaults to end-session.
    func cardDismissalKeepsSession() -> Bool {
        let value = dismissalKeepsSession
        dismissalKeepsSession = false
        return value
    }

    public func expandMiniPlayer() {
        Task { @MainActor in
            guard let kind = ActiveReadingSession.shared.current?.audioKind else { return }
            guard
                let data = await Self.loadPlayerBookData(
                    bookID: kind.bookID,
                    category: Self.category(for: kind),
                )
            else {
                debugLog("[PlayerPresenter] Could not build book data to expand mini player")
                return
            }
            self.present(data)
        }
    }

    public func stopSession() {
        Task { @MainActor in
            guard let kind = ActiveReadingSession.shared.current?.audioKind else { return }
            debugLog("[PlayerPresenter] Stopping session for \(kind.bookID)")
            LastOpenBookStore.clearIfMatching(
                bookId: kind.bookID,
                category: Self.category(for: kind),
            )
            await Self.endLiveSession(excluding: nil)
        }
    }

    private static func category(for kind: AudioSessionKind) -> LocalMediaCategory {
        switch kind {
            case .audiobook:
                return .audio
            case .readaloud:
                return .synced
        }
    }

    private static func endLiveSession(excluding newBookID: BookID?) async {
        guard let session = ActiveReadingSession.shared.current, session.bookID != newBookID else {
            return
        }
        await session.close(.endSession)
    }

    private static func loadPlayerBookData(
        bookID: BookID,
        category: LocalMediaCategory,
    ) async -> PlayerBookData? {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let metadata = snapshot.books.first(where: { $0.id == bookID }) else { return nil }
        let localMediaPath = await BookServiceActor.shared.resolveLocalMedia(
            for: bookID,
            category: category,
        )?.url

        let hasAudio = metadata.hasAvailableAudiobook
        let audioCover = await loadCachedCover(bookID: bookID, audio: true)
        let standardCover = await loadCachedCover(bookID: bookID, audio: false)
        let primaryCover =
            hasAudio ? (audioCover ?? standardCover) : (standardCover ?? audioCover)

        return PlayerBookData(
            metadata: metadata,
            localMediaPath: localMediaPath,
            category: category,
            coverArt: primaryCover,
            ebookCoverArt: hasAudio ? standardCover : nil,
        )
    }

    private static func loadCachedCover(bookID: BookID, audio: Bool) async -> Image? {
        guard let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: audio),
            let uiImage = UIImage(data: data)
        else { return nil }
        return Image(uiImage: uiImage)
    }
}
#endif
