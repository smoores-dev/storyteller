import Foundation

package struct StorytellerBookMetadataPayload: Codable, Sendable {
    /// The signed-in user's row from the server's `userBookRating` table.
    struct UserRatingRelation: Codable, Sendable, Hashable {
        let rating: Double?
    }

    let uuid: String
    let title: String
    let subtitle: String?
    let description: String?
    let language: String?
    let createdAt: String?
    let updatedAt: String?
    let publicationDate: String?
    let authors: [BookCreator]?
    let narrators: [BookCreator]?
    let creators: [BookCreator]?
    let series: [BookSeries]?
    let tags: [BookTag]?
    let collections: [BookCollectionSummary]?
    let ebook: BookAsset?
    let audiobook: BookAsset?
    let readaloud: BookReadaloud?
    let status: BookStatus?
    let position: BookReadingPosition?
    let userBookRating: UserRatingRelation?
    let pageCount: Int?
    let duration: Double?
    let alignedAt: String?
    let alignedByStorytellerVersion: String?
    let alignedWith: String?
    let source: String?
    @LenientlyDecoded var alignmentSummary: AlignmentSummary?
    @LenientlyDecoded var identifiers: [BookIdentifier]?

    package init(book: BookMetadata) {
        uuid = book.uuid
        title = book.title
        subtitle = book.subtitle
        description = book.description
        language = book.language
        createdAt = book.createdAt
        updatedAt = book.updatedAt
        publicationDate = book.publicationDate
        authors = book.authors
        narrators = book.narrators
        creators = book.creators
        series = book.series
        tags = book.tags
        collections = book.collections
        ebook = book.ebook
        audiobook = book.audiobook
        readaloud = book.readaloud
        status = book.status
        position = book.position
        userBookRating = book.rating.map { UserRatingRelation(rating: $0) }
        pageCount = book.pageCount
        duration = book.duration
        alignedAt = book.alignedAt
        alignedByStorytellerVersion = book.alignedByStorytellerVersion
        alignedWith = book.alignedWith
        source = book.source
        alignmentSummary = book.alignmentSummary
        identifiers = book.identifiers
    }

    func scoped(to sourceID: BookSourceID) -> BookMetadata {
        BookMetadata(
            bookID: BookID(sourceID: sourceID, uuid: uuid),
            title: title,
            subtitle: subtitle,
            description: description,
            language: language,
            createdAt: createdAt,
            updatedAt: updatedAt,
            publicationDate: publicationDate,
            authors: authors,
            narrators: narrators,
            creators: creators,
            series: series,
            tags: tags,
            collections: collections,
            ebook: ebook,
            audiobook: audiobook,
            readaloud: readaloud,
            status: status,
            position: position,
            rating: userBookRating?.rating,
            pageCount: pageCount,
            duration: duration,
            alignedAt: alignedAt,
            alignedByStorytellerVersion: alignedByStorytellerVersion,
            alignedWith: alignedWith,
            source: source,
            alignmentSummary: alignmentSummary,
            identifiers: identifiers,
        )
    }
}
