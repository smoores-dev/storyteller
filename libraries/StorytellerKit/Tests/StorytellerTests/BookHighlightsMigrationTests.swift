import Foundation
import Testing

@testable import StorytellerKit

private struct ReleasedHighlightsFixture: Encodable {
    let bookId: String
    let highlights: [ReleasedHighlightFixture]
}

private struct ReleasedHighlightFixture: Encodable {
    let id: UUID
    let bookId: String
    let locator: BookLocator
    let text: String
    let color: HighlightColor?
    let note: String?
    let createdAt: Date
}

private struct CurrentBookFixture: Encodable {
    let id: BookID
    let title: String
}

private struct HighlightsMigrationFixture {
    let root: URL
    let applicationSupport: URL

    init() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(
            "BookHighlightsMigrationTests-\(UUID().uuidString)",
            isDirectory: true,
        )
        applicationSupport = root.appendingPathComponent("ApplicationSupport", isDirectory: true)
        try FileManager.default.createDirectory(
            at: applicationSupport,
            withIntermediateDirectories: true,
        )
    }

    func migration(_ sources: [BookHighlightsMigration.Source]) -> BookHighlightsMigration {
        BookHighlightsMigration(
            applicationSupportDirectory: applicationSupport,
            sources: sources,
        )
    }

    func storytellerSource(_ id: BookSourceID) -> BookHighlightsMigration.Source {
        BookHighlightsMigration.Source(
            id: id,
            kind: .storyteller,
            cacheDirectory:
                applicationSupport
                .appendingPathComponent("SourceCache", isDirectory: true)
                .appendingPathComponent(id, isDirectory: true),
            folderDirectory: nil,
        )
    }

    func folderSource(_ id: BookSourceID) -> BookHighlightsMigration.Source {
        BookHighlightsMigration.Source(
            id: id,
            kind: .localFolder,
            cacheDirectory:
                applicationSupport
                .appendingPathComponent("SourceCache", isDirectory: true)
                .appendingPathComponent(id, isDirectory: true),
            folderDirectory: root.appendingPathComponent("Folder-\(id)", isDirectory: true),
        )
    }

    func writeStorytellerBooks(
        _ uuids: [String],
        source: BookHighlightsMigration.Source,
    ) throws {
        try FileManager.default.createDirectory(
            at: source.cacheDirectory,
            withIntermediateDirectories: true,
        )
        let books = uuids.map {
            CurrentBookFixture(
                id: BookID(sourceID: source.id, uuid: $0),
                title: $0,
            )
        }
        try JSONEncoder().encode(books).write(
            to: source.cacheDirectory.appendingPathComponent("library_metadata.json"),
            options: .atomic,
        )
    }

    func writeFolderBooks(
        _ uuids: [String],
        source: BookHighlightsMigration.Source,
        storedSourceID: BookSourceID? = nil,
    ) throws {
        let directory = try #require(source.folderDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let state = FolderSourceLibraryState(
            sourceID: storedSourceID ?? source.id,
            works: uuids.map {
                FolderSourceWork(uuid: $0, title: $0, groupingKey: $0)
            },
        )
        try JSONEncoder().encode(state).write(
            to: directory.appendingPathComponent("library_metadata.json"),
            options: .atomic,
        )
    }

    @discardableResult
    func writeReleased(
        bookID: String,
        highlights: [ReleasedHighlightFixture],
        filename: String? = nil,
    ) throws -> (url: URL, data: Data) {
        let directory = applicationSupport.appendingPathComponent(
            "Highlights",
            isDirectory: true,
        )
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(
            ReleasedHighlightsFixture(bookId: bookID, highlights: highlights)
        )
        let url = directory.appendingPathComponent(filename ?? "\(bookID).json")
        try data.write(to: url, options: .atomic)
        return (url, data)
    }
}

@Test func highlightMigrationArchivesAndMigratesOneOwner() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try fixture.writeStorytellerBooks(["book"], source: source)
    let released = releasedHighlight(text: "legacy")
    let root = try fixture.writeReleased(bookID: "book", highlights: [released])
    let migration = fixture.migration([source])

    try migration.run()

    let archived = migration.v1Directory.appendingPathComponent("book.json")
    #expect(!FileManager.default.fileExists(atPath: root.url.path))
    #expect(try Data(contentsOf: archived) == root.data)
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    let bookID = BookID(sourceID: source.id, uuid: "book")
    let migrated = try readV2(migration, bookID: bookID)
    #expect(migrated.count == 1)
    #expect(migrated.first?.id == released.id)
    #expect(migrated.first?.bookID == bookID)
    #expect(FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func highlightMigrationFansOutToStorytellerAndFolderOwners() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let storyteller = fixture.storytellerSource("source-a")
    let folder = fixture.folderSource("source-b")
    try fixture.writeStorytellerBooks(["shared"], source: storyteller)
    try fixture.writeFolderBooks(["shared"], source: folder)
    let released = releasedHighlight(text: "shared")
    try fixture.writeReleased(bookID: "shared", highlights: [released])
    let migration = fixture.migration([storyteller, folder])

    try migration.run()

    let storytellerID = BookID(sourceID: storyteller.id, uuid: "shared")
    let folderID = BookID(sourceID: folder.id, uuid: "shared")
    #expect(try readV2(migration, bookID: storytellerID).first?.bookID == storytellerID)
    #expect(try readV2(migration, bookID: folderID).first?.bookID == folderID)
    #expect(FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func ownerlessHighlightsRetryUntilAnOwnerIsKnown() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try fixture.writeStorytellerBooks([], source: source)
    let released = releasedHighlight(text: "waiting")
    try fixture.writeReleased(bookID: "book", highlights: [released])
    let migration = fixture.migration([source])

    try migration.run()

    let archived = migration.v1Directory.appendingPathComponent("book.json")
    #expect(!FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    #expect(!FileManager.default.fileExists(atPath: migration.sentinelURL.path))

    try fixture.writeStorytellerBooks(["book"], source: source)
    try migration.run()

    let bookID = BookID(sourceID: source.id, uuid: "book")
    #expect(try readV2(migration, bookID: bookID).map(\.id) == [released.id])
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    #expect(FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func markedHighlightFileNeverFansOutToAnOwnerDiscoveredLater() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let original = fixture.storytellerSource("original")
    let later = fixture.storytellerSource("later")
    let pendingOwner = fixture.storytellerSource("pending-owner")
    try fixture.writeStorytellerBooks(["completed"], source: original)
    try fixture.writeStorytellerBooks([], source: later)
    try fixture.writeStorytellerBooks([], source: pendingOwner)
    try fixture.writeReleased(
        bookID: "completed",
        highlights: [releasedHighlight(bookID: "completed", text: "completed")],
    )
    try fixture.writeReleased(
        bookID: "pending",
        highlights: [releasedHighlight(bookID: "pending", text: "pending")],
    )
    let firstMigration = fixture.migration([original, later, pendingOwner])

    try firstMigration.run()

    let completedArchive = firstMigration.v1Directory.appendingPathComponent("completed.json")
    #expect(
        FileManager.default.fileExists(
            atPath: firstMigration.markerURL(for: completedArchive).path
        )
    )
    #expect(!FileManager.default.fileExists(atPath: firstMigration.sentinelURL.path))

    try fixture.writeStorytellerBooks(["completed"], source: later)
    try fixture.writeStorytellerBooks(["pending"], source: pendingOwner)
    let secondMigration = fixture.migration([original, later, pendingOwner])
    try secondMigration.run()

    #expect(
        !FileManager.default.fileExists(
            atPath: secondMigration.v2FileURL(
                for: BookID(sourceID: later.id, uuid: "completed")
            ).path
        )
    )
    #expect(
        try readV2(
            secondMigration,
            bookID: BookID(sourceID: pendingOwner.id, uuid: "pending"),
        ).count == 1
    )
    #expect(FileManager.default.fileExists(atPath: secondMigration.sentinelURL.path))
}

@Test func existingV2HighlightWinsAnIDConflict() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try fixture.writeStorytellerBooks(["book"], source: source)
    let conflictingID = UUID()
    let uniqueID = UUID()
    try fixture.writeReleased(
        bookID: "book",
        highlights: [
            releasedHighlight(id: conflictingID, text: "legacy conflict"),
            releasedHighlight(id: uniqueID, text: "legacy unique"),
        ],
    )
    let migration = fixture.migration([source])
    let bookID = BookID(sourceID: source.id, uuid: "book")
    let current = currentHighlight(id: conflictingID, bookID: bookID, text: "current wins")
    try writeV2([current], migration: migration, bookID: bookID)

    try migration.run()

    let migrated = try readV2(migration, bookID: bookID)
    #expect(migrated.map(\.id) == [conflictingID, uniqueID])
    #expect(migrated.first?.text == "current wins")
}

@Test func partialHighlightFanoutRerunsIdempotently() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let sourceA = fixture.storytellerSource("a")
    let sourceB = fixture.storytellerSource("b")
    try fixture.writeStorytellerBooks(["book"], source: sourceA)
    try fixture.writeStorytellerBooks(["book"], source: sourceB)
    let released = releasedHighlight(text: "legacy")
    try fixture.writeReleased(bookID: "book", highlights: [released])
    let migration = fixture.migration([sourceA, sourceB])
    let bookA = BookID(sourceID: sourceA.id, uuid: "book")
    let bookB = BookID(sourceID: sourceB.id, uuid: "book")
    let blockedDirectory = migration.v2FileURL(for: bookB).deletingLastPathComponent()
    try FileManager.default.createDirectory(
        at: blockedDirectory.deletingLastPathComponent(),
        withIntermediateDirectories: true,
    )
    try Data("not-a-directory".utf8).write(to: blockedDirectory)

    try migration.run()

    let archived = migration.v1Directory.appendingPathComponent("book.json")
    #expect(try readV2(migration, bookID: bookA).map(\.id) == [released.id])
    #expect(!FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    #expect(!FileManager.default.fileExists(atPath: migration.sentinelURL.path))

    try FileManager.default.removeItem(at: blockedDirectory)
    try migration.run()

    #expect(try readV2(migration, bookID: bookA).map(\.id) == [released.id])
    #expect(try readV2(migration, bookID: bookB).map(\.id) == [released.id])
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    #expect(FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func malformedAndEmptyV1FilesArePreservedAndMarkedTerminal() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let highlights = fixture.applicationSupport.appendingPathComponent(
        "Highlights",
        isDirectory: true,
    )
    try FileManager.default.createDirectory(at: highlights, withIntermediateDirectories: true)
    let malformed = Data("not-json".utf8)
    try malformed.write(to: highlights.appendingPathComponent("malformed.json"))
    let empty = try fixture.writeReleased(bookID: "empty", highlights: [])
    let migration = fixture.migration([])

    try migration.run()

    let malformedArchive = migration.v1Directory.appendingPathComponent("malformed.json")
    let emptyArchive = migration.v1Directory.appendingPathComponent("empty.json")
    #expect(try Data(contentsOf: malformedArchive) == malformed)
    #expect(try Data(contentsOf: emptyArchive) == empty.data)
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: malformedArchive).path))
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: emptyArchive).path))
    #expect(FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func unreadableV2HighlightsAreNeverClobbered() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try fixture.writeStorytellerBooks(["book"], source: source)
    try fixture.writeReleased(bookID: "book", highlights: [releasedHighlight(text: "legacy")])
    let migration = fixture.migration([source])
    let bookID = BookID(sourceID: source.id, uuid: "book")
    let v2 = migration.v2FileURL(for: bookID)
    try FileManager.default.createDirectory(
        at: v2.deletingLastPathComponent(),
        withIntermediateDirectories: true,
    )
    let unreadable = Data("not-current-json".utf8)
    try unreadable.write(to: v2)

    try migration.run()

    let archived = migration.v1Directory.appendingPathComponent("book.json")
    #expect(try Data(contentsOf: v2) == unreadable)
    #expect(!FileManager.default.fileExists(atPath: migration.markerURL(for: archived).path))
    #expect(!FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func globalHighlightSentinelMakesEveryLaterRunANoOp() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try FileManager.default.createDirectory(
        at: source.cacheDirectory,
        withIntermediateDirectories: true,
    )
    try Data("invalid catalog".utf8).write(
        to: source.cacheDirectory.appendingPathComponent("library_metadata.json")
    )
    let migration = fixture.migration([source])
    try FileManager.default.createDirectory(
        at: migration.sentinelURL.deletingLastPathComponent(),
        withIntermediateDirectories: true,
    )
    try Data("done\n".utf8).write(to: migration.sentinelURL)
    let late = try fixture.writeReleased(
        bookID: "late",
        highlights: [releasedHighlight(bookID: "late", text: "late")],
    )

    try migration.run()

    #expect(FileManager.default.fileExists(atPath: late.url.path))
    #expect(!FileManager.default.fileExists(atPath: migration.v1Directory.path))
}

@Test func archiveFailurePreventsGlobalHighlightCompletion() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    try fixture.writeReleased(bookID: "book", highlights: [releasedHighlight(text: "legacy")])
    let migration = fixture.migration([])
    try FileManager.default.createDirectory(
        at: migration.v1Directory.appendingPathComponent("book.json", isDirectory: true),
        withIntermediateDirectories: true,
    )

    try migration.run()

    #expect(
        FileManager.default.fileExists(
            atPath: migration.highlightsDirectory.appendingPathComponent("book.json").path
        )
    )
    #expect(!FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func corruptOrMismatchedSourceCatalogDoesNotBlockKnownOwners() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let valid = fixture.storytellerSource("valid")
    let corrupt = fixture.storytellerSource("corrupt")
    let mismatchedFolder = fixture.folderSource("folder")
    try fixture.writeStorytellerBooks(["known"], source: valid)
    try FileManager.default.createDirectory(
        at: corrupt.cacheDirectory,
        withIntermediateDirectories: true,
    )
    try Data("invalid".utf8).write(
        to: corrupt.cacheDirectory.appendingPathComponent("library_metadata.json")
    )
    try fixture.writeFolderBooks(
        ["wrong-folder"],
        source: mismatchedFolder,
        storedSourceID: "some-other-source",
    )
    try fixture.writeReleased(
        bookID: "known",
        highlights: [releasedHighlight(bookID: "known", text: "known")],
    )
    try fixture.writeReleased(
        bookID: "wrong-folder",
        highlights: [releasedHighlight(bookID: "wrong-folder", text: "waiting")],
    )
    let migration = fixture.migration([valid, corrupt, mismatchedFolder])

    try migration.run()

    let knownArchive = migration.v1Directory.appendingPathComponent("known.json")
    let waitingArchive = migration.v1Directory.appendingPathComponent("wrong-folder.json")
    #expect(FileManager.default.fileExists(atPath: migration.markerURL(for: knownArchive).path))
    #expect(!FileManager.default.fileExists(atPath: migration.markerURL(for: waitingArchive).path))
    #expect(
        try readV2(
            migration,
            bookID: BookID(sourceID: valid.id, uuid: "known"),
        ).count == 1
    )
    #expect(!FileManager.default.fileExists(atPath: migration.sentinelURL.path))
}

@Test func releasedTempIsRecoveredOnlyWhenItsJSONDoesNotExist() throws {
    let fixture = try HighlightsMigrationFixture()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let source = fixture.storytellerSource("source-a")
    try fixture.writeStorytellerBooks(["temp-only", "json-wins"], source: source)
    try fixture.writeReleased(
        bookID: "temp-only",
        highlights: [releasedHighlight(bookID: "temp-only", text: "temp recovered")],
        filename: "temp-only.tmp",
    )
    try fixture.writeReleased(
        bookID: "json-wins",
        highlights: [releasedHighlight(bookID: "json-wins", text: "json")],
        filename: "json-wins.json",
    )
    try fixture.writeReleased(
        bookID: "json-wins",
        highlights: [releasedHighlight(bookID: "json-wins", text: "temp ignored")],
        filename: "json-wins.tmp",
    )
    let migration = fixture.migration([source])

    try migration.run()

    #expect(
        try readV2(
            migration,
            bookID: BookID(sourceID: source.id, uuid: "temp-only"),
        ).first?.text == "temp recovered"
    )
    #expect(
        try readV2(
            migration,
            bookID: BookID(sourceID: source.id, uuid: "json-wins"),
        ).first?.text == "json"
    )
}

private func releasedHighlight(
    id: UUID = UUID(),
    bookID: String = "book",
    text: String,
) -> ReleasedHighlightFixture {
    ReleasedHighlightFixture(
        id: id,
        bookId: bookID,
        locator: testHighlightLocator,
        text: text,
        color: .yellow,
        note: nil,
        createdAt: Date(timeIntervalSince1970: 1),
    )
}

private func currentHighlight(id: UUID, bookID: BookID, text: String) -> Highlight {
    Highlight(
        id: id,
        bookID: bookID,
        locator: testHighlightLocator,
        text: text,
        color: .yellow,
        createdAt: Date(timeIntervalSince1970: 2),
    )
}

private let testHighlightLocator = BookLocator(
    href: "chapter.xhtml",
    type: "application/xhtml+xml",
    title: "Chapter",
    locations: nil,
    text: nil,
)

private func writeV2(
    _ highlights: [Highlight],
    migration: BookHighlightsMigration,
    bookID: BookID,
) throws {
    let url = migration.v2FileURL(for: bookID)
    try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true,
    )
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    try encoder.encode(highlights).write(to: url, options: .atomic)
}

private func readV2(
    _ migration: BookHighlightsMigration,
    bookID: BookID,
) throws -> [Highlight] {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(
        [Highlight].self,
        from: Data(contentsOf: migration.v2FileURL(for: bookID)),
    )
}
