import Foundation
import Testing

@testable import StorytellerKit

private func showOnItemBook(
    authors: [String] = [],
    narrators: [String] = [],
    rating: Double? = nil,
    status: String? = nil,
    tags: [String] = [],
    duration: Double? = nil,
    pageCount: Int? = nil,
    publicationDate: String? = nil,
) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: "test-source", uuid: "book"),
        title: "Title",
        subtitle: nil,
        description: nil,
        language: nil,
        createdAt: "2024-03-05 10:00:00",
        updatedAt: nil,
        publicationDate: publicationDate,
        authors: authors.map { creator(named: $0) },
        narrators: narrators.map { creator(named: $0) },
        creators: nil,
        series: nil,
        tags: tags.map { BookTag(uuid: nil, name: $0, createdAt: nil, updatedAt: nil) },
        collections: nil,
        ebook: nil,
        audiobook: nil,
        readaloud: nil,
        status: status.map { BookStatus(uuid: nil, name: $0) },
        position: nil,
        rating: rating,
        pageCount: pageCount,
        duration: duration,
    )
}

private func creator(named name: String) -> BookCreator {
    BookCreator(
        uuid: nil,
        id: nil,
        name: name,
        fileAs: nil,
        role: nil,
        createdAt: nil,
        updatedAt: nil,
    )
}

@Test func decodeSelectionDefaultsToAuto() {
    #expect(ShowOnItemField.decodeSelection("") == [.auto])
    #expect(ShowOnItemField.decodeSelection("auto") == [.auto])
    #expect(ShowOnItemField.decodeSelection("garbage,unknown") == [.auto])
}

@Test func decodeSelectionPrefersAutoAndNoneOverFields() {
    #expect(ShowOnItemField.decodeSelection("authors,auto") == [.auto])
    #expect(ShowOnItemField.decodeSelection("none,authors") == [.none])
}

@Test func decodeSelectionKeepsOrderAndDropsDuplicates() {
    #expect(
        ShowOnItemField.decodeSelection("authors,duration,rating")
            == [.authors, .duration, .rating]
    )
    #expect(ShowOnItemField.decodeSelection("authors,authors,rating") == [.authors, .rating])
}

@Test func encodeDecodeRoundTrips() {
    let selection: [ShowOnItemField] = [.series, .publicationYear]
    #expect(
        ShowOnItemField.decodeSelection(ShowOnItemField.encodeSelection(selection)) == selection
    )
}

@Test func togglingAppendsAndRemovesFields() {
    var selection: [ShowOnItemField] = [.auto]
    selection = ShowOnItemField.toggling(.authors, in: selection)
    #expect(selection == [.authors])
    selection = ShowOnItemField.toggling(.duration, in: selection)
    #expect(selection == [.authors, .duration])
    selection = ShowOnItemField.toggling(.rating, in: selection)
    #expect(selection == [.authors, .duration, .rating])
    selection = ShowOnItemField.toggling(.duration, in: selection)
    #expect(selection == [.authors, .rating])
}

@Test func togglingLastFieldOffFallsBackToAuto() {
    let selection = ShowOnItemField.toggling(.authors, in: [.authors])
    #expect(selection == [.auto])
}

@Test func togglingAutoOrNoneClearsFields() {
    #expect(ShowOnItemField.toggling(.auto, in: [.authors, .duration]) == [.auto])
    #expect(ShowOnItemField.toggling(.none, in: [.authors, .duration]) == [.none])
}

@Test func displayRowsReturnsNilForAutoAndEmptyForNone() {
    #expect(ShowOnItemField.displayRows([.auto]) == nil)
    #expect(ShowOnItemField.displayRows([]) == nil)
    #expect(ShowOnItemField.displayRows([.none]) == [])
}

@Test func displayRowsPairsCompactFieldsAndIsolatesLongOnes() {
    #expect(
        ShowOnItemField.displayRows([.authors, .pageCount, .publicationYear, .status])
            == [[.authors], [.pageCount, .publicationYear], [.status]]
    )
    #expect(
        ShowOnItemField.displayRows([.duration, .rating, .fileSize])
            == [[.duration, .rating], [.fileSize]]
    )
    #expect(
        ShowOnItemField.displayRows([.pageCount, .authors, .duration])
            == [[.pageCount], [.authors], [.duration]]
    )
}

@Test func secondaryLineCountMatchesRows() {
    #expect(ShowOnItemField.secondaryLineCount([.auto]) == 1)
    #expect(ShowOnItemField.secondaryLineCount([.none]) == 0)
    #expect(
        ShowOnItemField.secondaryLineCount([.authors, .pageCount, .publicationYear]) == 2
    )
}

@Test func rowTextJoinsValuesAndKeepsEmptiesAsDashes() {
    let book = showOnItemBook(authors: ["Ann Author"], duration: 5400)
    #expect(ShowOnItemField.rowText([.authors], for: book) == "Ann Author")
    #expect(
        ShowOnItemField.rowText([.pageCount, .duration], for: book)
            == "\u{2014} \u{00B7} 1h 30m"
    )
    #expect(ShowOnItemField.rowText([.narrators], for: book) == "\u{2014}")
}

@Test func displayValuesUseExistingFormattingHelpers() {
    let book = showOnItemBook(
        authors: ["Ann Author", "Bo Cowriter"],
        narrators: ["Nina Narrator"],
        rating: 4.8,
        status: "Reading",
        tags: ["fantasy", "favorites"],
        duration: 3660,
        pageCount: 320,
        publicationDate: "2021-06-01 00:00:00",
    )
    #expect(ShowOnItemField.authors.displayValue(for: book) == "Ann Author, Bo Cowriter")
    #expect(ShowOnItemField.narrators.displayValue(for: book) == "Nina Narrator")
    #expect(ShowOnItemField.duration.displayValue(for: book) == "1h 1m")
    #expect(ShowOnItemField.pageCount.displayValue(for: book) == "320 pages")
    #expect(ShowOnItemField.publicationYear.displayValue(for: book) == "2021")
    #expect(ShowOnItemField.rating.displayValue(for: book) == "4.8\u{2605}")
    #expect(ShowOnItemField.status.displayValue(for: book) == "Reading")
    #expect(ShowOnItemField.tags.displayValue(for: book) == "fantasy, favorites")
    #expect(ShowOnItemField.series.displayValue(for: book) == "")
}

@Test func ratingDisplayStripsTrailingZeros() {
    #expect(ShowOnItemField.trimmedRating(5.0) == "5")
    #expect(ShowOnItemField.trimmedRating(4.80) == "4.8")
    #expect(ShowOnItemField.trimmedRating(4.25) == "4.25")
}

@Test func selectionSummaryDescribesCurrentChoice() {
    #expect(ShowOnItemField.selectionSummary([.auto]) == "Auto (Sort Field)")
    #expect(ShowOnItemField.selectionSummary([.none]) == "None")
    #expect(ShowOnItemField.selectionSummary([.authors, .duration]) == "Authors, Duration")
}
