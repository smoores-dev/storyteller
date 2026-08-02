import Foundation
import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

private func makeBook(
    uuid: String,
    title: String,
    grade: String?,
) -> BookMetadata {
    BookMetadata(
        bookID: BookID(sourceID: "source-1", uuid: uuid),
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
        alignmentSummary: grade.map {
            AlignmentSummary(
                grade: $0,
                score: 80,
                chapters: 10,
                missingSentences: 5,
                mutedChapters: 1,
                failedChapters: 0,
                unalignedAudio: 0,
            )
        },
    )
}


@Test func gradeRanksRunFromFOneToAPlusEight() {
    #expect(AlignmentGradeScale.rank(for: "F") == 1)
    #expect(AlignmentGradeScale.rank(for: "D") == 2)
    #expect(AlignmentGradeScale.rank(for: "C") == 3)
    #expect(AlignmentGradeScale.rank(for: "B-") == 4)
    #expect(AlignmentGradeScale.rank(for: "B") == 5)
    #expect(AlignmentGradeScale.rank(for: "A-") == 6)
    #expect(AlignmentGradeScale.rank(for: "A") == 7)
    #expect(AlignmentGradeScale.rank(for: "A+") == 8)
}

@Test func unknownGradeRanksBelowF() {
    #expect(AlignmentGradeScale.rank(for: "Z") == 0)
    #expect(AlignmentGradeScale.rank(for: "") == 0)
}

@Test func booksSortWorstFirstAndDropBooksWithoutSummaries() {
    let books = [
        makeBook(uuid: "b1", title: "Alpha", grade: "A+"),
        makeBook(uuid: "b2", title: "Beta", grade: "F"),
        makeBook(uuid: "b3", title: "Gamma", grade: nil),
        makeBook(uuid: "b4", title: "Delta", grade: "B-"),
        makeBook(uuid: "b5", title: "Epsilon", grade: "C"),
    ]
    let sorted = AlignmentGradeScale.booksWorstFirst(books)
    #expect(sorted.map(\.uuid) == ["b2", "b5", "b4", "b1"])
}

@Test func worstFirstTieBreaksByArticleStrippedTitle() {
    let books = [
        makeBook(uuid: "b1", title: "The Zebra Book", grade: "B"),
        makeBook(uuid: "b2", title: "An Apple Book", grade: "B"),
        makeBook(uuid: "b3", title: "Middle Book", grade: "B"),
    ]
    let sorted = AlignmentGradeScale.booksWorstFirst(books)
    #expect(sorted.map(\.uuid) == ["b2", "b3", "b1"])
}


@Test func facetsKeepFixedBestToWorstOrder() {
    let facets = AlignmentGradeScale.orderedFacets(from: [
        "F": 3, "A+": 1, "B-": 2, "A": 4,
    ])
    #expect(facets.map(\.grade) == ["A+", "A", "B-", "F"])
    #expect(facets.map(\.count) == [1, 4, 2, 3])
}

@Test func facetsDropZeroCountsAndAppendUnknownGrades() {
    let facets = AlignmentGradeScale.orderedFacets(from: [
        "A": 0, "B": 2, "E": 1,
    ])
    #expect(facets.map(\.grade) == ["B", "E"])
}

@Test func emptyFacetsProduceNoChips() {
    #expect(AlignmentGradeScale.orderedFacets(from: [:]).isEmpty)
}


@Test func assemblyEncodesFalseByOmissionButAlwaysSendsMaps() {
    let overrides = AlignmentOverridesAssembly.assemble(
        markedOkChapters: ["ch1.xhtml": false, "ch2.xhtml": false],
        excludedChapters: ["ch1.xhtml": false],
        intendedUnalignedChapters: ["ch9.xhtml": false],
        excludedAudioFiles: ["a.mp3": false],
    )
    #expect(overrides.chapters == [:])
    #expect(overrides.unalignedChapters == [:])
    #expect(overrides.audioFiles == [:])
}

@Test func assemblyMergesBothChapterFlagsUnderOneHref() {
    let overrides = AlignmentOverridesAssembly.assemble(
        markedOkChapters: ["ch1.xhtml": true, "ch2.xhtml": true],
        excludedChapters: ["ch1.xhtml": true, "ch3.xhtml": true],
        intendedUnalignedChapters: [:],
        excludedAudioFiles: [:],
    )
    let chapters = overrides.chapters ?? [:]
    #expect(chapters.count == 3)
    #expect(chapters["ch1.xhtml"]?.markedOk == true)
    #expect(chapters["ch1.xhtml"]?.excludeFromScore == true)
    #expect(chapters["ch2.xhtml"]?.markedOk == true)
    #expect(chapters["ch2.xhtml"]?.excludeFromScore == nil)
    #expect(chapters["ch3.xhtml"]?.excludeFromScore == true)
    #expect(chapters["ch3.xhtml"]?.markedOk == nil)
}

@Test func assemblyCarriesIntendedAndExcludedRows() {
    let overrides = AlignmentOverridesAssembly.assemble(
        markedOkChapters: [:],
        excludedChapters: [:],
        intendedUnalignedChapters: ["intro.xhtml": true, "toc.xhtml": false],
        excludedAudioFiles: ["bonus.mp3": true],
    )
    #expect(overrides.unalignedChapters?.count == 1)
    #expect(overrides.unalignedChapters?["intro.xhtml"]?.intended == true)
    #expect(overrides.audioFiles?.count == 1)
    #expect(overrides.audioFiles?["bonus.mp3"]?.excluded == true)
}

@Test func assembledOverridesEncodeWithLiteralHrefKeys() throws {
    let overrides = AlignmentOverridesAssembly.assemble(
        markedOkChapters: ["OEBPS/chapter_one.xhtml": true],
        excludedChapters: [:],
        intendedUnalignedChapters: [:],
        excludedAudioFiles: ["Audio Files/part 01.mp3": true],
    )
    let data = try JSONEncoder().encode(overrides)
    let object = try #require(
        try JSONSerialization.jsonObject(with: data) as? [String: Any]
    )
    let chapters = try #require(object["chapters"] as? [String: Any])
    #expect(chapters["OEBPS/chapter_one.xhtml"] != nil)
    let audioFiles = try #require(object["audioFiles"] as? [String: Any])
    #expect(audioFiles["Audio Files/part 01.mp3"] != nil)
}


@Test func bookPayloadDecodesAlignmentSummaryLeniently() throws {
    let withSummary = """
        {
          "uuid": "b-1",
          "title": "Book One",
          "alignmentSummary": {
            "grade": "B-",
            "score": 78,
            "chapters": 21,
            "missingSentences": 133,
            "mutedChapters": 1,
            "failedChapters": 0,
            "unalignedAudio": 2
          }
        }
        """
    let payload = try JSONDecoder().decode(
        StorytellerBookMetadataPayload.self,
        from: Data(withSummary.utf8),
    )
    let book = payload.scoped(to: "source-1")
    #expect(book.alignmentSummary?.grade == "B-")
    #expect(book.alignmentSummary?.score == 78)
    #expect(book.alignmentSummary?.missingSentences == 133)

    let withoutSummary = """
        { "uuid": "b-2", "title": "Old Server Book" }
        """
    let oldPayload = try JSONDecoder().decode(
        StorytellerBookMetadataPayload.self,
        from: Data(withoutSummary.utf8),
    )
    #expect(oldPayload.scoped(to: "source-1").alignmentSummary == nil)

    let nullSummary = """
        { "uuid": "b-3", "title": "Null Summary Book", "alignmentSummary": null }
        """
    let nullPayload = try JSONDecoder().decode(
        StorytellerBookMetadataPayload.self,
        from: Data(nullSummary.utf8),
    )
    #expect(nullPayload.scoped(to: "source-1").alignmentSummary == nil)
}

@Test func overlapFindsLongestCommonWordRunIgnoringCaseAndPunctuation() throws {
    let ebook = AlignmentMatchOverlap.tokenize(
        "Joost had two problems: the moon and his moustache."
    )
    let transcript = AlignmentMatchOverlap.tokenize(
        "1. Jost Jost had two problems—the moon and his mustache"
    )
    let run = try #require(AlignmentMatchOverlap.longestCommonRun(ebook, transcript))
    let ebookRun = ebook[run.aStart..<(run.aStart + run.length)].joined(separator: " ")
    let transcriptRun = transcript[run.bStart..<(run.bStart + run.length)]
        .joined(separator: " ")
    #expect(ebookRun == "moon and his")
    #expect(transcriptRun == "moon and his")
}

@Test func overlapRequiresAtLeastTwoSharedWords() {
    #expect(
        AlignmentMatchOverlap.longestCommonRun(["only", "moon", "here"], ["moon", "alone"])
            == nil
    )
    #expect(AlignmentMatchOverlap.longestCommonRun([], ["moon", "alone"]) == nil)
    #expect(
        AlignmentMatchOverlap.longestCommonRun(
            ["Pick", "up", "the", "knife."],
            ["hold.", "Pick", "up", "the", "knife", ".", "2."],
        ) == AlignmentMatchOverlap.TokenRun(aStart: 0, bStart: 1, length: 4)
    )
}

@Test func summaryWithMissingCountFieldsDecodesWithZeroDefaults() throws {
    let json = """
        {
          "uuid": "b-4",
          "title": "Newer Server Book",
          "alignmentSummary": { "grade": "A", "score": 96 }
        }
        """
    let payload = try JSONDecoder().decode(
        StorytellerBookMetadataPayload.self,
        from: Data(json.utf8),
    )
    let summary = try #require(payload.scoped(to: "source-1").alignmentSummary)
    #expect(summary.grade == "A")
    #expect(summary.score == 96)
    #expect(summary.chapters == 0)
    #expect(summary.missingSentences == 0)
    #expect(summary.failedChapters == 0)
}

@Test func malformedSummaryDegradesToNilInsteadOfDroppingBook() throws {
    let books = """
        [
          {
            "uuid": "b-5",
            "title": "Drifted Schema Book",
            "alignmentSummary": { "quality": "good" }
          },
          { "uuid": "b-6", "title": "Fine Book" }
        ]
        """
    let wrapper = try JSONDecoder().decode(
        LenientArrayWrapper<StorytellerBookMetadataPayload>.self,
        from: Data(books.utf8),
    )
    #expect(wrapper.values.count == 2)
    #expect(wrapper.values[0].scoped(to: "source-1").alignmentSummary == nil)
    #expect(wrapper.values[0].scoped(to: "source-1").title == "Drifted Schema Book")
}

@Test func payloadRoundTripsSummaryThroughContentServerEncoding() throws {
    let book = makeBook(uuid: "b-7", title: "Round Trip", grade: "B")
    let encoded = try JSONEncoder().encode(StorytellerBookMetadataPayload(book: book))
    let decoded = try JSONDecoder().decode(
        StorytellerBookMetadataPayload.self,
        from: encoded,
    )
    #expect(decoded.scoped(to: "source-1").alignmentSummary?.grade == "B")

    let noSummary = makeBook(uuid: "b-8", title: "No Summary", grade: nil)
    let encodedNone = try JSONEncoder().encode(StorytellerBookMetadataPayload(book: noSummary))
    let object = try #require(
        try JSONSerialization.jsonObject(with: encodedNone) as? [String: Any]
    )
    #expect(object["alignmentSummary"] == nil)
}
