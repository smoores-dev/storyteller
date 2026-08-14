#if os(iOS) || os(macOS)
import CoreGraphics
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

/// A small semantic palette derived from cover artwork.
///
/// `surface` is suitable for a large background, while `accent` and
/// `accentBackground` form a contrasting foreground/background pair for compact controls.
struct CoverDerivedPalette {
    let surface: Color
    let accent: Color
    let brightAccent: Color
    let deepAccent: Color
    let mutedAccent: Color
    let accentBackground: Color
    let contentBackground: Color
    let cardBackground: Color
    let cardBorder: Color
    let lightSurface: Color
    let lightContentBackground: Color
    let lightCardBackground: Color
    let lightCardBorder: Color
    /// The cover surface tone the palette was derived from, kept so the palette can be
    /// re-generated under different colorfulness settings.
    var surfaceHSB: CoverHSB = CoverPaletteAdjustment.fallbackSurfaceHSB

    var accentTrack: Color {
        accent.opacity(0.3)
    }

    func ratingAccent(for colorScheme: ColorScheme) -> Color {
        colorScheme == .light ? deepAccent : brightAccent
    }

    func resolved(for colorScheme: ColorScheme) -> CoverDerivedPalette {
        guard colorScheme == .light else { return self }
        return CoverDerivedPalette(
            surface: lightSurface,
            accent: accent,
            brightAccent: brightAccent,
            deepAccent: deepAccent,
            mutedAccent: mutedAccent,
            accentBackground: accentBackground,
            contentBackground: lightContentBackground,
            cardBackground: lightCardBackground,
            cardBorder: lightCardBorder,
            lightSurface: lightSurface,
            lightContentBackground: lightContentBackground,
            lightCardBackground: lightCardBackground,
            lightCardBorder: lightCardBorder,
            surfaceHSB: surfaceHSB,
        )
    }

    /// Regenerates the palette under the user's colorfulness settings. Apply before
    /// `resolved(for:)`.
    func adjusted(mode: CoverColorMode, intensity: Double) -> CoverDerivedPalette {
        if mode == .full, CoverPaletteAdjustment.intensityMultiplier(for: intensity) == 1 {
            return self
        }
        return Self.palette(
            from: CoverPaletteAdjustment.adjustedValues(
                surfaceHSB: surfaceHSB,
                mode: mode,
                intensity: intensity,
            ),
            surfaceHSB: surfaceHSB,
        )
    }

    func adjusted(for library: StorytellerGlobalConfig.Library) -> CoverDerivedPalette {
        adjusted(
            mode: CoverColorMode(rawValue: library.colorMode) ?? .full,
            intensity: library.colorIntensity,
        )
    }

    static func fallback() -> CoverDerivedPalette {
        makePalette(hue: 0.56, saturation: 0.34, brightness: 0.28)
    }

    static func load(for bookID: BookID) async -> CoverDerivedPalette? {
        var coverData = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: false)
        if coverData == nil {
            coverData = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: true)
        }
        guard let coverData else { return nil }
        #if os(macOS)
        guard let image = NSImage(data: coverData), let derived = make(from: image) else {
            return nil
        }
        #else
        guard let image = UIImage(data: coverData), let derived = make(from: image) else {
            return nil
        }
        #endif
        let library = await SettingsActor.shared.config.library
        return derived.adjusted(for: library)
    }

    static func make(from cgImage: CGImage) -> CoverDerivedPalette? {
        guard
            let rgbaPixels = sampledRGBA(of: cgImage),
            let surface = CoverColorAverager.surfaceHSB(rgbaPixels: rgbaPixels)
        else { return nil }
        return makePalette(
            hue: surface.hue,
            saturation: surface.saturation,
            brightness: surface.brightness,
        )
    }

    #if os(macOS)
    static func make(from image: NSImage) -> CoverDerivedPalette? {
        var proposedRect = CGRect(origin: .zero, size: image.size)
        guard
            let cgImage = image.cgImage(
                forProposedRect: &proposedRect,
                context: nil,
                hints: nil,
            )
        else { return nil }
        return make(from: cgImage)
    }
    #else
    static func make(from image: UIImage) -> CoverDerivedPalette? {
        guard let cgImage = image.cgImage else { return nil }
        return make(from: cgImage)
    }
    #endif

    private static func makePalette(
        hue: Double,
        saturation: Double,
        brightness: Double,
    ) -> CoverDerivedPalette {
        let surfaceHSB = CoverHSB(hue: hue, saturation: saturation, brightness: brightness)
        return palette(
            from: CoverDerivedPaletteValues.make(surfaceHSB: surfaceHSB),
            surfaceHSB: surfaceHSB,
        )
    }

    private static func palette(
        from values: CoverDerivedPaletteValues,
        surfaceHSB: CoverHSB,
    ) -> CoverDerivedPalette {
        CoverDerivedPalette(
            surface: color(values.surface),
            accent: color(values.accent),
            brightAccent: color(values.brightAccent),
            deepAccent: color(values.deepAccent),
            mutedAccent: color(values.mutedAccent),
            accentBackground: color(values.accentBackground),
            contentBackground: color(values.contentBackground),
            cardBackground: color(values.cardBackground),
            cardBorder: color(values.cardBorder),
            lightSurface: color(values.lightSurface),
            lightContentBackground: color(values.lightContentBackground),
            lightCardBackground: color(values.lightCardBackground),
            lightCardBorder: color(values.lightCardBorder),
            surfaceHSB: surfaceHSB,
        )
    }

    private static func color(_ value: CoverPaletteColor) -> Color {
        Color(
            hue: value.hue,
            saturation: value.saturation,
            brightness: value.brightness,
            opacity: value.opacity,
        )
    }

    private static func sampledRGBA(of image: CGImage) -> [UInt8]? {
        let sampleWidth = 8
        let sampleHeight = 8
        let bytesPerPixel = 4
        let bytesPerRow = sampleWidth * bytesPerPixel
        var pixels = [UInt8](repeating: 0, count: sampleHeight * bytesPerRow)

        let didDraw = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress,
                    width: sampleWidth,
                    height: sampleHeight,
                    bitsPerComponent: 8,
                    bytesPerRow: bytesPerRow,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue,
                )
            else { return false }

            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: sampleWidth, height: sampleHeight))
            return true
        }
        guard didDraw else { return nil }

        // Bitmap contexts require premultiplied alpha, while the shared averager accepts
        // straight RGBA so that it can apply alpha weighting exactly once.
        for offset in stride(from: 0, to: pixels.count, by: bytesPerPixel) {
            let alpha = pixels[offset + 3]
            guard alpha > 0, alpha < 255 else { continue }
            for channelOffset in 0..<3 {
                pixels[offset + channelOffset] = UInt8(
                    clamping: Int(
                        (Double(pixels[offset + channelOffset]) * 255 / Double(alpha)).rounded()
                    )
                )
            }
        }
        return pixels
    }
}

#endif
