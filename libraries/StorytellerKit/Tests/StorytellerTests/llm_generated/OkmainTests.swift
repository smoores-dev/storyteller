import Testing

@testable import StorytellerKit

// Reference vectors generated from the Rust okmain 0.2.0 crate (rand 0.10,
// rand_xoshiro 0.8, oklab 1.1.2, fast-srgb8 1.0); see
// Sources/Kit/llm_generated/Okmain/README.md. The Swift port must reproduce
// them bit-exactly.

private func synthImage(width: Int, height: Int, seed: UInt32) -> [UInt8] {
    var buf = [UInt8]()
    buf.reserveCapacity(width * height * 3)
    var s = seed
    for _ in 0..<(width * height * 3) {
        s ^= s << 13
        s ^= s >> 17
        s ^= s << 5
        buf.append(UInt8(truncatingIfNeeded: s >> 24))
    }
    return buf
}

private func quadImage(width: Int, height: Int) -> [UInt8] {
    var buf = [UInt8]()
    buf.reserveCapacity(width * height * 3)
    for y in 0..<height {
        for x in 0..<width {
            let c: [UInt8] =
                switch (x < width / 2, y < height / 2) {
                    case (true, true): [220, 40, 30]
                    case (false, true): [30, 60, 200]
                    case (true, false): [240, 200, 40]
                    case (false, false): [20, 140, 70]
                }
            buf.append(contentsOf: c)
        }
    }
    return buf
}

private func hex(_ colors: [OkmainColor]) -> [String] {
    colors.map { String(format: "%02x%02x%02x", $0.red, $0.green, $0.blue) }
}

struct OkmainRngTests {
    @Test func xoshiroSequenceMatchesRust() {
        var rng = OkmainRng(seed: 314_159)
        let expected: [UInt64] = [
            15_699_830_243_357_337_915, 13_453_648_200_436_985_258,
            313_615_618_010_576_191, 7_178_854_044_434_180_041,
            7_431_627_779_348_426_542, 17_611_570_495_649_024_253,
            6_272_913_214_131_622_045, 15_878_803_440_506_751_367,
        ]
        for value in expected {
            #expect(rng.nextUInt64() == value)
        }
    }

    @Test func floatSequenceMatchesRust() {
        var rng = OkmainRng(seed: 314_159)
        let expectedBits: [UInt32] = [
            1_062_854_912, 1_060_812_021, 1_015_760_352, 1_053_245_650,
            1_053_705_444, 1_064_593_630, 1_051_597_754, 1_063_017_687,
        ]
        for bits in expectedBits {
            #expect(rng.nextFloat().bitPattern == bits)
        }
    }

    @Test func rangeSequenceMatchesRust() {
        var rng = OkmainRng(seed: 314_159)
        let expected = [851, 729, 17, 389, 402, 954, 340, 860]
        for value in expected {
            #expect(rng.nextInt(upperBound: 1000) == value)
        }

        rng = OkmainRng(seed: 314_159)
        let bounds = [3, 7, 250_000, 65_536, 1_000_003, 2, 999_999_937, 41]
        let expectedMixed = [2, 5, 4250, 25_504, 402_870, 1, 340_055_285, 35]
        for (bound, value) in zip(bounds, expectedMixed) {
            #expect(rng.nextInt(upperBound: bound) == value)
        }
    }
}

struct OkmainTests {
    @Test func singlePixel() {
        let colors = Okmain.colors(width: 1, height: 1, rgb: [128, 64, 32])
        #expect(colors.map(hex) == ["804020"])
    }

    @Test func uniformImage() {
        var rgb = [UInt8]()
        for _ in 0..<100 {
            rgb.append(contentsOf: [200, 100, 50])
        }
        let colors = Okmain.colors(width: 10, height: 10, rgb: rgb)
        #expect(colors.map(hex) == ["c86432"])
    }

    @Test func synthImagesMatchRust() {
        #expect(
            Okmain.colors(
                width: 64, height: 48,
                rgb: synthImage(width: 64, height: 48, seed: 12_345),
            ).map(hex) == ["c64d8e", "96e07e", "484787", "88a292"]
        )
        #expect(
            Okmain.colors(
                width: 300, height: 200,
                rgb: synthImage(width: 300, height: 200, seed: 999),
            ).map(hex) == ["b269ce", "8bcc84", "bc5f4c", "464781"]
        )
    }

    @Test func blockAveragedLargeImageMatchesRust() {
        #expect(
            Okmain.colors(
                width: 700, height: 600,
                rgb: synthImage(width: 700, height: 600, seed: 424_242),
            ).map(hex) == ["979f96", "968499"]
        )
    }

    @Test func quadImagesMatchRust() {
        let expected = ["1e3cc8", "dc281e", "f0c828", "148c46"]
        #expect(
            Okmain.colors(width: 120, height: 90, rgb: quadImage(width: 120, height: 90))
                .map(hex) == expected
        )
        #expect(
            Okmain.colors(width: 800, height: 640, rgb: quadImage(width: 800, height: 640))
                .map(hex) == expected
        )
    }

    @Test func gradientMatchesRust() {
        let width = 200
        let height = 150
        var rgb = [UInt8]()
        for y in 0..<height {
            for x in 0..<width {
                rgb.append(UInt8(x * 255 / width))
                rgb.append(UInt8(y * 255 / height))
                rgb.append(UInt8((x + y) * 255 / (width + height)))
            }
        }
        #expect(
            Okmain.colors(width: width, height: height, rgb: rgb)
                .map(hex) == ["b85488", "4fb976", "433939", "c7ccc6"]
        )
    }

    @Test func rejectsInvalidInput() {
        #expect(Okmain.colors(width: 0, height: 1, rgb: [0, 0, 0]) == nil)
        #expect(Okmain.colors(width: 1, height: 1, rgb: []) == nil)
        #expect(Okmain.colors(width: 2, height: 2, rgb: [0, 0, 0]) == nil)

        var config = OkmainConfig()
        config.chromaWeight = 0.5
        #expect(Okmain.colors(width: 1, height: 1, rgb: [1, 2, 3], config: config) == nil)
    }

    @Test func deterministic() {
        let rgb: [UInt8] = [255, 0, 0, 0, 255, 0, 0, 0, 255]
        let a = Okmain.colors(width: 3, height: 1, rgb: rgb)
        let b = Okmain.colors(width: 3, height: 1, rgb: rgb)
        #expect(a != nil)
        #expect(a == b)
    }
}
