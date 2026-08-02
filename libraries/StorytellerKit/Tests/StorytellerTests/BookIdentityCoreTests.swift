import Foundation
import Testing

@testable import StorytellerKit

@Test func bookIDScopesProviderUUIDBySource() {
    let first = BookID(sourceID: "source-a", uuid: "shared-provider-id")
    let second = BookID(sourceID: "source-b", uuid: "shared-provider-id")

    #expect(first != second)
    #expect(Set([first, second]).count == 2)
}

@Test func bookIDCodableRoundTripPreservesBothComponents() throws {
    let original = BookID(sourceID: "source/with punctuation", uuid: "book/id:42")
    let encoded = try JSONEncoder().encode(original)
    let decoded = try JSONDecoder().decode(BookID.self, from: encoded)

    #expect(decoded == original)
}

@Test func storytellerWirePayloadUsesProviderUUID() throws {
    let book = BookMetadata(
        bookID: BookID(sourceID: "source-a", uuid: "provider-book"),
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
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: nil,
        rating: nil,
    )
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    let data = try encoder.encode(StorytellerBookMetadataPayload(book: book))
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])

    #expect(object["uuid"] as? String == "provider-book")
    #expect(object["id"] == nil)
    #expect(object["source_id"] == nil)

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    let decoded = try decoder.decode(StorytellerBookMetadataPayload.self, from: data)
    #expect(
        decoded.scoped(to: "source-b").id == BookID(sourceID: "source-b", uuid: "provider-book")
    )
}

@Test func sourceAwarePersistedModelsRoundTripBookIdentity() throws {
    let bookID = BookID(sourceID: "source-a", uuid: "book-a")
    let locator = BookLocator(
        href: "chapter.xhtml",
        type: "text/html",
        title: nil,
        locations: nil,
        text: nil,
    )
    let progress = PendingProgressSync(bookID: bookID, locator: locator, timestamp: 1)
    let highlight = Highlight(
        bookID: bookID,
        locator: locator,
        text: "Text",
        color: .yellow,
    )
    let download = DownloadRecord(
        bookID: bookID,
        category: .ebook,
        bookTitle: "Book",
        format: .ebook,
    )

    let progressCopy = try JSONDecoder().decode(
        PendingProgressSync.self,
        from: JSONEncoder().encode(progress),
    )
    let highlightCopy = try JSONDecoder().decode(
        Highlight.self,
        from: JSONEncoder().encode(highlight),
    )
    let downloadCopy = try JSONDecoder().decode(
        DownloadRecord.self,
        from: JSONEncoder().encode(download),
    )

    #expect(progressCopy.bookID == bookID)
    #expect(highlightCopy.bookID == bookID)
    #expect(downloadCopy.bookID == bookID)
    #expect(downloadCopy.id == download.id)
}

@Test func folderSourceExtractedMetadataDoesNotOwnBookIdentity() throws {
    let data = Data(
        """
        {
          "schemaVersion": 1,
          "sourceID": "folder-source",
          "works": [],
          "media": [{
            "uuid": "media-id",
            "role": "ebook",
            "relativePaths": ["Book.epub"],
            "signature": {"fileCount": 1, "totalSize": 10, "modifiedAt": {}},
            "extractedMetadata": {
              "uuid": "file-metadata-id",
              "sourceID": null,
              "title": "Book"
            },
            "missing": false,
            "previousRelativePaths": []
          }]
        }
        """.utf8
    )

    let state = try JSONDecoder().decode(FolderSourceLibraryState.self, from: data)

    #expect(state.sourceID == "folder-source")
    #expect(state.media.first?.extractedMetadata?.title == "Book")
}

@Test func smilPlaybackStatePreservesCompositeBookIdentity() {
    let bookID = BookID(sourceID: "source-b", uuid: "shared")
    let state = SMILPlaybackState(
        isPlaying: false,
        currentSectionIndex: 0,
        currentEntryIndex: 0,
        currentFragment: "",
        chapterLabel: nil,
        chapterElapsed: 0,
        chapterTotal: 0,
        bookElapsed: 0,
        bookTotal: 0,
        playbackRate: 1,
        volume: 1,
        bookID: bookID,
    )

    #expect(state.bookID == bookID)
}

@Test func readaloudGeneratorInputPreservesImmutableCompositeTarget() {
    let bookID = BookID(sourceID: "source-b", uuid: "shared")
    let input = ReadaloudGeneratorInput(
        bookID: bookID,
        bookTitle: "Book",
        sourceName: "Source B",
        sourceKind: .storyteller,
        destination: .source,
        ebookURL: nil,
        audioURLs: [],
    )

    #expect(input.bookID == bookID)
}

@Test func collectionMatchingPreservesProviderIdentityAndName() {
    let collection = BookCollectionSummary(
        uuid: "provider-specific-id",
        name: "Cafe Reads",
        description: nil,
        isPublic: nil,
        importPath: nil,
        createdAt: nil,
        updatedAt: nil,
    )
    let book = BookMetadata(
        bookID: BookID(sourceID: "source", uuid: "book"),
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
        collections: [collection],
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: nil,
        rating: nil,
    )

    #expect(book.matchesCollection("Cafe Reads"))
    #expect(book.matchesCollection("provider-specific-id"))
}
