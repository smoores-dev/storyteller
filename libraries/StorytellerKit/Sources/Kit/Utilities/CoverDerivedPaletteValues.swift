public struct CoverPaletteColor: Equatable, Sendable {
    public let hue: Double
    public let saturation: Double
    public let brightness: Double
    public let opacity: Double

    public init(
        hue: Double,
        saturation: Double,
        brightness: Double,
        opacity: Double = 1,
    ) {
        self.hue = hue
        self.saturation = saturation
        self.brightness = brightness
        self.opacity = opacity
    }

    public var rgb8: CoverRGB8 {
        CoverColorAverager.rgb(
            CoverHSB(hue: hue, saturation: saturation, brightness: brightness)
        )
    }

    public var alpha8: UInt8 {
        UInt8(clamping: Int((min(max(opacity, 0), 1) * 255).rounded()))
    }
}

/// Platform-neutral values for the semantic cover palette used by Apple and Android UIs.
public struct CoverDerivedPaletteValues: Equatable, Sendable {
    public let surface: CoverPaletteColor
    public let accent: CoverPaletteColor
    public let brightAccent: CoverPaletteColor
    /// Accent dark enough to read on the light-scheme surfaces; `accent` and `brightAccent`
    /// are near-white and only work on dark backgrounds.
    public let deepAccent: CoverPaletteColor
    public let mutedAccent: CoverPaletteColor
    public let accentBackground: CoverPaletteColor
    public let contentBackground: CoverPaletteColor
    public let cardBackground: CoverPaletteColor
    public let cardBorder: CoverPaletteColor
    public let lightSurface: CoverPaletteColor
    public let lightContentBackground: CoverPaletteColor
    public let lightCardBackground: CoverPaletteColor
    public let lightCardBorder: CoverPaletteColor

    public static func make(rgbaPixels: [UInt8]) -> CoverDerivedPaletteValues {
        make(
            surfaceHSB: CoverColorAverager.surfaceHSB(rgbaPixels: rgbaPixels)
                ?? CoverHSB(hue: 0.56, saturation: 0.34, brightness: 0.28)
        )
    }

    public static func make(surfaceHSB: CoverHSB) -> CoverDerivedPaletteValues {
        let surface = color(surfaceHSB)
        let contentBackground = shadeWithBlack(surface, opacity: 0.22)

        guard surfaceHSB.saturation >= 0.08 else {
            let lightSurface = gray(0.92)
            return CoverDerivedPaletteValues(
                surface: surface,
                accent: gray(0.86),
                brightAccent: gray(0.98),
                deepAccent: gray(0.32),
                mutedAccent: gray(0.68),
                accentBackground: gray(0.14, opacity: 0.94),
                contentBackground: contentBackground,
                cardBackground: gray(0.22),
                cardBorder: gray(1, opacity: 0.1),
                lightSurface: lightSurface,
                lightContentBackground: gray(0.92),
                lightCardBackground: gray(0.98),
                lightCardBorder: gray(0, opacity: 0.1),
            )
        }

        let hue = surfaceHSB.hue
        let saturation = surfaceHSB.saturation
        let brightness = surfaceHSB.brightness
        let lightSurface = CoverPaletteColor(
            hue: hue,
            saturation: min(max(saturation * 0.24, 0.055), 0.16),
            brightness: 0.92,
        )

        return CoverDerivedPaletteValues(
            surface: surface,
            accent: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.72, 0.24), 0.62),
                brightness: 0.9,
            ),
            brightAccent: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.48, 0.14), 0.42),
                brightness: 1,
            ),
            deepAccent: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.78, 0.32), 0.7),
                brightness: 0.44,
            ),
            mutedAccent: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.07, 0.015), 0.06),
                brightness: 0.72,
            ),
            accentBackground: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 1.08, 0.3), 0.78),
                brightness: min(max(brightness * 0.62, 0.1), 0.24),
                opacity: 0.94,
            ),
            contentBackground: contentBackground,
            cardBackground: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.74, 0.17), 0.52),
                brightness: min(max(brightness * 0.9, 0.22), 0.35),
            ),
            cardBorder: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.58, 0.18), 0.5),
                brightness: 0.82,
                opacity: 0.16,
            ),
            lightSurface: lightSurface,
            lightContentBackground: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.28, 0.06), 0.18),
                brightness: 0.93,
            ),
            lightCardBackground: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.16, 0.035), 0.11),
                brightness: 0.985,
            ),
            lightCardBorder: CoverPaletteColor(
                hue: hue,
                saturation: min(max(saturation * 0.45, 0.12), 0.32),
                brightness: 0.42,
                opacity: 0.18,
            ),
        )
    }

    private static func color(_ hsb: CoverHSB) -> CoverPaletteColor {
        return CoverPaletteColor(
            hue: hsb.hue,
            saturation: hsb.saturation,
            brightness: hsb.brightness,
        )
    }

    private static func gray(_ brightness: Double, opacity: Double = 1) -> CoverPaletteColor {
        CoverPaletteColor(hue: 0, saturation: 0, brightness: brightness, opacity: opacity)
    }

    private static func shadeWithBlack(
        _ color: CoverPaletteColor,
        opacity: Double,
    ) -> CoverPaletteColor {
        let retained = 1 - min(max(opacity, 0), 1)
        let source = color.rgb8
        let red = UInt8(clamping: Int((Double(source.red) * retained).rounded()))
        let green = UInt8(clamping: Int((Double(source.green) * retained).rounded()))
        let blue = UInt8(clamping: Int((Double(source.blue) * retained).rounded()))
        let shaded = CoverColorAverager.hsb(
            red: Double(red) / 255,
            green: Double(green) / 255,
            blue: Double(blue) / 255,
        )
        return CoverPaletteColor(
            hue: shaded.hue,
            saturation: shaded.saturation,
            brightness: shaded.brightness,
            opacity: color.opacity,
        )
    }
}
