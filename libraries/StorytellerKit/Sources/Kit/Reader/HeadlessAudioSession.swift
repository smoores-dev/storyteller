import Foundation

@StorytellerUIActor
public enum HeadlessAudioSession {
    public static func open(bookID: BookID, category: LocalMediaCategory) async throws {
        switch category {
            case .audio:
                try await openAudiobook(bookID)
            case .synced:
                try await openReadaloud(bookID)
            case .ebook:
                throw AudiobookSessionError.localMediaUnavailable(bookID.uuid)
        }
    }

    private static func openAudiobook(_ bookID: BookID) async throws {
        await endHeadlessReadaloud()
        try await AudioSessionActor.shared.openAudiobook(bookID: bookID)
    }

    private static func openReadaloud(_ bookID: BookID) async throws {
        let snapshot = await BookServiceActor.shared.librarySnapshot(policy: .cachedOnly)
        guard let metadata = snapshot.books.first(where: { $0.id == bookID }) else {
            throw AudiobookSessionError.bookNotFound(bookID.uuid)
        }

        let session = ReadingSessionStore.shared.obtain(
            metadata: metadata,
            category: .synced,
            localMediaPath: nil,
            settings: nil,
        )
        session.prepare()
        await session.awaitPreparation()
        if let error = session.lastPrepareError {
            throw error
        }

        if let cover = await coverData(for: bookID) {
            await AudioSessionActor.shared.setSessionCover(cover, for: bookID)
        }
    }

    private static func endHeadlessReadaloud() async {
        guard case .readaloud(let bookID) = await AudioSessionActor.shared.currentSessionKind()
        else { return }
        await ReadingSessionStore.shared.endIfViewDetached(for: bookID)
    }

    private static func coverData(for bookID: BookID) async -> Data? {
        if let data = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: true) {
            return data
        }
        return await BookServiceActor.shared.cachedCoverData(for: bookID, audio: false)
    }
}
