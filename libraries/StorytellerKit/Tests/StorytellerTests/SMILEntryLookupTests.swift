import Foundation
import Testing

@testable import StorytellerKit

@Suite("SMIL entry lookup")
struct SMILEntryLookupTests {
    // Two chapters of two 10s entries each. cumSumAtEnd is book-global, so the
    // boundary between chapters falls at exactly 20s.
    private func book() -> [SectionInfo] {
        var cumulative = 0.0
        func entry(_ id: String, _ begin: Double) -> SMILEntry {
            cumulative += 10
            return SMILEntry(
                textId: id,
                textHref: "\(id).xhtml",
                audioFile: "audio.mp3",
                begin: begin,
                end: begin + 10,
                cumSumAtEnd: cumulative,
            )
        }
        return [
            SectionInfo(
                index: 0,
                id: "chapter-1",
                label: "One",
                level: 1,
                mediaOverlay: [entry("a", 0), entry("b", 10)],
            ),
            SectionInfo(
                index: 1,
                id: "chapter-2",
                label: "Two",
                level: 1,
                mediaOverlay: [entry("c", 0), entry("d", 10)],
            ),
        ]
    }

    @Test("lands partway into the entry containing the time")
    func landsMidEntry() {
        let match = findEntry(atTotalTime: 14, in: book())
        #expect(match?.sectionIndex == 0)
        #expect(match?.entryIndex == 1)
        #expect(match?.offsetIntoEntry == 4)
    }

    // A seek to a chapter start must not land on the previous chapter's
    // final entry.
    @Test("a chapter boundary belongs to the chapter starting there")
    func chapterBoundaryGoesForward() {
        let match = findEntry(atTotalTime: 20, in: book())
        #expect(match?.sectionIndex == 1)
        #expect(match?.entryIndex == 0)
        #expect(match?.offsetIntoEntry == 0)
    }

    @Test("an entry boundary belongs to the entry starting there")
    func entryBoundaryGoesForward() {
        let match = findEntry(atTotalTime: 10, in: book())
        #expect(match?.sectionIndex == 0)
        #expect(match?.entryIndex == 1)
        #expect(match?.offsetIntoEntry == 0)
    }

    @Test("the start of the book is the first entry")
    func startOfBook() {
        let match = findEntry(atTotalTime: 0, in: book())
        #expect(match?.sectionIndex == 0)
        #expect(match?.entryIndex == 0)
        #expect(match?.offsetIntoEntry == 0)
    }

    @Test("the end of the book clamps to the final entry")
    func endOfBookClamps() {
        for time in [40.0, 999.0] {
            let match = findEntry(atTotalTime: time, in: book())
            #expect(match?.sectionIndex == 1)
            #expect(match?.entryIndex == 1)
            #expect(match?.offsetIntoEntry == 10)
        }
    }

    @Test("narration-free sections are skipped")
    func skipsEmptySections() {
        let sections =
            [SectionInfo(index: 0, id: "cover", label: nil, level: nil, mediaOverlay: [])]
            + book()
        let match = findEntry(atTotalTime: 5, in: sections)
        #expect(match?.sectionIndex == 1)
        #expect(match?.entryIndex == 0)
    }

    @Test("a zero-duration entry is never the match")
    func skipsZeroDurationEntry() {
        let sections = [
            SectionInfo(
                index: 0,
                id: "chapter-1",
                label: "One",
                level: 1,
                mediaOverlay: [
                    SMILEntry(
                        textId: "a",
                        textHref: "a.xhtml",
                        audioFile: "audio.mp3",
                        begin: 0,
                        end: 10,
                        cumSumAtEnd: 10,
                    ),
                    SMILEntry(
                        textId: "empty",
                        textHref: "empty.xhtml",
                        audioFile: "audio.mp3",
                        begin: 10,
                        end: 10,
                        cumSumAtEnd: 10,
                    ),
                    SMILEntry(
                        textId: "b",
                        textHref: "b.xhtml",
                        audioFile: "audio.mp3",
                        begin: 10,
                        end: 20,
                        cumSumAtEnd: 20,
                    ),
                ],
            )
        ]

        let match = findEntry(atTotalTime: 10, in: sections)
        #expect(match?.entryIndex == 2)
        #expect(match?.offsetIntoEntry == 0)
    }

    @Test("a book with no narration has no entry")
    func noNarration() {
        let sections =
            [SectionInfo(index: 0, id: "cover", label: nil, level: nil, mediaOverlay: [])]
        #expect(findEntry(atTotalTime: 0, in: sections) == nil)
        #expect(findEntry(atTotalTime: 0, in: []) == nil)
    }

    // A skip target is book time, resolved by the same lookup a scrub uses.
    private func skipLanding(from elapsed: Double, by delta: Double) -> (
        sectionIndex: Int, entryIndex: Int, offsetIntoEntry: Double
    )? {
        findEntry(
            atTotalTime: skipTarget(fromBookElapsed: elapsed, by: delta, bookTotal: 40),
            in: book(),
        )
    }

    @Test("a forward skip carries its residual distance across a chapter")
    func forwardSkipCrossesChapter() {
        let landing = skipLanding(from: 16, by: 15)
        #expect(landing?.sectionIndex == 1)
        #expect(landing?.entryIndex == 1)
        #expect(landing?.offsetIntoEntry == 1)
    }

    @Test("a backward skip carries its residual distance across a chapter")
    func backwardSkipCrossesChapter() {
        let landing = skipLanding(from: 24, by: -15)
        #expect(landing?.sectionIndex == 0)
        #expect(landing?.entryIndex == 0)
        #expect(landing?.offsetIntoEntry == 9)
    }

    @Test("a backward skip clamps at the start of the book, not the audio file")
    func backwardSkipClampsAtBookStart() {
        #expect(skipTarget(fromBookElapsed: 24, by: -60, bookTotal: 40) == 0)
        let landing = skipLanding(from: 24, by: -60)
        #expect(landing?.sectionIndex == 0)
        #expect(landing?.entryIndex == 0)
        #expect(landing?.offsetIntoEntry == 0)
    }

    @Test("a forward skip clamps inside the final entry, not past the book")
    func forwardSkipClampsInsideFinalEntry() {
        #expect(skipTarget(fromBookElapsed: 24, by: 60, bookTotal: 40) == 39.99)
        let landing = skipLanding(from: 24, by: 60)
        #expect(landing?.sectionIndex == 1)
        #expect(landing?.entryIndex == 1)
    }

    @Test("a book with no duration has nowhere to skip to")
    func skipWithoutDuration() {
        #expect(skipTarget(fromBookElapsed: 0, by: 15, bookTotal: 0) == 0)
    }
}

@Suite("Previous chapter restart rule")
struct PreviousChapterRestartTests {
    private let now = Date(timeIntervalSince1970: 1_000)

    @Test("a press early in a chapter steps back")
    func earlyPressStepsBack() {
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.005,
                lastRestartAt: nil,
                now: now,
            ) == false
        )
    }

    @Test("a press past the threshold restarts the chapter")
    func latePressRestarts() {
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.5,
                lastRestartAt: nil,
                now: now,
            ) == true
        )
    }

    @Test("a second press inside the window steps back instead of restarting again")
    func doublePressStepsBack() {
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.5,
                lastRestartAt: now.addingTimeInterval(-1),
                now: now,
            ) == false
        )
    }

    @Test("a press after the window restarts again")
    func afterWindowRestarts() {
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.5,
                lastRestartAt: now.addingTimeInterval(-5),
                now: now,
            ) == true
        )
    }

    @Test("an unstarted chapter steps back")
    func unstartedChapter() {
        #expect(
            previousChapterRestarts(
                progressInChapter: 0,
                lastRestartAt: nil,
                now: now,
            ) == false
        )
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.5,
                lastRestartAt: nil,
                now: now,
            ) == true
        )
        #expect(
            previousChapterRestarts(
                progressInChapter: 0.5,
                lastRestartAt: now.addingTimeInterval(-1),
                now: now,
            ) == false
        )
    }
}
