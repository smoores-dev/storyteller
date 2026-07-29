import Foundation
import Testing

@testable import StorytellerKit

// Identifier payloads ride both on the parity endpoints (plain JSONDecoder, see
// StorytellerActor+Parity) and on the book listing (the actor's .convertFromSnakeCase
// decoder); their keys contain no underscores, so a plain decoder matches both paths.
private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

private func makeIdentifier(
    kind: String?,
    name: String,
    urlTemplate: String? = nil,
    value: String,
) -> BookIdentifier {
    BookIdentifier(
        typeUuid: "type-\(name.lowercased())",
        kind: kind,
        name: name,
        urlTemplate: urlTemplate,
        value: value,
    )
}

private func makeBook(identifiers: [BookIdentifier]?) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: BookSourceID("src"), uuid: "book-1"),
        title: "Test Book",
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
        identifiers: identifiers,
    )
}

@Test func bookIdentifierDecodesWireShape() throws {
    // The wire `uuid` is the identifier TYPE's uuid; unknown keys are ignored.
    let json = """
        {
          "uuid": "11111111-0000-4000-8000-000000000001",
          "kind": "isbn-13",
          "name": "ISBN-13",
          "urlTemplate": null,
          "externalSourceUuid": "22222222-0000-4000-8000-000000000002",
          "someFutureKey": { "nested": true },
          "value": "9781234567890"
        }
        """
    let identifier = try decode(BookIdentifier.self, from: json)
    #expect(identifier.typeUuid == "11111111-0000-4000-8000-000000000001")
    #expect(identifier.kind == "isbn-13")
    #expect(identifier.name == "ISBN-13")
    #expect(identifier.urlTemplate == nil)
    #expect(identifier.value == "9781234567890")
}

@Test func bookPayloadDecodesIdentifiersArray() throws {
    let json = """
        {
          "uuid": "book-uuid-1",
          "title": "A Book",
          "identifiers": [
            {
              "uuid": "type-1",
              "kind": "asin",
              "name": "ASIN",
              "urlTemplate": null,
              "value": "B00ABC1234"
            },
            {
              "uuid": "type-2",
              "kind": null,
              "name": "Goodreads",
              "urlTemplate": "https://www.goodreads.com/book/show/{value}",
              "value": "12345"
            }
          ]
        }
        """
    let payload = try decode(StorytellerBookMetadataPayload.self, from: json)
    let book = payload.scoped(to: BookSourceID("src"))
    #expect(book.identifierList.count == 2)
    #expect(book.identifierList[0].typeUuid == "type-1")
    #expect(book.identifierList[0].kind == "asin")
    #expect(book.identifierList[1].kind == nil)
    #expect(book.identifierList[1].urlTemplate == "https://www.goodreads.com/book/show/{value}")
}

@Test func identifierListMergesFormatScopedRowsAndDedupes() throws {
    // Format-scoped rows ride under ebook/audiobook in the payload; the same
    // (type, value) on two formats must appear once in the merged list.
    let json = """
        {
          "uuid": "book-uuid-1",
          "title": "A Book",
          "identifiers": [],
          "ebook": {
            "filepath": "book.epub",
            "missing": 0,
            "identifiers": [
              { "uuid": "type-isbn", "kind": "isbn-13", "name": "ISBN-13", "value": "9781427209764" }
            ]
          },
          "audiobook": {
            "filepath": "book.m4b",
            "missing": 0,
            "identifiers": [
              { "uuid": "type-isbn", "kind": "isbn-13", "name": "ISBN-13", "value": "9781427209764" },
              { "uuid": "type-audible", "kind": "audible", "name": "Audible ASIN", "value": "B012BNY8RY" }
            ]
          }
        }
        """
    let payload = try decode(StorytellerBookMetadataPayload.self, from: json)
    let book = payload.scoped(to: BookSourceID("src"))
    #expect(book.identifierList.count == 2)
    #expect(book.identifierList[0].value == "9781427209764")
    #expect(book.identifierList[1].kind == "audible")
    #expect(book.identifiersDisplay == "ISBN-13 9781427209764, Audible ASIN B012BNY8RY")
    #expect(book.primaryIdentifier?.kind == "isbn-13")
    // The ISBN is on both formats; audiobook attribution wins, so it links to Libro.FM.
    #expect(
        book.displayIdentifiers[0].url?.absoluteString
            == "https://libro.fm/audiobooks/9781427209764")
    #expect(
        book.displayIdentifiers[1].url?.absoluteString
            == "https://www.audible.com/pd/B012BNY8RY")
}

@Test func bookPayloadWithoutIdentifiersDecodesToEmptyList() throws {
    // Old servers omit the field entirely; behavior must not change.
    let json = """
        { "uuid": "book-uuid-1", "title": "A Book" }
        """
    let payload = try decode(StorytellerBookMetadataPayload.self, from: json)
    let book = payload.scoped(to: BookSourceID("src"))
    #expect(book.identifiers == nil)
    #expect(book.identifierList.isEmpty)
    #expect(book.sortableIdentifiers == "")
    #expect(book.identifiersDisplay == "")
}

@Test func identifierTypeDecodesAndIgnoresExtraKeys() throws {
    let json = """
        {
          "uuid": "type-1",
          "name": "ISBN-13",
          "kind": "isbn-13",
          "urlTemplate": null,
          "externalSourceUuid": null,
          "createdAt": "2026-07-01 12:00:00",
          "updatedAt": "2026-07-01 12:00:00"
        }
        """
    let type = try decode(IdentifierType.self, from: json)
    #expect(type.uuid == "type-1")
    #expect(type.name == "ISBN-13")
    #expect(type.kind == "isbn-13")
    #expect(type.urlTemplate == nil)
}

@Test func identifierRelationRowDecodesRawGetShape() throws {
    // GET /books/{id}/identifiers returns raw relation rows, where `uuid` is the
    // RELATION's id (ignored) and the type rides as `identifierTypeUuid`.
    let json = """
        {
          "uuid": "relation-1",
          "bookUuid": "book-1",
          "identifierTypeUuid": "type-1",
          "value": "9781234567890",
          "ebookUuid": "ebook-1",
          "audiobookUuid": null,
          "readaloudUuid": null,
          "createdAt": "2026-07-01 12:00:00",
          "updatedAt": "2026-07-01 12:00:00",
          "identifierTypeName": "ISBN-13",
          "urlTemplate": null,
          "externalSourceUuid": null
        }
        """
    let relation = try decode(BookIdentifierRelation.self, from: json)
    #expect(relation.identifierTypeUuid == "type-1")
    #expect(relation.value == "9781234567890")
    #expect(relation.ebookUuid == "ebook-1")
    #expect(!relation.isBookLevel)

    let payload = relation.asRelationPayload
    #expect(payload.identifierTypeUuid == "type-1")
    #expect(payload.ebookUuid == "ebook-1")
    #expect(payload.audiobookUuid == nil)
}

@Test func bookLevelSplitKeepsFormatLinkedRowsOutOfEditing() {
    let relations = [
        BookIdentifierRelation(identifierTypeUuid: "type-1", value: "book-level"),
        BookIdentifierRelation(
            identifierTypeUuid: "type-2",
            value: "from-ebook-file",
            ebookUuid: "ebook-1",
        ),
        BookIdentifierRelation(
            identifierTypeUuid: "type-3",
            value: "from-audio-file",
            audiobookUuid: "audio-1",
        ),
    ]
    let editable = relations.filter(\.isBookLevel)
    let preserved = relations.filter { !$0.isBookLevel }.map(\.asRelationPayload)
    #expect(editable.map(\.value) == ["book-level"])
    #expect(preserved.map(\.value) == ["from-ebook-file", "from-audio-file"])
    #expect(preserved[0].ebookUuid == "ebook-1")
    #expect(preserved[1].audiobookUuid == "audio-1")
}

@Test func formatLinkedPayloadEncodesItsFormatUuid() throws {
    let payload = IdentifierRelationPayload(
        identifierTypeUuid: "type-1",
        value: "B00ABC",
        audiobookUuid: "audio-1",
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let json = String(decoding: try encoder.encode(payload), as: UTF8.self)
    #expect(
        json
            == #"{"audiobookUuid":"audio-1","identifierTypeUuid":"type-1","value":"B00ABC"}"#
    )
}

@Test func identifierRelationPayloadEncodesExactJSON() throws {
    let payload = IdentifierRelationPayload(
        identifierTypeUuid: "type-1",
        value: "9781234567890",
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let json = String(decoding: try encoder.encode(payload), as: UTF8.self)
    #expect(json == #"{"identifierTypeUuid":"type-1","value":"9781234567890"}"#)
}

@Test func primaryIdentifierPrefersIsbn13() {
    let book = makeBook(identifiers: [
        makeIdentifier(kind: "asin", name: "ASIN", value: "B00ABC1234"),
        makeIdentifier(kind: "isbn-13", name: "ISBN-13", value: "9781234567890"),
    ])
    #expect(book.primaryIdentifier?.kind == "isbn-13")
    #expect(book.sortableIdentifiers == "9781234567890")
}

@Test func primaryIdentifierFallsBackToFirstByTypeName() {
    let book = makeBook(identifiers: [
        makeIdentifier(kind: nil, name: "Zebra Registry", value: "Z-1"),
        makeIdentifier(kind: "asin", name: "ASIN", value: "B00ABC1234"),
    ])
    #expect(book.primaryIdentifier?.name == "ASIN")
    #expect(book.sortableIdentifiers == "b00abc1234")
}

@Test func sortableIdentifiersIsEmptyWithoutIdentifiers() {
    #expect(makeBook(identifiers: nil).sortableIdentifiers == "")
    #expect(makeBook(identifiers: []).sortableIdentifiers == "")
}

@Test func resolvedURLSubstitutesValuePlaceholderForCustomTypes() {
    // Mirrors the web client: urlTemplate.replace("{value}", encodeURIComponent(value)).
    let identifier = makeIdentifier(
        kind: nil,
        name: "Goodreads",
        urlTemplate: "https://www.goodreads.com/book/show/{value}",
        value: "12345",
    )
    #expect(identifier.resolvedURL()?.absoluteString == "https://www.goodreads.com/book/show/12345")
}

@Test func resolvedURLWithoutPlaceholderUsesTemplateAsIs() {
    let identifier = makeIdentifier(
        kind: nil,
        name: "Custom",
        urlTemplate: "https://example.com/lookup",
        value: "abc",
    )
    #expect(identifier.resolvedURL()?.absoluteString == "https://example.com/lookup")
}

@Test func resolvedURLIsNilForCustomTypeWithoutTemplate() {
    let identifier = makeIdentifier(kind: nil, name: "Custom", value: "9781234567890")
    #expect(identifier.resolvedURL() == nil)
}

@Test func coreKindsLinkLikeTheWebClient() {
    #expect(
        makeIdentifier(kind: "asin", name: "ASIN", value: "B00ABC1234").resolvedURL()?
            .absoluteString == "https://www.amazon.com/dp/B00ABC1234")
    #expect(
        makeIdentifier(kind: "audible", name: "Audible ASIN", value: "B012BNY8RY").resolvedURL()?
            .absoluteString == "https://www.audible.com/pd/B012BNY8RY")
    #expect(
        makeIdentifier(kind: "doi", name: "DOI", value: "10.1000/a b&c").resolvedURL()?
            .absoluteString == "https://doi.org/10.1000/a%20b&c")
    #expect(
        makeIdentifier(kind: "hardcover-book-slug", name: "Hardcover Book Slug", value: "six-of-crows")
            .resolvedURL()?.absoluteString == "https://hardcover.app/books/six-of-crows")
}

@Test func isbn13LinksToIsbnsearchOrLibroFmByScope() {
    let isbn = makeIdentifier(kind: "isbn-13", name: "ISBN-13", value: "978-1427209764")
    #expect(isbn.resolvedURL()?.absoluteString == "https://isbnsearch.org/isbn/9781427209764")
    #expect(
        isbn.resolvedURL(audiobookScoped: true)?.absoluteString
            == "https://libro.fm/audiobooks/9781427209764")
}

@Test func hardcoverEditionIdLinksOnlyWithSiblingSlug() {
    let edition = makeIdentifier(kind: "hardcover-edition-id", name: "Hardcover Edition ID", value: "123")
    #expect(edition.resolvedURL() == nil)
    #expect(
        edition.resolvedURL(hardcoverSlug: "six-of-crows")?.absoluteString
            == "https://hardcover.app/books/six-of-crows/editions/123")
}

@Test func displayNameFollowsWebKindNamesAndFallsBackToTypeName() {
    #expect(makeIdentifier(kind: "isbn-13", name: "ISBN-13", value: "x").displayName == "ISBN-13")
    #expect(makeIdentifier(kind: "asin", name: "Amazon", value: "x").displayName == "ASIN")
    #expect(makeIdentifier(kind: "audible", name: "Audible", value: "x").displayName == "Audible ASIN")
    #expect(
        makeIdentifier(kind: "unknown-kind", name: "My Registry", value: "x").displayName
            == "My Registry"
    )
    #expect(makeIdentifier(kind: nil, name: "Goodreads", value: "x").displayName == "Goodreads")
}

@Test func identifiersDisplayJoinsKindAndValue() {
    let book = makeBook(identifiers: [
        makeIdentifier(kind: "isbn-13", name: "ISBN-13", value: "9781234567890"),
        makeIdentifier(kind: "asin", name: "ASIN", value: "B00ABC"),
        makeIdentifier(kind: nil, name: "Goodreads", value: "12345"),
    ])
    #expect(book.identifiersDisplay == "ISBN-13 9781234567890, ASIN B00ABC, Goodreads 12345")
}

@Test func isbn13NormalizationStripsFormattingAndRejectsIsbn10() {
    #expect(BookImportedIdentifier.normalizedISBN13("978-1-2345-6789-0") == "9781234567890")
    #expect(BookImportedIdentifier.normalizedISBN13("979 8 6060 6404 8") == "9798606064048")
    #expect(BookImportedIdentifier.normalizedISBN13("0-306-40615-2") == nil)
    #expect(BookImportedIdentifier.normalizedISBN13("12345") == nil)
    #expect(BookImportedIdentifier.normalizedISBN13("978123456789X") == nil)
}

@Test func typeResolutionPrefersKindThenNameThenNil() {
    let types = [
        IdentifierType(uuid: "t-1", name: "ISBN-13", kind: "isbn-13"),
        IdentifierType(uuid: "t-2", name: "Audible ASIN", kind: nil),
    ]
    #expect(
        IdentifierImportAssembly.resolveTypeUuid(kind: "isbn-13", name: "Other", in: types)
            == "t-1"
    )
    #expect(
        IdentifierImportAssembly.resolveTypeUuid(kind: "audible", name: "audible asin", in: types)
            == "t-2"
    )
    #expect(
        IdentifierImportAssembly.resolveTypeUuid(kind: "doi", name: "DOI", in: types) == nil
    )
}

@Test func audnexusCandidateOffersAudibleAsinAndValidIsbnForAudiobook() {
    let details = AudnexusBookDetails(
        asin: "B00ABC1234",
        title: "A Book",
        subtitle: nil,
        description: nil,
        authors: [],
        narrators: [],
        seriesPrimary: nil,
        seriesSecondary: nil,
        genres: [],
        releaseDate: nil,
        publisherName: nil,
        language: nil,
        rating: nil,
        runtimeLengthMin: nil,
        isbn: "978-1-2345-6789-0",
        imageUrl: nil,
        rawJSON: nil,
    )
    let identifiers = details.asMetadataCandidate.importedIdentifiers
    #expect(identifiers.count == 2)
    #expect(identifiers[0].kind == "audible")
    #expect(identifiers[0].value == "B00ABC1234")
    #expect(identifiers[0].target == .audiobook)
    #expect(identifiers[1].kind == "isbn-13")
    #expect(identifiers[1].value == "9781234567890")
}

@Test func hardcoverEditionIdentifiersFollowEditionFormat() {
    let audio = BookEditionCandidate(
        id: 1, format: "Audiobook", editionInfo: nil, title: nil, subtitle: nil,
        isbn13: nil, isbn10: nil, asin: "B00ABC1234", pages: nil, audioSeconds: 43200,
        releaseDate: nil, language: nil, country: nil, publisher: nil,
        narrators: [], otherContributors: [], imageUrl: nil, imageWidth: nil,
        imageHeight: nil, rawJSON: nil,
    )
    let audioIdentifiers = audio.importableIdentifiers
    #expect(audioIdentifiers.map(\.kind) == ["audible"])
    #expect(audioIdentifiers[0].target == .audiobook)

    let text = BookEditionCandidate(
        id: 2, format: "Hardcover", editionInfo: nil, title: nil, subtitle: nil,
        isbn13: "9781234567890", isbn10: "0306406152", asin: "B0KINDLE12", pages: 400,
        audioSeconds: nil, releaseDate: nil, language: nil, country: nil, publisher: nil,
        narrators: [], otherContributors: [], imageUrl: nil, imageWidth: nil,
        imageHeight: nil, rawJSON: nil,
    )
    let textIdentifiers = text.importableIdentifiers
    #expect(textIdentifiers.map(\.kind) == ["isbn-13", "asin"])
    #expect(textIdentifiers.allSatisfy { $0.target == .ebook })
}
