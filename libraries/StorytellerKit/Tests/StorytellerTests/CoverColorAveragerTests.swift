import Testing

@testable import StorytellerKit

@Test func coverColorAveragerAlphaWeightsPixels() {
    var pixels = [UInt8](repeating: 0, count: 8 * 8 * 4)
    pixels.replaceSubrange(0..<4, with: [255, 0, 0, 255])
    pixels.replaceSubrange(4..<8, with: [0, 0, 255, 128])

    #expect(
        CoverColorAverager.averageColor(rgbaPixels: pixels)
            == CoverRGB8(red: 170, green: 0, blue: 85)
    )
}

@Test func coverColorAveragerMatchesDarkAndLightSurfaceTransforms() {
    let redPixel: [UInt8] = [255, 0, 0, 255]
    let redPixels = Array(repeating: redPixel, count: 8 * 8).flatMap { $0 }

    #expect(
        CoverColorAverager.surfaceColor(rgbaPixels: redPixels, dark: true)
            == CoverRGB8(red: 97, green: 21, blue: 21)
    )
    #expect(
        CoverColorAverager.surfaceColor(rgbaPixels: redPixels, dark: false)
            == CoverRGB8(red: 235, green: 197, blue: 197)
    )
}

@Test func coverDerivedPaletteUsesAndroidSurfaceAndContentTone() {
    let redPixel: [UInt8] = [255, 0, 0, 255]
    let redPixels = Array(repeating: redPixel, count: 8 * 8).flatMap { $0 }
    let palette = CoverDerivedPaletteValues.make(rgbaPixels: redPixels)

    #expect(palette.surface.rgb8 == CoverRGB8(red: 97, green: 21, blue: 21))
    #expect(palette.contentBackground.rgb8 == CoverRGB8(red: 76, green: 16, blue: 16))
}

@Test func coverColorAveragerUsesFallbackForTransparentSamples() {
    let transparentPixels = [UInt8](repeating: 0, count: 8 * 8 * 4)

    #expect(CoverColorAverager.surfaceHSB(rgbaPixels: transparentPixels) == nil)
    #expect(
        CoverColorAverager.surfaceColor(rgbaPixels: transparentPixels, dark: true)
            == CoverRGB8(red: 47, green: 63, blue: 71)
    )
}
