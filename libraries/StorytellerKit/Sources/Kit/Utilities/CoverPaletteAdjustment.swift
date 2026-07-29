/// How strongly cover-derived colors tint the UI, mirroring the web app's color mode.
public enum CoverColorMode: String, CaseIterable, Sendable {
    case full
    case medium
    case minimal
}

/// Pure math for the colorfulness settings: `minimal` drops back to the neutral palette,
/// `medium` keeps tinted backgrounds but neutral accents, and `colorIntensity` scales the
/// tint saturation around the neutral point of 0.65 (multiplier capped at 1.5x).
public enum CoverPaletteAdjustment {
    public static let neutralIntensity: Double = 0.65
    public static let maxIntensityMultiplier: Double = 1.5

    /// Surface tone the palette pipeline already uses when no cover color is available.
    public static let fallbackSurfaceHSB = CoverHSB(hue: 0.56, saturation: 0.34, brightness: 0.28)

    public static func intensityMultiplier(for intensity: Double) -> Double {
        let clamped = min(max(intensity, 0), 1)
        return min(clamped / neutralIntensity, maxIntensityMultiplier)
    }

    public static func adjustedSurfaceHSB(
        _ surface: CoverHSB,
        mode: CoverColorMode,
        intensity: Double,
    ) -> CoverHSB {
        guard mode != .minimal else { return fallbackSurfaceHSB }
        let multiplier = intensityMultiplier(for: intensity)
        guard multiplier != 1 else { return surface }
        return CoverHSB(
            hue: surface.hue,
            saturation: min(max(surface.saturation * multiplier, 0), 1),
            brightness: surface.brightness,
        )
    }

    public static func adjustedValues(
        surfaceHSB: CoverHSB,
        mode: CoverColorMode,
        intensity: Double,
    ) -> CoverDerivedPaletteValues {
        let tinted = CoverDerivedPaletteValues.make(
            surfaceHSB: adjustedSurfaceHSB(surfaceHSB, mode: mode, intensity: intensity)
        )
        guard mode == .medium else { return tinted }

        let neutral = CoverDerivedPaletteValues.make(surfaceHSB: fallbackSurfaceHSB)
        return CoverDerivedPaletteValues(
            surface: tinted.surface,
            accent: neutral.accent,
            brightAccent: neutral.brightAccent,
            deepAccent: neutral.deepAccent,
            mutedAccent: neutral.mutedAccent,
            accentBackground: neutral.accentBackground,
            contentBackground: tinted.contentBackground,
            cardBackground: tinted.cardBackground,
            cardBorder: tinted.cardBorder,
            lightSurface: tinted.lightSurface,
            lightContentBackground: tinted.lightContentBackground,
            lightCardBackground: tinted.lightCardBackground,
            lightCardBorder: tinted.lightCardBorder,
        )
    }
}
