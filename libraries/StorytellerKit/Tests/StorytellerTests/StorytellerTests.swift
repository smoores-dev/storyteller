import Foundation
import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Test func playerBookDataIdentityIgnoresMutableMetadata() async throws {
    var originalMetadata = makeBook(publicationDate: nil, sourceID: "source-a")
    var refreshedMetadata = originalMetadata
    originalMetadata.pageCount = 100
    refreshedMetadata.pageCount = 101

    let path = URL(fileURLWithPath: "/tmp/book.epub")
    let original = PlayerBookData(
        metadata: originalMetadata,
        localMediaPath: path,
        category: .ebook,
    )
    let refreshed = PlayerBookData(
        metadata: refreshedMetadata,
        localMediaPath: path,
        category: .ebook,
    )

    #expect(original == refreshed)
    #expect(original.hashValue == refreshed.hashValue)
}

@Test func publicationYearExtractsFourDigitYearFromSupportedDates() async throws {
    #expect(BookMetadata.publicationYear(from: "1950-01-02T00:00:00.000Z") == "1950")
    #expect(BookMetadata.publicationYear(from: "1987-09-16") == "1987")
    #expect(BookMetadata.publicationYear(from: " 1989-01-01T05:00:00.000Z ") == "1989")
    #expect(BookMetadata.publicationYear(from: "Unknown") == nil)
    #expect(BookMetadata.publicationYear(from: nil) == nil)
}

@Test func publicationYearSmartShelfNormalizesLegacyTimestampValues() async throws {
    let book = BookMetadata(
        bookID: BookID(sourceID: "test-source", uuid: "book-id"),
        title: "Book",
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: nil,
        updatedAt: nil,
        publicationDate: "1950-01-02T00:00:00.000Z",
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

    let condition = ShelfCondition.publicationYear(
        mode: .include,
        values: ["1950-01-02T00:00:00.000Z"],
    )

    #expect(book.sortablePublicationYear == "1950")
    #expect(condition.matches(book, progress: 0))
}

@Test func publicationDateSortKeyUsesFullDateWithinYear() async throws {
    let january = makeBook(publicationDate: "1950-01-02T00:00:00.000Z")
    let september = makeBook(publicationDate: "1950-09-16")

    #expect(january.sortablePublicationYear == september.sortablePublicationYear)
    #expect(january.sortablePublicationDate < september.sortablePublicationDate)
}

@Test func alignedAtSortKeyAndParserUseRawAlignedDate() async throws {
    var book = makeBook(publicationDate: nil)
    book.alignedAt = "Mon Dec 15 2025 17:23:45 GMT+0100 (Central European Standard Time)"

    #expect(StorytellerDate.parse(book.alignedAt, field: .alignedAt) != nil)
    #expect(book.sortableAlignedAt != "99999999999999")
}

@MainActor
@Test func smartShelfBooksUsePublishedDerivationSnapshot() async throws {
    let shelf = SmartShelf(name: "Recent", conditions: [])
    let book = makeBook(publicationDate: nil)
    let viewModel = MediaViewModel(
        injectLibrary: BookLibrary(
            bookMetaData: [book],
            ebookCoverCache: [:],
            audiobookCoverCache: [:],
        )
    )

    #expect(viewModel.booksForShelf(shelf).isEmpty)

    viewModel.libraryViewSnapshot = LibraryViewSnapshot(
        generation: 1,
        smartShelfBooks: [shelf.id: [book]],
    )

    #expect(viewModel.booksForShelf(shelf).map(\.id) == [book.id])
}

@Test func malformedLocatorFragmentsDecodeAsNoFragments() throws {
    let data = """
        {
          "uuid": "position-1",
          "timestamp": 1710000000000,
          "locator": {
            "href": "OEBPS/xhtml/30_Chapter_23_Resurrecti.xhtml",
            "type": "application/xhtml+xml",
            "locations": {
              "fragments": [
                {
                  "0": "c",
                  "1": "h",
                  "2": "a",
                  "3": "p"
                }
              ],
              "progression": 0.42,
              "totalProgression": 0.68
            }
          }
        }
        """.data(using: .utf8)!

    let position = try JSONDecoder().decode(BookReadingPosition.self, from: data)

    #expect(position.locator?.href == "OEBPS/xhtml/30_Chapter_23_Resurrecti.xhtml")
    #expect(position.locator?.locations?.fragments == nil)
    #expect(position.locator?.locations?.progression == 0.42)
    #expect(position.locator?.locations?.totalProgression == 0.68)
}

@Test func malformedLocatorDoesNotDropLibraryBook() throws {
    let data = """
        [
          {
            "id": {
              "sourceID": "test-source",
              "uuid": "book-1"
            },
            "title": "Still Visible",
            "position": {
              "uuid": "position-1",
              "timestamp": 1710000000000,
              "locator": {
                "href": { "unexpected": "object" },
                "type": "application/xhtml+xml",
                "locations": {
                  "totalProgression": 0.68
                }
              }
            }
          }
        ]
        """.data(using: .utf8)!

    let books = try JSONDecoder().decode(LenientArrayWrapper<BookMetadata>.self, from: data).values

    #expect(books.count == 1)
    #expect(books.first?.title == "Still Visible")
    #expect(books.first?.position?.locator == nil)
}

@Test func formURLEncodedBodyEscapesFormUnsafeCharacters() async throws {
    let body = formURLEncodedBody(["password": ">-\",+&= a"])
    let encoded = try #require(body.flatMap { String(data: $0, encoding: .utf8) })
    #expect(encoded == "password=%3E-%22,%2B%26%3D%20a")
}

@Test func folderSourceLibraryStateRoundTripsWorksMediaAndProgress() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let position = BookReadingPosition(
        uuid: "position-id",
        locator: nil,
        timestamp: 123,
        createdAt: nil,
        updatedAt: nil,
    )
    let state = FolderSourceLibraryState(
        sourceID: "source-id",
        works: [
            FolderSourceWork(
                uuid: "work-id",
                title: "Stable Book",
                position: position,
                mediaIDs: [.audio: "media-id"],
                groupingKey: "Stable Book/stable book",
            )
        ],
        media: [
            FolderSourceMedia(
                uuid: "media-id",
                role: .audio,
                relativePaths: [
                    "Stable Book/Stable Book 01.mp3", "Stable Book/Stable Book 02.mp3",
                ],
                signature: FolderSourceMediaSignature(
                    fileCount: 2,
                    totalSize: 6,
                    modifiedAt: ["Stable Book/Stable Book 01.mp3": 1],
                ),
            )
        ],
    )

    try await FilesystemActor().saveFolderSourceLibraryState(state, in: root)
    let loaded = try #require(try await FilesystemActor().loadFolderSourceLibraryState(in: root))

    #expect(loaded.schemaVersion == FolderSourceLibraryState.currentSchemaVersion)
    #expect(loaded.sourceID == "source-id")
    #expect(loaded.works.first?.uuid == "work-id")
    #expect(loaded.works.first?.position?.timestamp == 123)
    #expect(loaded.works.first?.mediaIDs[.audio] == "media-id")
    #expect(loaded.media.first?.relativePaths.count == 2)
}

@Test func legacyLocalProgressMergesByMediaFilename() {
    let scanned = makeScannedState(title: "Totally Different Title", ebookPath: "Legacy Book.epub")
    let legacy = makeLegacyLocalBook(
        title: "Totally Different Title",
        ebookFilename: "Legacy Book.epub",
        timestamp: 4242,
    )

    let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: [legacy])
    #expect(merged.works.first?.position?.timestamp == 4242)
    #expect(merged.works.first?.uuid == legacy.uuid)
}

@Test func legacyLocalProgressMergesByTitleWhenFilenameDiffers() {
    let scanned = makeScannedState(title: "Renamed On Disk", ebookPath: "Renamed On Disk.epub")
    let legacy = makeLegacyLocalBook(
        title: "Renamed On Disk",
        ebookFilename: "Old Filename.epub",
        timestamp: 99,
    )

    let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: [legacy])
    #expect(merged.works.first?.position?.timestamp == 99)
    #expect(merged.works.first?.uuid == legacy.uuid)
}

@Test func legacyLocalProgressLeavesUnmatchedBooksUntouched() {
    let scanned = makeScannedState(title: "On Disk", ebookPath: "On Disk.epub")
    let legacy = makeLegacyLocalBook(
        title: "Nowhere",
        ebookFilename: "Nowhere.epub",
        timestamp: 7,
    )

    let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: [legacy])
    #expect(merged.works.first?.position == nil)
    #expect(merged.works.first?.uuid == "work-id")
}

@Test func legacyLocalProgressAcceptsDuplicateMediaIDs() {
    var scanned = makeScannedState(title: "Legacy Book", ebookPath: "Legacy Book.epub")
    scanned.media.append(scanned.media[0])
    let legacy = makeLegacyLocalBook(
        title: "Legacy Book",
        ebookFilename: "Legacy Book.epub",
        timestamp: 4242,
    )

    let merged = LegacyLocalProgressMerge.merge(into: scanned, legacy: [legacy])
    #expect(merged.works.first?.position?.timestamp == 4242)
    #expect(merged.works.first?.uuid == legacy.uuid)
}

@Test func audiobookActorLoadsManifestWithAbsoluteFileHrefs() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let audioURL = root.appendingPathComponent("Track 01.mp3", isDirectory: false)
    try Data([0]).write(to: audioURL)
    let manifestURL = root.appendingPathComponent("manifest.json", isDirectory: false)
    let manifest = """
        {
          "metadata": {
            "title": "Absolute Audio",
            "duration": 12
          },
          "readingOrder": [
            {
              "href": "\(audioURL.absoluteString)",
              "type": "audio/mpeg",
              "duration": 12
            }
          ],
          "toc": [
            {
              "href": "\(audioURL.absoluteString)#t=0",
              "title": "Track 1"
            }
          ]
        }
        """
    try manifest.write(to: manifestURL, atomically: true, encoding: .utf8)

    let metadata = try await AudiobookLoader().load(from: manifestURL)

    #expect(metadata.title == "Absolute Audio")
    #expect(metadata.tracks.first?.url == audioURL)
    #expect(metadata.tracks.first?.href == audioURL.absoluteString)
    #expect(metadata.totalDuration == 12)
}

@Test func folderSourceDerivedAudiobookManifestsCanBeInvalidatedBySource() async throws {
    let filesystem = FilesystemActor()
    let directory = await filesystem.folderSourceDerivedAudiobookDirectory(
        sourceID: "test-source",
        bookID: "test-book",
    )
    try await filesystem.ensureDirectoryExists(at: directory)
    let manifestURL = directory.appendingPathComponent("manifest.json", isDirectory: false)
    try "{}".write(to: manifestURL, atomically: true, encoding: .utf8)
    #expect(FileManager.default.fileExists(atPath: manifestURL.path))

    try await filesystem.removeFolderSourceDerivedAudiobooks(sourceID: "test-source")

    #expect(!FileManager.default.fileExists(atPath: manifestURL.path))
}

@Test func folderSourceScanDoesNotWipeDerivedAudiobookManifests() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("Loose Audiobook.mp3"))

    let sourceID = "derived-survives-\(UUID().uuidString)"
    let source = BookSourceRecord(
        id: sourceID,
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )

    let derivedRoot = await FilesystemActor.shared.folderSourceDerivedAudiobookRootDirectory(
        sourceID: sourceID
    )
    defer { try? FileManager.default.removeItem(at: derivedRoot) }
    let derivedDir = await FilesystemActor.shared.folderSourceDerivedAudiobookDirectory(
        sourceID: sourceID,
        bookID: "cached-book",
    )
    try await FilesystemActor.shared.ensureDirectoryExists(at: derivedDir)
    let manifestURL = derivedDir.appendingPathComponent("manifest.json", isDirectory: false)
    try "{}".write(to: manifestURL, atomically: true, encoding: .utf8)

    _ = try await FolderSourceActor(sourceRecord: source).debugScanLibrary(in: root)

    #expect(FileManager.default.fileExists(atPath: manifestURL.path))
}

@Test func folderSourceGroupsSupportedMediaTypeSubfoldersAsOneWork() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let work = root.appendingPathComponent("A Matched Book", isDirectory: true)
    let audio = work.appendingPathComponent("audio", isDirectory: true)
    let ebook = work.appendingPathComponent("ebook", isDirectory: true)
    let synced = work.appendingPathComponent("synced", isDirectory: true)
    try FileManager.default.createDirectory(at: audio, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: ebook, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: synced, withIntermediateDirectories: true)
    try Data([0]).write(to: audio.appendingPathComponent("Different Audio Name.mp3"))
    try Data([0]).write(to: ebook.appendingPathComponent("Different Ebook Name.epub"))
    try Data([0]).write(to: synced.appendingPathComponent("Different Readaloud Name.epub"))

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let metadata = try await FolderSourceActor(sourceRecord: source).debugScanLibrary(in: root)

    #expect(metadata.count == 1)
    let book = try #require(metadata.first)
    #expect(book.title == "A Matched Book")
    #expect(book.ebook != nil)
    #expect(book.audiobook != nil)
    #expect(book.readaloud != nil)
}

@Test func folderSourceSplitsMixedCollectionFolderByPrefix() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("Book One.epub"))
    try Data([0]).write(to: root.appendingPathComponent("Book One 01.mp3"))
    try Data([0]).write(to: root.appendingPathComponent("Book One 02.mp3"))
    try Data([0]).write(to: root.appendingPathComponent("Book Two.epub"))
    try Data([0]).write(to: root.appendingPathComponent("Book Two 01.mp3"))

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let metadata = try await FolderSourceActor(sourceRecord: source).debugScanLibrary(in: root)
    let byTitle = Dictionary(uniqueKeysWithValues: metadata.map { ($0.title, $0) })

    #expect(metadata.count == 2)
    #expect(byTitle["Book One"]?.ebook != nil)
    #expect(byTitle["Book One"]?.audiobook != nil)
    #expect(byTitle["Book Two"]?.ebook != nil)
    #expect(byTitle["Book Two"]?.audiobook != nil)
}

@Test func folderSourceGroupsAudioWhenEbookFilenameHasAuthorSuffix() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let folder = root.appendingPathComponent("stuff", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try Data([0]).write(
        to: folder.appendingPathComponent(
            "This Is How You Lose the Time War - Amal El-Mohtar.epub"
        )
    )
    try Data([0]).write(
        to: folder.appendingPathComponent("This Is How You Lose the Time War.m4b")
    )

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let metadata = try await FolderSourceActor(sourceRecord: source).debugScanLibrary(in: root)

    #expect(metadata.count == 1)
    #expect(metadata.first?.ebook != nil)
    #expect(metadata.first?.audiobook != nil)
}

@Test func folderSourcePrunesDeletedBookRecordsOnRescan() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let oldBook = root.appendingPathComponent("Old Book.epub")
    try Data([0]).write(to: oldBook)
    try Data([0]).write(to: root.appendingPathComponent("Keeper.epub"))

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    let first = try await actor.debugScanLibrary(in: root)
    #expect(first.count == 2)

    try FileManager.default.removeItem(at: oldBook)
    let second = try await actor.debugScanLibrary(in: root)

    #expect(second.count == 1)
    #expect(second.first?.title == "Keeper")
}

@Test func folderSourceRetainsBooksWhenScanFindsNoFiles() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let book = root.appendingPathComponent("Only Book.epub")
    try Data([0]).write(to: book)

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    #expect(try await actor.debugScanLibrary(in: root).count == 1)

    try FileManager.default.removeItem(at: book)
    let afterEmptyScan = try await actor.debugScanLibrary(in: root)

    #expect(afterEmptyScan.count == 1)
    #expect(afterEmptyScan.first?.ebook?.missing == 1)
}

@Test func folderSourcePlansReadaloudBesideFlatCollectionMedia() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("Book One.epub"))
    try Data([0]).write(to: root.appendingPathComponent("Book One 01.mp3"))

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    let metadata = try await actor.debugScanLibrary(in: root)
    let book = try #require(metadata.first { $0.title == "Book One" })

    let destination = await actor.debugWriteDestinationDirectory(
        in: root,
        bookID: book.uuid,
        category: .synced,
    )

    #expect(destination.isEmpty)
}

@Test func folderSourcePlansReadaloudToSyncedSubfolderForMediaTypeLayout() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let work = root.appendingPathComponent("Book One", isDirectory: true)
    let ebook = work.appendingPathComponent("ebook", isDirectory: true)
    let audio = work.appendingPathComponent("audio", isDirectory: true)
    try FileManager.default.createDirectory(at: ebook, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: audio, withIntermediateDirectories: true)
    try Data([0]).write(to: ebook.appendingPathComponent("book.epub"))
    try Data([0]).write(to: audio.appendingPathComponent("book.mp3"))

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    let metadata = try await actor.debugScanLibrary(in: root)
    let book = try #require(metadata.first { $0.title == "Book One" })

    let destination = await actor.debugWriteDestinationDirectory(
        in: root,
        bookID: book.uuid,
        category: .synced,
    )

    #expect(destination == "Book One/synced")
}

@Test func folderSourceImportUnifiesAssetFilenameStemsInFlatLayout() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("Existing Book.epub"))

    let source = BookSourceRecord(
        id: "folder-import-flat-\(UUID().uuidString)",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    _ = try await actor.debugScanLibrary(in: root)

    let importedBookID = try await actor.debugImportBookAssets(
        in: root,
        bookUUID: UUID().uuidString,
        bookName: "The Last Contract",
        ebook: StorytellerUploadAsset(
            format: .ebook,
            filename: "98E5FF0B-5D99-4E91-B5E8-999CEA4CC398.epub",
            data: Data([0]),
        ),
        audiobooks: [
            StorytellerUploadAsset(
                format: .audiobook,
                filename: "Part 1.mp3",
                data: Data([0]),
            ),
            StorytellerUploadAsset(
                format: .audiobook,
                filename: "Part 2.mp3",
                data: Data([0]),
            ),
        ],
    )

    let bookDirectory = root.appendingPathComponent("The Last Contract", isDirectory: true)
    for filename in [
        "The Last Contract.epub",
        "The Last Contract - Part 1.mp3",
        "The Last Contract - Part 2.mp3",
    ] {
        let path = bookDirectory.appendingPathComponent(filename).path
        #expect(FileManager.default.fileExists(atPath: path))
    }

    let metadata = try await actor.debugScanLibrary(in: root)
    let book = try #require(metadata.first { $0.title == "The Last Contract" })
    #expect(book.ebook != nil)
    #expect(book.audiobook != nil)
    #expect(book.uuid == importedBookID)
}

@Test func folderSourceImportOntoExistingBookReturnsThatBookID() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("Existing Book.epub"))

    let source = BookSourceRecord(
        id: "folder-import-merge-\(UUID().uuidString)",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)
    let existing = try #require(
        try await actor.debugScanLibrary(in: root).first { $0.title == "Existing Book" }
    )

    let importedBookID = try await actor.debugImportBookAssets(
        in: root,
        bookUUID: existing.uuid,
        bookName: "Existing Book",
        audiobooks: [
            StorytellerUploadAsset(
                format: .audiobook,
                filename: "Some Other Name.m4b",
                data: Data([0]),
                contentType: "audio/mp4",
            )
        ],
    )

    #expect(importedBookID == existing.uuid)
    let book = try #require(
        try await actor.debugScanLibrary(in: root).first { $0.uuid == existing.uuid }
    )
    #expect(book.ebook != nil)
    #expect(book.audiobook != nil)
}

@Test func folderSourceImportNamesAssetsAfterBookInSubfolderLayout() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }

    let source = BookSourceRecord(
        id: "folder-import-subfolders-\(UUID().uuidString)",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)

    let importedBookID = try await actor.debugImportBookAssets(
        in: root,
        bookUUID: UUID().uuidString,
        bookName: "A New Book.epub",
        ebook: StorytellerUploadAsset(
            format: .ebook,
            filename: "23AC1A2B-0499-4B36-892A-246E786CF00E.epub",
            data: Data([0]),
        ),
        audiobooks: [
            StorytellerUploadAsset(
                format: .audiobook,
                filename: "A New Book (Unabridged).m4b",
                data: Data([0]),
                contentType: "audio/mp4",
            )
        ],
        readaloud: StorytellerUploadAsset(
            format: .readaloud,
            filename: "23AC1A2B-0499-4B36-892A-246E786CF00E.epub",
            data: Data([0]),
        ),
    )

    let bookDirectory = root.appendingPathComponent("A New Book", isDirectory: true)
    for relativePath in [
        "ebook/A New Book.epub",
        "audio/A New Book.m4b",
        "synced/A New Book readaloud.epub",
    ] {
        let path = bookDirectory.appendingPathComponent(relativePath).path
        #expect(FileManager.default.fileExists(atPath: path))
    }

    let metadata = try await actor.debugScanLibrary(in: root)
    let book = try #require(metadata.first { $0.title == "A New Book" })
    #expect(book.ebook != nil)
    #expect(book.audiobook != nil)
    #expect(book.readaloud != nil)
    #expect(book.uuid == importedBookID)
}

@Test func folderSourceDeletePathValidationRejectsEscapes() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)

    var rejectedParentEscape = false
    do {
        _ = try await actor.debugValidatedMediaFilePath(in: root, relativePath: "../escape.mp3")
    } catch {
        rejectedParentEscape = true
    }
    var rejectedAbsolutePath = false
    do {
        _ = try await actor.debugValidatedMediaFilePath(in: root, relativePath: "/tmp/escape.mp3")
    } catch {
        rejectedAbsolutePath = true
    }

    #expect(rejectedParentEscape)
    #expect(rejectedAbsolutePath)
}

@Test func folderSourceDeletePathValidationRejectsDirectories() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(
        at: root.appendingPathComponent("Book One", isDirectory: true),
        withIntermediateDirectories: true,
    )

    let source = BookSourceRecord(
        id: "folder-source",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
        storagePath: root.path,
    )
    let actor = FolderSourceActor(sourceRecord: source)

    var rejectedDirectory = false
    do {
        _ = try await actor.debugValidatedMediaFilePath(in: root, relativePath: "Book One")
    } catch {
        rejectedDirectory = true
    }

    #expect(rejectedDirectory)
    #expect(
        try await actor.debugValidatedMediaFilePath(in: root, relativePath: "missing.mp3")
            == "missing.mp3"
    )
}

private func makeBook(
    publicationDate: String?,
    sourceID: BookSourceID = "test-source",
) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: sourceID, uuid: UUID().uuidString),
        title: "Book",
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: nil,
        updatedAt: nil,
        publicationDate: publicationDate,
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

private func makeLegacyLocalBook(
    title: String,
    ebookFilename: String,
    timestamp: Double,
) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: "test-source", uuid: "old-\(UUID().uuidString)"),
        title: title,
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
        ebook: BookAsset(
            uuid: "old-uuid",
            filepath: ebookFilename,
            missing: 0,
            createdAt: nil,
            updatedAt: nil,
        ),
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: BookReadingPosition(
            uuid: "legacy-position",
            locator: nil,
            timestamp: timestamp,
            createdAt: nil,
            updatedAt: nil,
        ),
        rating: nil,
    )
}

private func makeScannedState(title: String, ebookPath: String) -> FolderSourceLibraryState {
    FolderSourceLibraryState(
        sourceID: "source-id",
        works: [
            FolderSourceWork(
                uuid: "work-id",
                title: title,
                mediaIDs: [.ebook: "media-id"],
                groupingKey: "\(title)/\(title.lowercased())",
            )
        ],
        media: [
            FolderSourceMedia(
                uuid: "media-id",
                role: .ebook,
                relativePaths: [ebookPath],
                signature: FolderSourceMediaSignature(fileCount: 1, totalSize: 1, modifiedAt: [:]),
            )
        ],
    )
}

private func makeTemporaryFolderSource() throws -> URL {
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent("StorytellerKitTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
}

@Test func copyDestinationsRespectFormatsPermissionsAndOrigin() {
    let server = BookSourceRecord(
        id: "server",
        name: "Server",
        kind: .storyteller,
        capabilities: .storyteller,
    )
    let folder = BookSourceRecord(
        id: "folder",
        name: "Folder",
        kind: .localFolder,
        capabilities: .localFolder,
    )
    let sources = [server, folder]
    let allPermitted: Set<BookSourceID> = ["server", "folder"]

    func destinations(
        for book: BookMetadata,
        uploadPermitted: Set<BookSourceID> = allPermitted,
    ) -> [BookSourceID] {
        CopyDestinations.destinations(
            for: book,
            sources: sources,
            uploadPermittedSourceIDs: uploadPermitted,
        ).map(\.id)
    }

    let comic = makeCopyTestBook(sourceID: "other-folder", ebookFile: "comic.cbz")
    #expect(destinations(for: comic) == ["folder"])

    let epub = makeCopyTestBook(sourceID: "other-folder", ebookFile: "book.epub")
    #expect(destinations(for: epub) == ["server", "folder"])
    #expect(destinations(for: epub, uploadPermitted: ["folder"]) == ["folder"])

    let fromServer = makeCopyTestBook(sourceID: "server", ebookFile: "book.epub")
    #expect(destinations(for: fromServer) == ["folder"])

    let readaloudOnly = makeCopyTestBook(sourceID: "other-folder", hasReadaloud: true)
    #expect(destinations(for: readaloudOnly) == ["server", "folder"])

    let audiobookOnly = makeCopyTestBook(sourceID: "other-folder", hasAudiobook: true)
    #expect(destinations(for: audiobookOnly) == ["server", "folder"])
}

private func makeCopyTestBook(
    sourceID: BookSourceID,
    ebookFile: String? = nil,
    hasAudiobook: Bool = false,
    hasReadaloud: Bool = false,
) -> BookMetadata {
    let uuid = UUID().uuidString
    return BookMetadata(
        bookID: BookID(sourceID: sourceID, uuid: uuid),
        title: "Book",
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
        ebook: ebookFile.map {
            BookAsset(uuid: uuid, filepath: $0, missing: 0, createdAt: nil, updatedAt: nil)
        },
        audiobook: hasAudiobook
            ? BookAsset(
                uuid: uuid,
                filepath: "book.m4b",
                missing: 0,
                createdAt: nil,
                updatedAt: nil,
            )
            : nil,
        readaloud: hasReadaloud
            ? BookReadaloud(
                uuid: uuid,
                filepath: "book.epub",
                missing: 0,
                status: nil,
                currentStage: nil,
                stageProgress: nil,
                queuePosition: nil,
                restartPending: nil,
                createdAt: nil,
                updatedAt: nil,
            )
            : nil,
        status: nil,
        position: nil,
        rating: nil,
    )
}

@Test func pollingFolderWatcherFiresOnFileChanges() async throws {
    let root = try makeTemporaryFolderSource()
    defer { try? FileManager.default.removeItem(at: root) }
    try Data([0]).write(to: root.appendingPathComponent("a.epub"))

    let watcher = PollingFolderWatcher(interval: .milliseconds(50))
    let changed = ChangeFlag()
    let token = try #require(watcher.watch(root) { changed.set() })
    defer { token.cancel() }

    for index in 0..<100 where !changed.isSet {
        try Data([UInt8(index % 256)]).write(
            to: root.appendingPathComponent("b\(index).epub")
        )
        try await Task.sleep(for: .milliseconds(50))
    }
    #expect(changed.isSet)
}

@Test func bookDescriptionTextFlattensHTMLAndMarkdown() async throws {
    #expect(
        BookDescriptionText.plain(from: "**Bold** and *italic* markdown.")
            == "Bold and italic markdown."
    )
    #expect(
        BookDescriptionText.plain(from: "<p>First **para**.</p><p>Second<br>line.</p>")
            == "First para.\n\nSecond\nline."
    )
    #expect(BookDescriptionText.plain(from: "Plain text. 2 * 3 = 6.") == "Plain text. 2 * 3 = 6.")
    #expect(BookDescriptionText.plain(from: "  <b>Just bold html</b>  ") == "Just bold html")
}

private final class ChangeFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    var isSet: Bool {
        lock.withLock { value }
    }

    func set() {
        lock.withLock { value = true }
    }
}
