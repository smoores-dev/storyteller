import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Test func mediaGridDerivationAcceptsDuplicateBookIDsFromOneSource() async {
    let bookID = BookID(sourceID: "storyteller-source", uuid: "duplicate-book")
    let books = [
        makeLibraryDerivationBook(id: bookID, title: "First"),
        makeLibraryDerivationBook(id: bookID, title: "Duplicate"),
    ]
    let request = MediaGridRenderRequest(
        mediaKind: .ebook,
        selectedFormatFilter: .all,
        selectedTag: nil,
        selectedSeries: nil,
        selectedCollection: nil,
        selectedAuthor: nil,
        selectedNarrator: nil,
        selectedTranslator: nil,
        selectedPublicationYear: nil,
        selectedRating: nil,
        selectedStatus: nil,
        selectedLocation: .all,
        selectedSourceID: nil,
        selectedSourceName: nil,
        searchText: "",
        sortOption: .titleAZ,
        filteredItems: books,
        includeFilterOptions: false,
    )

    let snapshot = await LibraryDerivationActor().deriveMediaGridSnapshot(
        from: MediaGridRenderInput(
            request: request,
            metadata: books,
            paths: [:],
            folderSourceBookIds: [],
        )
    )

    #expect(snapshot.displayItems.count == 1)
    #expect(snapshot.displayItems.first?.id == bookID)
    #expect(snapshot.displayItems.first?.title == "First")
}

private func makeLibraryDerivationBook(id: BookID, title: String) -> BookMetadata {
    BookMetadata(
        bookID: id,
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
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: nil,
        position: nil,
        rating: nil,
    )
}
