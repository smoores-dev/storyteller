import Foundation
import Testing

@testable import StorytellerKit

private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

private func encodeToJSONObject(_ value: some Encodable) throws -> [String: Any] {
    let data = try JSONEncoder().encode(value)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return try #require(object)
}

@Test func alignmentOverridesRoundTripPreservesKeys() throws {
    let overrides = AlignmentOverrides(
        chapters: [
            "OEBPS/chapter_01.xhtml": .init(excludeFromScore: true),
            "OEBPS/chapter_02.xhtml": .init(markedOk: true),
        ],
        unalignedChapters: [
            "OEBPS/copyright_page.xhtml": .init(intended: true)
        ],
        audioFiles: [
            "audio/track_09_bonus.mp3": .init(excluded: true)
        ],
    )

    let data = try JSONEncoder().encode(overrides)
    let decoded = try JSONDecoder().decode(AlignmentOverrides.self, from: data)
    #expect(decoded == overrides)

    let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    let chapters = try #require(object["chapters"] as? [String: Any])
    #expect(Set(chapters.keys) == ["OEBPS/chapter_01.xhtml", "OEBPS/chapter_02.xhtml"])
}

@Test func alignmentOverridesOmitsAbsentSections() throws {
    let overrides = AlignmentOverrides(chapters: ["a.xhtml": .init(markedOk: true)])
    let object = try encodeToJSONObject(overrides)
    #expect(object.keys.sorted() == ["chapters"])
}

@Test func alignmentReportViewDecodes() throws {
    let json = """
        {
          "bookUuid": "b-1",
          "bookTitle": "Project Hail Mary",
          "reportUuid": "rep-1",
          "jobUuid": null,
          "createdAt": "2026-07-01 12:00:00",
          "summary": {
            "grade": "A-",
            "score": 93,
            "chapters": 32,
            "missingSentences": 120,
            "mutedChapters": 1,
            "failedChapters": 0,
            "unalignedAudio": 1
          },
          "totalAudioDuration": 58000.5,
          "alignedAudioDuration": 57000.25,
          "totalSentences": 9000,
          "alignedSentences": 8880,
          "significantChapters": 30,
          "chapters": [
            {
              "href": "OEBPS/chapter_01.xhtml",
              "label": "c001_r1",
              "title": "Chapter 1",
              "audioFiles": [
                {
                  "filepath": "audio/phm_01.mp3",
                  "title": "Track 1",
                  "duration": 1800.0,
                  "start": 0,
                  "end": 1799.5
                }
              ],
              "chapterSentenceCount": 300,
              "alignedSentenceCount": 298,
              "coverage": 0.9933,
              "delta": 2,
              "deltaPct": 0.0067,
              "flagged": false,
              "flags": [ { "label": "cross-file", "tone": "info" } ],
              "firstMatchedSentenceId": 0,
              "lastMatchedSentenceId": 299,
              "firstMatchedSentenceContext": {
                "prevSentence": null,
                "matchedSentence": "First line.",
                "nextSentence": "Second line."
              },
              "lastMatchedSentenceContext": {
                "prevSentence": "Penultimate.",
                "matchedSentence": "Last line.",
                "nextSentence": null
              },
              "transcriptionContext": { "before": "", "after": "first words" },
              "endTranscriptionContext": { "before": "last words", "after": "" },
              "markedOk": false,
              "excludedFromScore": false
            }
          ],
          "unalignedChapters": [
            {
              "href": "OEBPS/copyright.xhtml",
              "label": "copyright",
              "reason": "not-found",
              "preview": "All rights reserved",
              "intended": true
            }
          ],
          "unalignedAudioFiles": [
            {
              "filepath": "audio/bonus_interview.mp3",
              "title": null,
              "duration": 600.0,
              "transcription": "Thanks for listening",
              "excluded": false
            }
          ]
        }
        """
    let view = try decode(BookAlignmentReport.self, from: json)
    #expect(view.summary.grade == "A-")
    #expect(view.summary.score == 93)
    #expect(view.jobUuid == nil)
    #expect(view.chapters.count == 1)
    let chapter = try #require(view.chapters.first)
    #expect(chapter.href == "OEBPS/chapter_01.xhtml")
    #expect(chapter.coverage == 0.9933)
    #expect(chapter.flags == [AlignmentReportFlag(label: "cross-file", tone: "info")])
    #expect(chapter.firstMatchedSentenceContext?.matchedSentence == "First line.")
    #expect(view.unalignedChapters.first?.intended == true)
    #expect(view.unalignedAudioFiles.first?.filepath == "audio/bonus_interview.mp3")
}

@Test func alignmentFacetsDecodes() throws {
    let json = """
        { "grades": { "A+": 3, "B-": 2, "F": 1 }, "total": 6, "muted": 2 }
        """
    let facets = try decode(AlignmentFacets.self, from: json)
    #expect(facets.grades == ["A+": 3, "B-": 2, "F": 1])
    #expect(facets.total == 6)
    #expect(facets.muted == 2)
}
