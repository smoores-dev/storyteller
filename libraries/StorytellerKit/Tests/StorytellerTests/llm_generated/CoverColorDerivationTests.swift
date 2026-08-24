import Foundation
import Testing

@testable import StorytellerKit

private func quadRGBA(side: Int) -> [UInt8] {
    var buf = [UInt8]()
    buf.reserveCapacity(side * side * 4)
    for y in 0..<side {
        for x in 0..<side {
            let c: [UInt8] =
                switch (x < side / 2, y < side / 2) {
                    case (true, true): [220, 40, 30, 255]
                    case (false, true): [30, 60, 200, 255]
                    case (true, false): [240, 200, 40, 255]
                    case (false, false): [20, 140, 70, 255]
                }
            buf.append(contentsOf: c)
        }
    }
    return buf
}

private func rgb(fromRGBA rgba: [UInt8]) -> [UInt8] {
    var rgb = [UInt8]()
    rgb.reserveCapacity(rgba.count / 4 * 3)
    for offset in stride(from: 0, to: rgba.count, by: 4) {
        rgb.append(rgba[offset])
        rgb.append(rgba[offset + 1])
        rgb.append(rgba[offset + 2])
    }
    return rgb
}

private func testBookID(_ uuid: String = "book-1") -> BookID {
    BookID(sourceID: "source-1", uuid: uuid)
}

struct CoverColorDerivationTests {
    @Test func keyIsStableAndIdentitySensitive() {
        let a = CoverColorDerivation.key(bookID: testBookID(), audio: false)
        let b = CoverColorDerivation.key(bookID: testBookID(), audio: false)
        let audio = CoverColorDerivation.key(bookID: testBookID(), audio: true)
        let other = CoverColorDerivation.key(bookID: testBookID("book-2"), audio: false)
        #expect(a == b)
        #expect(a != audio)
        #expect(a != other)
        #expect(a.hasSuffix("-v\(CoverColorDerivation.algorithmVersion)"))
    }

    @Test func deriveMatchesOkmainAndPopulatesMirror() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let bookID = testBookID()
        let key = CoverColorDerivation.key(bookID: bookID, audio: false)
        let fullRGBA = quadRGBA(side: 120)
        let expected = Okmain.colors(width: 120, height: 120, rgb: rgb(fromRGBA: fullRGBA))

        let actor = CoverCacheActor(directory: directory)
        let derived = await actor.deriveColors(
            bookID: bookID,
            audio: false,
            width: 120,
            height: 120,
            rgb: rgb(fromRGBA: fullRGBA),
        )

        #expect(derived == expected)
        #expect(await actor.cachedColors(bookID: bookID, audio: false) == expected)
        #expect(CoverColorDerivation.cachedColors(forKey: key) == expected)

        await actor.removeAll()
    }

    @Test func persistsAcrossInstances() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let bookID = testBookID()
        let fullRGBA = quadRGBA(side: 90)

        let first = CoverCacheActor(directory: directory)
        let derived = await first.deriveColors(
            bookID: bookID,
            audio: true,
            width: 90,
            height: 90,
            rgb: rgb(fromRGBA: fullRGBA),
        )
        await first.flushPendingColorSave()

        let second = CoverCacheActor(directory: directory)
        #expect(await second.cachedColors(bookID: bookID, audio: true) == derived)
        #expect(derived != nil)

        await second.removeAll()
    }

    @Test func removeClearsBothVariants() async {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let bookID = testBookID()
        let standardKey = CoverColorDerivation.key(bookID: bookID, audio: false)
        let audioKey = CoverColorDerivation.key(bookID: bookID, audio: true)

        let actor = CoverCacheActor(directory: directory)
        _ = await actor.deriveColors(bookID: bookID, audio: false, width: 1, height: 1, rgb: [255, 0, 255])
        _ = await actor.deriveColors(bookID: bookID, audio: true, width: 1, height: 1, rgb: [0, 255, 0])
        #expect(CoverColorDerivation.cachedColors(forKey: standardKey) != nil)
        #expect(CoverColorDerivation.cachedColors(forKey: audioKey) != nil)

        await actor.invalidate(bookID: bookID)
        #expect(await actor.cachedColors(bookID: bookID, audio: false) == nil)
        #expect(await actor.cachedColors(bookID: bookID, audio: true) == nil)
        #expect(CoverColorDerivation.cachedColors(forKey: standardKey) == nil)
        #expect(CoverColorDerivation.cachedColors(forKey: audioKey) == nil)

        await actor.removeAll()
    }

    @Test func placeholderUsesAveraging() {
        let sample = quadRGBA(side: 32)
        let average = CoverColorAverager.averageColor(rgbaPixels: sample)
        #expect(average != nil)
        let surface = CoverColorAverager.surfaceHSB(rgbaPixels: sample)
        #expect(surface == average.map { CoverColorAverager.surfaceHSB(primary: $0) })
    }
}
