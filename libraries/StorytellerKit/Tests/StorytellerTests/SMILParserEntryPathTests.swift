import Foundation
import Testing

@testable import StorytellerKit

@Suite("SMIL archive entry paths")
struct SMILParserEntryPathTests {
    @Test("audio src resolves to the decoded entry name")
    func audioSrcResolvesToDecodedEntryName() {
        #expect(
            SMILParser.entryPath(
                forHref: "../Audio/01%20Chapter.mp3",
                relativeTo: "OEBPS/MediaOverlays",
            )
                == "OEBPS/Audio/01 Chapter.mp3"
        )
    }

    @Test("digit-only audio names are unaffected")
    func digitOnlyNamesAreUnaffected() {
        #expect(
            SMILParser.entryPath(
                forHref: "../Audio/000000-00001.mp4",
                relativeTo: "OEBPS/MediaOverlays",
            )
                == "OEBPS/Audio/000000-00001.mp4"
        )
    }

    @Test("a percent sign survives exactly one decode")
    func percentSignDecodesOnce() {
        #expect(
            SMILParser.entryPath(
                forHref: "../Audio/50%25%20off.mp3",
                relativeTo: "OEBPS/MediaOverlays",
            )
                == "OEBPS/Audio/50% off.mp3"
        )
    }

    @Test("non-ascii audio names decode to the entry name")
    func nonAsciiNamesDecode() {
        #expect(
            SMILParser.entryPath(
                forHref: "../Audio/Le%20Caf%C3%A9.mp3",
                relativeTo: "OEBPS/MediaOverlays",
            )
                == "OEBPS/Audio/Le Café.mp3"
        )
    }

    @Test("an encoded hash stays part of the file name")
    func encodedHashStaysInTheName() {
        #expect(
            SMILParser.entryPath(
                forHref: "../Audio/Part%231.mp3",
                relativeTo: "OEBPS/MediaOverlays",
            )
                == "OEBPS/Audio/Part#1.mp3"
        )
    }

    @Test("media overlay hrefs resolve to the decoded entry name")
    func mediaOverlayHrefResolves() {
        #expect(
            SMILParser.entryPath(
                forHref: "MediaOverlays/Chapter%20One.smil",
                relativeTo: "OEBPS",
            )
                == "OEBPS/MediaOverlays/Chapter One.smil"
        )
    }

    @Test("entry paths resolve relative to the archive root for a root opf")
    func rootLevelOpf() {
        #expect(
            SMILParser.entryPath(
                forHref: "Audio/01%20Chapter.mp3",
                relativeTo: "",
            )
                == "Audio/01 Chapter.mp3"
        )
    }
}
