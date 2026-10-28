import Foundation
import Observation

/// Reuses the active session or closes it before opening another.
@StorytellerUIActor
@Observable
public final class ActiveReadingSession {
    public static let shared = ActiveReadingSession()
    public private(set) var current: ReadingSession?
    @ObservationIgnored private var opening: Task<ReadingSession, Never>?
    private init() {}

    /// Returns a session for the book and category. The caller must call prepare().
    public func open(
        metadata: BookMetadata,
        category: LocalMediaCategory,
        localMediaPath: URL?,
        settings: (any ReaderSettingsReading)?,
    ) async -> ReadingSession {
        let previous = opening
        let task = Task { @StorytellerUIActor in
            _ = await previous?.value
            if let current = self.current, current.bookID == metadata.id,
                current.category == category, !current.isEnded
            {
                if let settings { current.settings = settings }
                if let localMediaPath { current.localMediaPath = localMediaPath }
                return current
            }
            if let old = self.current { await old.close(.endSession) }
            let session = ReadingSession(
                metadata: metadata,
                category: category,
                localMediaPath: localMediaPath,
                settings: settings ?? HeadlessReaderSettings(),
            )
            self.current = session
            return session
        }
        opening = task
        return await task.value
    }

    /// Opens downloaded content and awaits preparation.
    public func open(bookID: BookID, category: LocalMediaCategory) async throws -> ReadingSession {
        let library = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let book = library.books.first(where: { $0.id == bookID }) else {
            throw AudiobookSessionError.bookNotFound(bookID.uuid)
        }
        let session = await open(
            metadata: book,
            category: category,
            localMediaPath: nil,
            settings: nil,
        )
        session.prepare()
        await session.awaitPreparation()
        if let error = session.lastPrepareError { throw error }
        return session
    }

    func release(_ session: ReadingSession) {
        if current === session { current = nil }
    }
}
