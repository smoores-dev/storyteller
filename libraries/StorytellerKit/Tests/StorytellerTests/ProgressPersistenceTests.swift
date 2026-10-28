import Foundation
import Testing

@testable import StorytellerKit

@Suite("Durable progress")
struct ProgressPersistenceTests {
    @Test func aFailedWriteCanRetryTheSamePositionAndRestoreOffline() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await actor.readBookProgress(for: fixture.book) == nil)
        try FileManager.default.createDirectory(
            at: fixture.file,
            withIntermediateDirectories: false,
        )

        let failed = await actor.queueOfflineProgress(
            bookID: fixture.book,
            locator: fixture.locator,
            timestamp: 100,
            syncedToStoryteller: false,
        )
        #expect(failed == nil)
        #expect(try await actor.readBookProgress(for: fixture.book) == nil)
        try FileManager.default.removeItem(at: fixture.file)
        let retried = await actor.queueOfflineProgress(
            bookID: fixture.book,
            locator: fixture.locator,
            timestamp: 100,
            syncedToStoryteller: false,
        )
        #expect(retried != nil)

        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        let restored = try await reopened.readBookProgress(for: fixture.book)
        #expect(restored?.locator == fixture.locator)
        #expect(restored?.timestamp == 100)
    }

    @Test(arguments: [false, true])
    func aDelayedOrFailedOlderWriteCannotReplaceANewerPosition(failFirst: Bool) async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let writer = HeldProgressWriter(file: fixture.file, failFirst: failFirst)
        let persistence = ProgressQueuePersistence(
            load: fixture.persistence.load,
            save: { try await writer.save($0) },
        )
        let actor = ProgressSyncActor(queuePersistence: persistence)
        let first = Task {
            await actor.queueOfflineProgress(
                bookID: fixture.book,
                locator: fixture.locator,
                timestamp: 100,
                syncedToStoryteller: false,
            )
        }
        for _ in 0..<1_000 where await writer.started == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await writer.started == 1)
        let second = Task {
            await actor.queueOfflineProgress(
                bookID: fixture.book,
                locator: fixture.locator,
                timestamp: 200,
                syncedToStoryteller: false,
            )
        }
        try await Task.sleep(for: .milliseconds(10))
        #expect(await actor.getBookProgress(for: fixture.book) == nil)
        #expect(await writer.started == 1)
        await writer.release()
        #expect((await first.value == nil) == failFirst)
        #expect(await second.value != nil)
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await reopened.readBookProgress(for: fixture.book)?.timestamp == 200)
    }

    @Test func remoteProgressIsDurableBeforePublicationAndIdenticalPollsDoNotWrite() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let recorder = ProgressRecorder()
        let persistence = ProgressQueuePersistence(
            load: fixture.persistence.load,
            save: { records in
                await recorder.writing()
                try await fixture.persistence.save(records)
            },
        )
        let actor = ProgressSyncActor(queuePersistence: persistence)
        _ = await actor.addIncomingPositionObserver(for: fixture.book) { incoming in
            let onDisk = try? FilesystemActor.readProgressQueue(from: fixture.file).first
            Task { await recorder.received(incoming.timestamp, persisted: onDisk?.timestamp) }
        }
        #expect(
            await actor.receiveServerPositions([fixture.book: fixture.position(200)])[fixture.book]?
                .result
                == .serverIncomingAccepted
        )
        for _ in 0..<1_000 where await recorder.notifications.isEmpty {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await recorder.notifications == [200])
        #expect(await recorder.persistedAtNotification == [200])
        for _ in 0..<3 {
            #expect(
                await actor.receiveServerPositions([fixture.book: fixture.position(200)]).isEmpty
            )
        }
        #expect(await recorder.writes == 1)
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        let restored = try await reopened.readBookProgress(for: fixture.book)
        #expect(restored?.locator == fixture.locator)
        #expect(restored?.timestamp == 200)
        #expect(await reopened.getPendingProgressSyncs().isEmpty)
    }

    @StorytellerUIActor
    @Test func aReaderRestoresAcceptedRemoteProgressAfterAnOfflineRestart() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        func reader(using progress: ProgressSyncActor) -> ReadingSession {
            ReadingSession(
                metadata: fixture.metadata,
                category: .ebook,
                localMediaPath: nil,
                settings: HeadlessReaderSettings(),
                engine: PlaybackEngineActor(factory: ProtocolTestFactory()),
                progressAccess: ReadingProgressAccess(
                    read: { try await progress.readBookProgress(for: $0) },
                    save: { _, _, _, _ in
                        Issue.record("Accepting remote progress must not generate a local upload")
                        return false
                    },
                    uploadPending: {
                        #expect(await progress.getPendingProgressSyncs().isEmpty)
                    },
                ),
            )
        }
        let original = reader(using: actor)
        try await original.initializeTextProgress()
        #expect(original.playback.accepted == nil)
        _ = await actor.addIncomingPositionObserver(for: fixture.book) { incoming in
            Task { @StorytellerUIActor in
                await original.applyIncomingPosition(incoming, accepted: true)
            }
        }
        _ = await actor.receiveServerPositions([fixture.book: fixture.position(200)])
        for _ in 0..<1_000 where original.playback.acceptedAt != 200 {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(original.playback.accepted == fixture.locator)
        #expect(original.playback.savedAt == 200)
        await original.handleSceneEnteredBackground()
        await original.close(.endSession)

        let restarted = reader(using: ProgressSyncActor(queuePersistence: fixture.persistence))
        try await restarted.initializeTextProgress()
        #expect(restarted.playback.accepted == fixture.locator)
        #expect(restarted.playback.acceptedAt == 200)
        #expect(restarted.playback.savedAt == 200)
        await restarted.close(.endSession)
    }

    @Test func aCatalogBatchMakesOneDurableWriteAndOneLibraryNotification() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let recorder = ProgressRecorder()
        let actor = ProgressSyncActor(
            queuePersistence: ProgressQueuePersistence(
                load: fixture.persistence.load,
                save: { records in
                    await recorder.writing()
                    try await fixture.persistence.save(records)
                },
            )
        )
        _ = await actor.addObserver { Task { await recorder.libraryChanged() } }
        let positions = Dictionary(
            uniqueKeysWithValues: (0..<20).map {
                (
                    BookID(sourceID: fixture.book.sourceID, uuid: "book-\($0)"),
                    fixture.position(Double($0 + 100)),
                )
            }
        )
        #expect(await actor.receiveServerPositions(positions).count == 20)
        for _ in 0..<1_000 where await recorder.libraryNotifications == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await recorder.writes == 1)
        #expect(await recorder.libraryNotifications == 1)
        #expect(await actor.receiveServerPositions(positions).isEmpty)
        #expect(await recorder.writes == 1)
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(await reopened.getAllBookProgress().count == 20)
        #expect(await reopened.getPendingProgressSyncs().isEmpty)
    }

    @Test func failedRemoteWriteDoesNotPublishOrAdvanceMemoryAndCanRetry() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await actor.readBookProgress(for: fixture.book) == nil)
        let recorder = ProgressRecorder()
        _ = await actor.addIncomingPositionObserver(for: fixture.book) { incoming in
            Task { await recorder.received(incoming.timestamp, persisted: nil) }
        }
        try FileManager.default.createDirectory(
            at: fixture.file,
            withIntermediateDirectories: false,
        )
        #expect(await actor.receiveServerPositions([fixture.book: fixture.position(200)]).isEmpty)
        #expect(try await actor.readBookProgress(for: fixture.book) == nil)
        #expect(await recorder.notifications.isEmpty)
        try FileManager.default.removeItem(at: fixture.file)
        #expect(
            await actor.receiveServerPositions([fixture.book: fixture.position(200)])[fixture.book]?
                .result
                == .serverIncomingAccepted
        )
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await reopened.readBookProgress(for: fixture.book)?.timestamp == 200)
    }

    @Test func aNewerLocalSaveWaitsForAnOlderRemoteCommit() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let writer = HeldProgressWriter(file: fixture.file, failFirst: false)
        let actor = ProgressSyncActor(
            queuePersistence: ProgressQueuePersistence(
                load: fixture.persistence.load,
                save: { try await writer.save($0) },
            )
        )
        let remote = Task {
            await actor.receiveServerPositions([fixture.book: fixture.position(100)])
        }
        for _ in 0..<1_000 where await writer.started == 0 {
            try await Task.sleep(for: .milliseconds(1))
        }
        let local = Task {
            await actor.queueOfflineProgress(
                bookID: fixture.book,
                locator: fixture.locator,
                timestamp: 200,
            )
        }
        try await Task.sleep(for: .milliseconds(10))
        #expect(await writer.started == 1)
        #expect(try await actor.readBookProgress(for: fixture.book) == nil)
        await writer.release()
        #expect(await !remote.value.isEmpty)
        #expect(await local.value != nil)
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await reopened.readBookProgress(for: fixture.book)?.timestamp == 200)
        #expect(await reopened.getPendingProgressSyncs().first?.timestamp == 200)
    }

    @Test func acknowledgedAndIgnoredUploadsBothKeepTheRestartPosition() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        _ = await actor.receiveServerPositions([fixture.book: fixture.position(100)])
        _ = await actor.queueOfflineProgress(
            bookID: fixture.book,
            locator: fixture.locator,
            timestamp: 200,
        )
        let pending = try #require(await actor.getPendingProgressSyncs().first)
        #expect(await actor.recordUpload(pending))
        _ = await actor.receiveServerPositions([fixture.book: fixture.position(200)])
        #expect(await actor.getPendingProgressSyncs().isEmpty)
        var reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await reopened.readBookProgress(for: fixture.book)?.timestamp == 200)
        _ = await reopened.queueOfflineProgress(
            bookID: fixture.book,
            locator: fixture.locator,
            timestamp: 300,
        )
        await reopened.removePendingSync(for: fixture.book)
        reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await reopened.readBookProgress(for: fixture.book)?.timestamp == 300)
        #expect(await reopened.getPendingProgressSyncs().isEmpty)
    }

    @Test func cachedMetadataCannotAcknowledgePendingProgressOrReplaceSavedProgress() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        _ = await actor.queueOfflineProgress(
            bookID: fixture.book,
            locator: fixture.locator,
            timestamp: 200,
        )
        let reopened = ProgressSyncActor(queuePersistence: fixture.persistence)
        await reopened.restoreCachedPositions([fixture.book: fixture.position(200)])
        #expect(await reopened.getPendingProgressSyncs().first?.timestamp == 200)
        _ = await reopened.receiveServerPositions([fixture.book: fixture.position(300)])
        await reopened.restoreCachedPositions([fixture.book: fixture.position(100)])
        let restartedAgain = ProgressSyncActor(queuePersistence: fixture.persistence)
        #expect(try await restartedAgain.readBookProgress(for: fixture.book)?.timestamp == 300)
    }

    @Test func unreadableProgressIsNotDeletedOrTreatedAsEmpty() async throws {
        let fixture = try ProgressFileFixture()
        defer { fixture.remove() }
        let invalid = Data("incomplete progress data".utf8)
        try invalid.write(to: fixture.file)
        let actor = ProgressSyncActor(queuePersistence: fixture.persistence)
        await #expect(throws: ProgressSyncActor.ProgressReadError.self) {
            _ = try await actor.readBookProgress(for: fixture.book)
        }
        #expect(try Data(contentsOf: fixture.file) == invalid)
    }

    @Test func failedPeriodicFlushesRespectTheSelectedIntervalAndNever() async throws {
        let actor = ProgressSyncActor(
            queuePersistence: ProgressQueuePersistence(
                load: { throw CocoaError(.fileReadUnknown) },
                save: { _ in Issue.record("No write expected") },
            )
        )
        let now = Date(timeIntervalSince1970: 1000)
        #expect(await actor.periodicFlushIsDue(interval: 30, now: now))
        _ = await actor.flushQueue(notifyUser: false, now: now)
        #expect(await !actor.periodicFlushIsDue(interval: 30, now: now.addingTimeInterval(5)))
        #expect(await !actor.periodicFlushIsDue(interval: 30, now: now.addingTimeInterval(29)))
        #expect(await actor.periodicFlushIsDue(interval: 30, now: now.addingTimeInterval(30)))
        #expect(await !actor.periodicFlushIsDue(interval: -1, now: now.addingTimeInterval(3600)))
        _ = await actor.flushQueue(notifyUser: false, now: now.addingTimeInterval(10))
        #expect(await !actor.periodicFlushIsDue(interval: 30, now: now.addingTimeInterval(30)))
        #expect(await actor.periodicFlushIsDue(interval: 30, now: now.addingTimeInterval(40)))
    }
}

private struct ProgressFileFixture: Sendable {
    let directory: URL
    var file: URL { directory.appendingPathComponent("progress.json") }
    let book = BookID(sourceID: "test-source", uuid: "test-book")
    let locator = BookLocator(
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        title: nil,
        locations: .init(
            fragments: ["sentence-3"],
            progression: nil,
            position: nil,
            totalProgression: 0.5,
            cssSelector: nil,
            partialCfi: nil,
            domRange: nil,
        ),
        text: nil,
    )

    init() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    var persistence: ProgressQueuePersistence {
        let file = file
        return ProgressQueuePersistence(
            load: { try FilesystemActor.readProgressQueue(from: file) },
            save: { try FilesystemActor.writeProgressQueue($0, to: file) },
        )
    }

    var metadata: BookMetadata {
        BookMetadata(
            bookID: book,
            title: "Progress test",
            subtitle: nil,
            description: nil,
            language: nil,
            createdAt: nil,
            updatedAt: nil,
            publicationDate: nil,
            authors: nil,
            narrators: nil,
            creators: nil,
            series: nil,
            tags: nil,
            collections: nil,
            ebook: nil,
            audiobook: nil,
            readaloud: nil,
            status: nil,
            position: nil,
            rating: nil,
        )
    }

    func position(_ timestamp: Double) -> BookReadingPosition {
        BookReadingPosition(
            uuid: nil,
            locator: locator,
            timestamp: timestamp,
            createdAt: nil,
            updatedAt: nil,
        )
    }

    func remove() { try? FileManager.default.removeItem(at: directory) }
}

private actor HeldProgressWriter {
    let file: URL
    let failFirst: Bool
    var started = 0
    private var continuation: CheckedContinuation<Void, Never>?

    init(file: URL, failFirst: Bool) {
        self.file = file
        self.failFirst = failFirst
    }

    func save(_ records: [PendingProgressSync]) async throws {
        started += 1
        if started == 1 {
            await withCheckedContinuation { continuation = $0 }
            if failFirst { throw CocoaError(.fileWriteUnknown) }
        }
        try FilesystemActor.writeProgressQueue(records, to: file)
    }

    func release() {
        continuation?.resume()
        continuation = nil
    }
}

private actor ProgressRecorder {
    var writes = 0
    var libraryNotifications = 0
    func libraryChanged() { libraryNotifications += 1 }
    var notifications: [Double] = []
    var persistedAtNotification: [Double?] = []
    func writing() { writes += 1 }
    func received(_ timestamp: Double, persisted: Double?) {
        notifications.append(timestamp)
        persistedAtNotification.append(persisted)
    }
}
