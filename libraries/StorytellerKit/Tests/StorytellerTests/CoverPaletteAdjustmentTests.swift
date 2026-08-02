import Testing

@testable import StorytellerKit

private let vividSurface = CoverHSB(hue: 0.1, saturation: 0.6, brightness: 0.4)

@Test func intensityMultiplierIsIdentityAtNeutralPoint() {
    #expect(CoverPaletteAdjustment.intensityMultiplier(for: 0.65) == 1)
}

@Test func intensityMultiplierClampsAtMaximum() {
    #expect(CoverPaletteAdjustment.intensityMultiplier(for: 1.0) == 1.5)
    #expect(CoverPaletteAdjustment.intensityMultiplier(for: 5.0) == 1.5)
}

@Test func intensityMultiplierClampsNegativeInputToZero() {
    #expect(CoverPaletteAdjustment.intensityMultiplier(for: -1) == 0)
    #expect(CoverPaletteAdjustment.intensityMultiplier(for: 0) == 0)
}

@Test func fullModeAtNeutralIntensityIsIdentity() {
    let adjusted = CoverPaletteAdjustment.adjustedValues(
        surfaceHSB: vividSurface,
        mode: .full,
        intensity: 0.65,
    )
    #expect(adjusted == CoverDerivedPaletteValues.make(surfaceHSB: vividSurface))
}

@Test func minimalModeMatchesFallbackPaletteRegardlessOfIntensity() {
    let neutral = CoverDerivedPaletteValues.make(
        surfaceHSB: CoverPaletteAdjustment.fallbackSurfaceHSB
    )
    for intensity in [0.0, 0.65, 1.0] {
        let adjusted = CoverPaletteAdjustment.adjustedValues(
            surfaceHSB: vividSurface,
            mode: .minimal,
            intensity: intensity,
        )
        #expect(adjusted == neutral)
    }
}

@Test func lowIntensityDesaturatesTowardNeutralGray() {
    let adjusted = CoverPaletteAdjustment.adjustedSurfaceHSB(
        vividSurface,
        mode: .full,
        intensity: 0.325,
    )
    #expect(adjusted.hue == vividSurface.hue)
    #expect(abs(adjusted.saturation - vividSurface.saturation * 0.5) < 0.0001)
    #expect(adjusted.brightness == vividSurface.brightness)
}

@Test func highIntensitySaturationIsCappedAtOneAndMultiplierAtMax() {
    let nearMax = CoverHSB(hue: 0.5, saturation: 0.9, brightness: 0.4)
    let adjusted = CoverPaletteAdjustment.adjustedSurfaceHSB(
        nearMax,
        mode: .full,
        intensity: 1.0,
    )
    #expect(adjusted.saturation == 1)

    let moderate = CoverPaletteAdjustment.adjustedSurfaceHSB(
        vividSurface,
        mode: .full,
        intensity: 1.0,
    )
    #expect(abs(moderate.saturation - vividSurface.saturation * 1.5) < 0.0001)
}

@Test func mediumModeKeepsTintedBackgroundsButNeutralAccents() {
    let adjusted = CoverPaletteAdjustment.adjustedValues(
        surfaceHSB: vividSurface,
        mode: .medium,
        intensity: 0.65,
    )
    let tinted = CoverDerivedPaletteValues.make(surfaceHSB: vividSurface)
    let neutral = CoverDerivedPaletteValues.make(
        surfaceHSB: CoverPaletteAdjustment.fallbackSurfaceHSB
    )

    #expect(adjusted.surface == tinted.surface)
    #expect(adjusted.contentBackground == tinted.contentBackground)
    #expect(adjusted.cardBackground == tinted.cardBackground)
    #expect(adjusted.cardBorder == tinted.cardBorder)
    #expect(adjusted.lightSurface == tinted.lightSurface)
    #expect(adjusted.lightContentBackground == tinted.lightContentBackground)
    #expect(adjusted.lightCardBackground == tinted.lightCardBackground)
    #expect(adjusted.lightCardBorder == tinted.lightCardBorder)

    #expect(adjusted.accent == neutral.accent)
    #expect(adjusted.brightAccent == neutral.brightAccent)
    #expect(adjusted.mutedAccent == neutral.mutedAccent)
    #expect(adjusted.accentBackground == neutral.accentBackground)
}
