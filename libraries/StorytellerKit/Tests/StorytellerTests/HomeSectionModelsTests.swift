import Testing

@testable import StorytellerKit

@Test func homeSectionsUseCanonicalOrderFiltersAndSorting() {
    let olderReading = homeBook(
        id: "reading-old",
        title: "Older Reading",
        status: "Reading",
        createdAt: "2026-07-01",
    )
    let newerReading = homeBook(
        id: "reading-new",
        title: "Newer Reading",
        status: "Reading",
        createdAt: "2026-07-02",
    )
    let start = homeBook(
        id: "start",
        title: "Start",
        status: "To read",
        createdAt: "2026-07-03",
    )
    let completed = homeBook(
        id: "completed",
        title: "Completed",
        status: "Read",
        createdAt: "2026-07-04",
    )
    let books = [olderReading, newerReading, start, completed]
    let progress = [
        olderReading.id: BookProgress(locator: nil, timestamp: 10, source: .server),
        newerReading.id: BookProgress(locator: nil, timestamp: 20, source: .server),
        completed.id: BookProgress(locator: nil, timestamp: 30, source: .server),
    ]

    let sections = HomeSectionDeriver.sections(books: books, progress: progress)

    #expect(sections.map(\.kind) == HomeSectionKind.allCases)
    #expect(
        sections.map { $0.kind.title } == [
            "Currently Reading", "Start Reading", "Recently Added", "Completed",
        ]
    )
    #expect(sections[0].books.map(\.uuid) == ["reading-new", "reading-old"])
    #expect(sections[1].books.map(\.uuid) == ["start"])
    #expect(
        sections[2].books.map(\.uuid) == [
            "completed", "start", "reading-new", "reading-old",
        ]
    )
    #expect(sections[3].books.map(\.uuid) == ["completed"])
}

@Test func homeSectionSearchMatchesTitleAndAuthorAfterApplyingLimit() {
    let author = BookCreator(
        uuid: nil,
        id: nil,
        name: "Ursula Le Guin",
        fileAs: nil,
        role: nil,
        createdAt: nil,
        updatedAt: nil,
    )
    let match = homeBook(
        id: "match",
        title: "A Wizard of Earthsea",
        status: "Reading",
        createdAt: "2026-07-01",
        authors: [author],
    )

    let sections = HomeSectionDeriver.sections(
        kinds: [.currentlyReading],
        books: [match],
        progress: [:],
        searchText: "Le Guin",
    )

    #expect(sections[0].books.map(\.uuid) == ["match"])
}

@Test func homeSectionsPreserveDuplicateConfiguredKinds() {
    let book = homeBook(
        id: "book",
        title: "Book",
        status: "Reading",
        createdAt: "2026-07-01",
    )

    let sections = HomeSectionDeriver.sections(
        kinds: [.currentlyReading, .currentlyReading],
        books: [book],
        progress: [:],
    )

    #expect(sections.map(\.kind) == [.currentlyReading, .currentlyReading])
    #expect(sections.allSatisfy { $0.books.map(\.uuid) == ["book"] })
}

private func homeBook(
    id: String,
    title: String,
    status: String,
    createdAt: String,
    authors: [BookCreator]? = nil,
) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: "test-source", uuid: id),
        title: title,
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: createdAt,
        updatedAt: nil,
        publicationDate: nil,
        authors: authors,
        narrators: nil,
        creators: nil,
        series: nil,
        tags: nil,
        collections: nil,
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: BookStatus(uuid: nil, name: status),
        position: nil,
        rating: nil,
    )
}
