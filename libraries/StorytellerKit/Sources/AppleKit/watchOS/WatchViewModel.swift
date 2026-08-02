#if os(watchOS)
import Foundation
import StorytellerKit
import SwiftUI

@MainActor
@Observable
public final class WatchViewModel {
    var books: [BookMetadata] = []
    var receivingTitle: String?
    var receivedChunks: Int = 0
    var totalChunks: Int = 0
    var savingBook: (bookID: BookID, title: String)?
    var remotePlaybackState: RemotePlaybackState?
    private var started = false

    var transferProgress: Double {
        guard totalChunks > 0 else { return 0 }
        return Double(receivedChunks) / Double(totalChunks)
    }

    init() {}

    func start() {
        guard !started else { return }
        started = true
        loadBooks()
        setupObservers()
        Task {
            await BookServiceActor.shared.startPeriodicLibraryRefresh(
                usingProgressSyncInterval: false
            )
        }
    }

    private func setupObservers() {
        WatchSessionManager.shared.onTransferProgress = { [weak self] title, received, total in
            Task { @MainActor in
                self?.receivingTitle = title
                self?.receivedChunks = received
                self?.totalChunks = total
            }
        }

        WatchSessionManager.shared.onTransferComplete = { [weak self] bookID, title in
            Task { @MainActor in
                self?.receivingTitle = nil
                self?.receivedChunks = 0
                self?.totalChunks = 0
                self?.savingBook = (bookID: bookID, title: title)
            }
        }

        WatchSessionManager.shared.onImportComplete = { [weak self] success in
            Task { @MainActor in
                if !success {
                    self?.receivingTitle = nil
                    self?.receivedChunks = 0
                    self?.totalChunks = 0
                    self?.savingBook = nil
                }
                self?.loadBooks()
            }
        }

        WatchSessionManager.shared.onBookDeleted = { [weak self] in
            Task { @MainActor in
                self?.loadBooks()
            }
        }

        WatchSessionManager.shared.onPlaybackStateReceived = { [weak self] state in
            Task { @MainActor in
                self?.remotePlaybackState = state
            }
        }

        Task {
            await BookServiceActor.shared.addLibraryCacheObserver { [weak self] in
                Task { @MainActor in
                    self?.loadBooks()
                }
            }
        }
    }

    func requestPlaybackState() {
        WatchSessionManager.shared.requestPlaybackState()
    }

    func sendPlaybackCommand(_ command: RemotePlaybackCommand) {
        WatchSessionManager.shared.sendPlaybackCommand(command)
    }

    func loadBooks() {
        Task {
            let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
            let booksWithFiles = snapshot.books.filter { book in
                snapshot.mediaPaths[book.id]?.syncedPath != nil
            }
            await MainActor.run {
                self.books = booksWithFiles
                if let saving = self.savingBook,
                    booksWithFiles.contains(where: { $0.id == saving.bookID })
                {
                    self.savingBook = nil
                }
            }
        }
    }

    func deleteBook(_ book: BookMetadata, category: LocalMediaCategory) {
        Task {
            try? await BookServiceActor.shared.deleteCachedMedia(
                for: book.id,
                category: category,
            )
        }
    }

}
#endif
