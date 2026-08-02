import StorytellerKit

extension BookMetadata {
    func withBookID(_ bookID: BookID) -> BookMetadata {
        BookMetadata(
            bookID: bookID,
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
            rating: rating,
            pageCount: pageCount,
            duration: duration,
            alignedAt: alignedAt,
            alignedByStorytellerVersion: alignedByStorytellerVersion,
            alignedWith: alignedWith,
            source: source,
        )
    }
}
