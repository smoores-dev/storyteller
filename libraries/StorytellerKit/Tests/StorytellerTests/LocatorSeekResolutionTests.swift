import Foundation
import Testing

@testable import StorytellerKit

@Suite("Locator seek resolution")
struct LocatorSeekResolutionTests {
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
                id: "OEBPS/xhtml/cover.xhtml",
                label: "Cover",
                level: 1,
                mediaOverlay: [],
            ),
            SectionInfo(
                index: 1,
                id: "OEBPS/xhtml/chapter-1.xhtml",
                label: "One",
                level: 1,
                mediaOverlay: [entry("c1-s1", 0), entry("c1-s2", 10)],
            ),
            SectionInfo(
                index: 2,
                id: "OEBPS/xhtml/chapter-2.xhtml",
                label: "Two",
                level: 1,
                mediaOverlay: [entry("c2-s1", 0), entry("c2-s2", 10)],
            ),
        ]
    }

    private func locator(
        href: String,
        type: String = "application/xhtml+xml",
        fragments: [String]? = nil,
        totalProgression: Double? = nil,
    ) -> BookLocator {
        BookLocator(
            href: href,
            type: type,
            title: nil,
            locations: BookLocator.Locations(
                fragments: fragments,
                progression: nil,
                position: nil,
                totalProgression: totalProgression,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )
    }

    @Test("exact href and known fragment resolves to fragment seek")
    func exactMatch() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "OEBPS/xhtml/chapter-2.xhtml",
                fragments: ["c2-s2"],
                totalProgression: 0.9,
            ),
            sections: book(),
        )
        #expect(plan == .fragment(sectionIndex: 2, textId: "c2-s2"))
    }

    @Test("legacy href without OEBPS prefix still matches its section")
    func legacyHref() {
        let plan = resolveLocatorSeek(
            locator: locator(href: "xhtml/chapter-1.xhtml", fragments: ["c1-s2"]),
            sections: book(),
        )
        #expect(plan == .fragment(sectionIndex: 1, textId: "c1-s2"))
    }

    @Test("fragment absent from this parse falls back to totalProgression")
    func foreignFragment() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "OEBPS/xhtml/chapter-2.xhtml",
                fragments: ["other-client-id"],
                totalProgression: 0.75,
            ),
            sections: book(),
        )
        #expect(plan == .totalProgression(0.75))
    }

    @Test("unmatched href falls back to totalProgression")
    func foreignHref() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "content/part-9.xhtml",
                fragments: ["c1-s1"],
                totalProgression: 0.5,
            ),
            sections: book(),
        )
        #expect(plan == .totalProgression(0.5))
    }

    @Test("audio locator with no fragments uses totalProgression")
    func audioLocator() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "audiobook://track",
                type: "audio/mpeg",
                totalProgression: 0.25,
            ),
            sections: book(),
        )
        #expect(plan == .totalProgression(0.25))
    }

    @Test("fragment pointing at an overlay-free section falls back to totalProgression")
    func overlayFreeSection() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "OEBPS/xhtml/cover.xhtml",
                fragments: ["cover-s1"],
                totalProgression: 0.1,
            ),
            sections: book(),
        )
        #expect(plan == .totalProgression(0.1))
    }

    @Test("zero totalProgression is not a usable position")
    func zeroProgression() {
        let plan = resolveLocatorSeek(
            locator: locator(href: "content/part-9.xhtml", totalProgression: 0),
            sections: book(),
        )
        #expect(plan == .none)
    }

    @Test("out of range totalProgression is not a usable position")
    func outOfRangeProgression() {
        let plan = resolveLocatorSeek(
            locator: locator(href: "content/part-9.xhtml", totalProgression: 1.5),
            sections: book(),
        )
        #expect(plan == .none)
    }

    @Test("locator with no location data resolves to none")
    func emptyLocator() {
        let plan = resolveLocatorSeek(
            locator: locator(href: "OEBPS/xhtml/chapter-1.xhtml"),
            sections: book(),
        )
        #expect(plan == .none)
    }

    @Test("empty structure never resolves a fragment seek")
    func emptyStructure() {
        let plan = resolveLocatorSeek(
            locator: locator(
                href: "OEBPS/xhtml/chapter-1.xhtml",
                fragments: ["c1-s1"],
                totalProgression: 0.4,
            ),
            sections: [],
        )
        #expect(plan == .totalProgression(0.4))
    }
}
