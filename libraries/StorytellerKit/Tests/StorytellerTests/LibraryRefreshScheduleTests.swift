import Foundation
import Testing

@testable import StorytellerKit

@Test func catalogDemandStartsItsFetchBeforeTheSourceIsConnected() async throws {
    let source = ConnectingCatalogSource()
    let service = BookServiceActor(sources: [await source.sourceRecord: source])
    let owner = UUID()
    await service.setLibraryRefreshDemand(true, owner: owner)
    for _ in 0..<1_000 where await source.fetches == 0 {
        try await Task.sleep(for: .milliseconds(1))
    }
    #expect(await source.fetches == 1)
    #expect(await source.connectionStatus == .disconnected)
    await source.connect()
    await service.setLibraryRefreshDemand(false, owner: owner)
    #expect(await source.fetches == 1)
}

@Test func reusedStorytellerSourceReceivesItsCurrentName() async {
    var record = BookSourceRecord(
        id: "test",
        name: "Before",
        kind: .storyteller,
        capabilities: .storyteller,
    )
    let source = StorytellerActor(sourceRecord: record)
    record.name = "After"
    await source.updateSourceRecord(record)
    #expect(await source.sourceRecord == record)
}

@Test func catalogRefreshWaitsForDemandWithoutLosingItsDeadline() {
    let now = Date(timeIntervalSince1970: 1000)
    let first = UUID()
    let second = UUID()
    var schedule = LibraryRefreshSchedule()
    #expect(schedule.delay(interval: 300, now: now) == nil)
    schedule.owners.insert(first)
    #expect(schedule.delay(interval: 300, now: now) == 0)
    schedule.lastAttempt = now
    #expect(schedule.delay(interval: 300, now: now.addingTimeInterval(30)) == 270)
    schedule.owners.insert(second)
    schedule.owners.remove(first)
    #expect(schedule.delay(interval: 300, now: now.addingTimeInterval(30)) == 270)
    schedule.owners.remove(second)
    #expect(schedule.delay(interval: 300, now: now.addingTimeInterval(600)) == nil)
    schedule.owners.insert(first)
    #expect(schedule.delay(interval: 300, now: now.addingTimeInterval(600)) == 0)
    schedule.lastAttempt = now.addingTimeInterval(600)
    #expect(schedule.delay(interval: 300, now: now.addingTimeInterval(600)) == 300)
    #expect(schedule.delay(interval: -1, now: now.addingTimeInterval(600)) == nil)
    #expect(schedule.delay(interval: 60, now: now.addingTimeInterval(610)) == 50)
}

private actor ConnectingCatalogSource: BookSourceActor {
    let sourceRecord = BookSourceRecord(
        id: "test",
        name: "Test",
        kind: .storyteller,
        capabilities: .storyteller,
    )
    var connectionStatus: ConnectionStatus = .disconnected
    var fetches = 0
    private var continuation: CheckedContinuation<Void, Never>?

    func fetchLibraryInformation() async -> [BookMetadata]? {
        fetches += 1
        await withCheckedContinuation { continuation = $0 }
        return nil
    }

    func connect() {
        connectionStatus = .connected
        continuation?.resume()
        continuation = nil
    }

    func fetchCoverImage(
        for bookId: String,
        audio: Bool,
        width: Int?,
        height: Int?,
        version: String?,
        ifNoneMatch: String?,
        ifModifiedSince: String?,
    ) -> BookCover? { nil }
    func sendProgressToServer(bookId: String, locator: BookLocator, timestamp: Double) -> HTTPResult
    {
        .noConnection
    }
    func fetchBookPosition(bookId: String) -> BookReadingPosition? { nil }
    func resolveLocalMedia(for bookID: String, category: LocalMediaCategory) -> ResolvedLocalMedia?
    { nil }
    func localAudioFiles(for bookID: String) -> [URL] { [] }
    func acceptBook(
        bookUUID: String,
        title: String,
        ebook: StorytellerUploadAsset?,
        audiobooks: [StorytellerUploadAsset],
        readaloud: StorytellerUploadAsset?,
        collectionUUID: String?,
        onProgress: (@Sendable (Double) -> Void)?,
    ) -> String? { nil }
    func deleteBook(_ bookID: String) -> Bool { false }
    func deleteAsset(_ bookID: String, category: LocalMediaCategory) -> DeleteAssetResult {
        .notSupported
    }
    func replaceAsset(
        _ asset: StorytellerUploadAsset,
        bookID: String,
        replaceMetadata: Bool,
        onProgress: (@Sendable (Double) -> Void)?,
    ) -> ReplaceAssetResult { .notSupported }
    func updateStatus(forBooks bookIDs: [String], toStatusNamed statusName: String) -> Bool {
        false
    }
    func packageAudiobook(for bookID: String) -> URL? { nil }
}
