import Foundation
import StorytellerAppleWidgets
import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Suite("Widget progress publication")
struct WidgetProgressTests {
    @Test func startupRepairsAStaleSnapshotFromSavedProgress() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let book = makeBook("one")
        await StorytellerWidgetSnapshotStore.publishSnapshot(
            metadata: [book],
            progress: [book.id: progress(0.1, at: 1000)],
            sources: [],
            container: root,
            coverData: { _, _ in Data([1, 2, 3]) },
        )
        let before = StorytellerWidgetSnapshotStore.loadSnapshot(from: root)

        let queueFile = root.appendingPathComponent("progress-queue.json")
        let saved = progress(0.7, at: 2000)
        try FilesystemActor.writeProgressQueue(
            [
                PendingProgressSync(
                    bookID: book.id,
                    locator: try #require(saved.locator),
                    timestamp: 2000,
                    syncedToStoryteller: false,
                )
            ],
            to: queueFile,
        )
        let restartedProgress = ProgressSyncActor(
            queuePersistence: ProgressQueuePersistence(
                load: { try FilesystemActor.readProgressQueue(from: queueFile) },
                save: { try FilesystemActor.writeProgressQueue($0, to: queueFile) },
            )
        )
        await StorytellerWidgetSnapshotStore.publishSnapshot(
            metadata: [book],
            progress: await restartedProgress.getAllBookProgress(),
            sources: [],
            container: root,
            coverData: { _, _ in Data([1, 2, 3]) },
        )
        let repaired = StorytellerWidgetSnapshotStore.loadSnapshot(from: root)
        #expect(repaired.books.first?.progress == 0.7)
        #expect(repaired.books.first?.lastReadAt == Date(timeIntervalSince1970: 2))
        #expect(repaired.books.first?.summary == before.books.first?.summary)
        #expect(repaired.books.first?.coverFilename == before.books.first?.coverFilename)
    }

    @Test func fullPublicationUpdatesMetadataProgressAndMembershipTogether() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let first = makeBook("one")
        let second = makeBook("two")
        await StorytellerWidgetSnapshotStore.publishSnapshot(
            metadata: [first, second],
            progress: [:],
            sources: [],
            container: root,
            coverData: { _, _ in nil },
        )
        let renamed = makeBook("one", title: "Updated title")
        await StorytellerWidgetSnapshotStore.publishSnapshot(
            metadata: [renamed],
            progress: [first.id: progress(0.8, at: 2000)],
            sources: [],
            container: root,
            coverData: { _, _ in nil },
        )
        let snapshot = StorytellerWidgetSnapshotStore.loadSnapshot(from: root)
        #expect(snapshot.books.map(\.id) == [first.id])
        #expect(snapshot.books.first?.title == "Updated title")
        #expect(snapshot.books.first?.progress == 0.8)
        #expect(snapshot.books.first?.isCurrentlyReading == true)
    }

    @MainActor
    @Test func laterPublicationWaitsAndReadsFreshProgressWhenItRuns() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let book = makeBook("one")
        let model = MediaViewModel(
            injectLibrary: BookLibrary(
                bookMetaData: [],
                ebookCoverCache: [:],
                audiobookCoverCache: [:],
            )
        )
        let source = WidgetProgressSource()
        let gate = CoverGate()
        let publish: @Sendable () async -> Void = {
            let fraction = await source.read()
            await StorytellerWidgetSnapshotStore.publishSnapshot(
                metadata: [book],
                progress: [book.id: progress(fraction, at: fraction * 10000)],
                sources: [],
                container: root,
                coverData: { _, _ in await gate.read() },
            )
        }
        let first = Task { await model.publishWidgetSnapshot(using: publish) }
        for _ in 0..<1000 where await !gate.waiting {
            try await Task.sleep(for: .milliseconds(1))
        }
        #expect(await gate.waiting)
        await source.set(0.9)
        let second = Task { await model.publishWidgetSnapshot(using: publish) }
        try await Task.sleep(for: .milliseconds(10))
        #expect(await source.reads == 1)
        await gate.release()
        await first.value
        await second.value
        #expect(await source.reads == 2)
        #expect(
            StorytellerWidgetSnapshotStore.loadSnapshot(from: root).books.first?.progress == 0.9
        )
    }

    private func temporaryDirectory() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func makeBook(_ id: String, title: String? = nil) -> BookMetadata {
        BookMetadata(
            bookID: BookID(sourceID: "widget-tests", uuid: id),
            title: title ?? id,
            subtitle: nil,
            description: "<p>A <strong>formatted</strong> description.</p>",
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

    private func progress(_ fraction: Double, at timestamp: Double) -> BookProgress {
        BookProgress(
            locator: BookLocator(
                href: "chapter.xhtml",
                type: "application/xhtml+xml",
                title: nil,
                locations: .init(
                    fragments: nil,
                    progression: nil,
                    position: nil,
                    totalProgression: fraction,
                    cssSelector: nil,
                    partialCfi: nil,
                    domRange: nil,
                ),
                text: nil,
            ),
            timestamp: timestamp,
            source: .pendingSync,
        )
    }
}

private actor CoverGate {
    var waiting = false
    private var continuation: CheckedContinuation<Void, Never>?

    func read() async -> Data? {
        if !waiting {
            waiting = true
            await withCheckedContinuation { continuation = $0 }
        }
        return nil
    }

    func release() {
        continuation?.resume()
        continuation = nil
    }
}

private actor WidgetProgressSource {
    private var fraction = 0.1
    var reads = 0
    func read() -> Double {
        reads += 1
        return fraction
    }
    func set(_ fraction: Double) { self.fraction = fraction }
}
