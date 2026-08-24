#if os(iOS) || os(macOS)
import CoreGraphics
import ImageIO
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct PlayerCardChrome: ViewModifier {
    let palette: CoverDerivedPalette
    var cornerRadius: CGFloat = 20
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return content
            .background(palette.playerGradient(for: colorScheme))
            .clipShape(shape)
            .overlay(
                shape.strokeBorder(
                    palette.resolved(for: colorScheme).cardBorder,
                    lineWidth: 1,
                )
            )
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.35 : 0.15), radius: 5, y: 2)
    }
}

extension View {
    func playerCardChrome(
        _ palette: CoverDerivedPalette,
        cornerRadius: CGFloat = 20,
    ) -> some View {
        modifier(PlayerCardChrome(palette: palette, cornerRadius: cornerRadius))
    }
}

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
    var chromeHSB: CoverHSB = CoverPaletteAdjustment.fallbackSurfaceHSB

    var accentTrack: Color {
        accent.opacity(0.3)
    }

    func ratingAccent(for colorScheme: ColorScheme) -> Color {
        colorScheme == .light ? deepAccent : brightAccent
    }

    func controlTint(for colorScheme: ColorScheme) -> Color {
        Self.color(
            CoverPlayerChrome.controlTint(surfaceHSB: chromeHSB, dark: colorScheme != .light)
        )
    }

    func playerGradient(for colorScheme: ColorScheme) -> LinearGradient {
        let dark = colorScheme != .light
        return LinearGradient(
            colors: [
                Self.color(CoverPlayerChrome.gradientTop(surfaceHSB: chromeHSB, dark: dark)),
                Self.color(CoverPlayerChrome.gradientBottom(surfaceHSB: chromeHSB, dark: dark)),
            ],
            startPoint: .top,
            endPoint: .bottom,
        )
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
            chromeHSB: chromeHSB,
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
            chromeHSB: CoverPaletteAdjustment.adjustedSurfaceHSB(
                surfaceHSB,
                mode: mode,
                intensity: intensity,
            ),
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
        var audio = false
        var coverData = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: false)
        if coverData == nil {
            coverData = await BookServiceActor.shared.cachedCoverData(for: bookID, audio: true)
            audio = coverData != nil
        }
        guard
            let coverData,
            let cgImage = decodeImage(coverData)
        else { return nil }
        CoverImageBookIndex.register(cgImage, bookID: bookID, audio: audio)
        guard let derived = make(from: cgImage) else { return nil }
        let library = await SettingsActor.shared.config.library
        return derived.adjusted(for: library)
    }

    static func decodeImage(_ data: Data) -> CGImage? {
        let options = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, options) else {
            return nil
        }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    static func make(from cgImage: CGImage) -> CoverDerivedPalette? {
        _ = CoverColorBackfill.shared.version

        if let identity = CoverImageBookIndex.lookup(cgImage) {
            let key = CoverColorDerivation.key(bookID: identity.bookID, audio: identity.audio)
            if let final = finalPalette(forKey: key) { return final }
        }

        if let box = paletteCache.object(forKey: cgImage) { return box.palette }

        guard
            let rgbaPixels = sampledRGBA(of: cgImage),
            let surface = CoverColorAverager.surfaceHSB(rgbaPixels: rgbaPixels)
        else { return nil }
        let placeholder = makePalette(
            hue: surface.hue,
            saturation: surface.saturation,
            brightness: surface.brightness,
        )
        paletteCache.setObject(PaletteBox(palette: placeholder), forKey: cgImage)
        return placeholder
    }

    private static func finalPalette(forKey key: String) -> CoverDerivedPalette? {
        guard
            let colors = CoverColorDerivation.cachedColors(forKey: key),
            let first = colors.first
        else { return nil }
        return palette(fromPrimary: first)
    }

    private static func palette(fromPrimary primary: OkmainColor) -> CoverDerivedPalette {
        let surface = CoverColorAverager.surfaceHSB(
            primary: CoverRGB8(red: primary.red, green: primary.green, blue: primary.blue)
        )
        return makePalette(
            hue: surface.hue,
            saturation: surface.saturation,
            brightness: surface.brightness,
        )
    }

    nonisolated(unsafe) private static let paletteCache: NSCache<CGImage, PaletteBox> = {
        let cache = NSCache<CGImage, PaletteBox>()
        cache.countLimit = 64
        return cache
    }()

    private final class PaletteBox {
        let palette: CoverDerivedPalette

        init(palette: CoverDerivedPalette) {
            self.palette = palette
        }
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
        chromeHSB: CoverHSB? = nil,
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
            chromeHSB: chromeHSB ?? surfaceHSB,
        )
    }

    static func color(_ value: CoverPaletteColor) -> Color {
        Color(
            hue: value.hue,
            saturation: value.saturation,
            brightness: value.brightness,
            opacity: value.opacity,
        )
    }

    private static func sampledRGBA(of image: CGImage) -> [UInt8]? {
        let sampleWidth = 128
        let sampleHeight = 128
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

@Observable
final class CoverColorBackfill: @unchecked Sendable {
    static let shared = CoverColorBackfill()

    private(set) var version = 0

    private init() {
        CoverCacheActor.deriveColorsFromData = { [weak self] bookID, audio, data in
            await self?.derive(bookID: bookID, audio: audio, data: data)
        }
    }

    private func derive(bookID: BookID, audio: Bool, data: Data) async {
        guard
            let image = CoverDerivedPalette.decodeImage(data),
            let full = Self.derivationRGB(of: image)
        else { return }
        let derived = await CoverCacheActor.shared.deriveColors(
            bookID: bookID,
            audio: audio,
            width: full.width,
            height: full.height,
            rgb: full.rgb,
        )
        guard derived != nil else { return }
        await MainActor.run {
            self.version += 1
        }
    }

    private static func derivationRGB(
        of image: CGImage
    ) -> (width: Int, height: Int, rgb: [UInt8])? {
        let sourcePixels = image.width * image.height
        guard sourcePixels > 0 else { return nil }
        let scale = min(
            1,
            (Double(CoverColorDerivation.maxDerivationPixels) / Double(sourcePixels))
                .squareRoot()
        )
        let width = max(1, Int(Double(image.width) * scale))
        let height = max(1, Int(Double(image.height) * scale))

        let bytesPerRow = width * 4
        var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)
        let didDraw = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let context = CGContext(
                    data: buffer.baseAddress,
                    width: width,
                    height: height,
                    bitsPerComponent: 8,
                    bytesPerRow: bytesPerRow,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue,
                )
            else { return false }
            context.interpolationQuality = scale < 1 ? .medium : .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard didDraw else { return nil }

        var rgb = [UInt8]()
        rgb.reserveCapacity(width * height * 3)
        for offset in stride(from: 0, to: pixels.count, by: 4) {
            let alpha = Int(pixels[offset + 3])
            for channel in 0..<3 {
                rgb.append(UInt8(clamping: Int(pixels[offset + channel]) + 255 - alpha))
            }
        }
        return (width, height, rgb)
    }
}

private struct ReaderPaletteKey: EnvironmentKey {
    static let defaultValue: CoverDerivedPalette? = nil
}

extension EnvironmentValues {
    var readerPalette: CoverDerivedPalette? {
        get { self[ReaderPaletteKey.self] }
        set { self[ReaderPaletteKey.self] = newValue }
    }
}

private struct ReaderPaletteSurface: ViewModifier {
    let palette: CoverDerivedPalette
    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let resolved = palette.resolved(for: colorScheme)
        content
            .scrollContentBackground(.hidden)
            .background(resolved.contentBackground.ignoresSafeArea())
            .tint(palette.ratingAccent(for: colorScheme))
    }
}

extension View {
    func readerPaletteSurface(_ palette: CoverDerivedPalette) -> some View {
        modifier(ReaderPaletteSurface(palette: palette))
    }

    @ViewBuilder
    func readerPaletteSurface(_ palette: CoverDerivedPalette?) -> some View {
        if let palette {
            modifier(ReaderPaletteSurface(palette: palette))
        } else {
            self
        }
    }

    @ViewBuilder
    func readerPaletteModalSurface(_ palette: CoverDerivedPalette?) -> some View {
        #if os(macOS)
        self
        #else
        readerPaletteSurface(palette)
        #endif
    }

    @ViewBuilder
    func readerPaletteNavigationBar(
        _ palette: CoverDerivedPalette?,
        colorScheme: ColorScheme,
    ) -> some View {
        #if os(iOS)
        if let palette {
            self
                .toolbarBackground(
                    palette.resolved(for: colorScheme).surface,
                    for: .navigationBar,
                )
                .toolbarBackground(.visible, for: .navigationBar)
        } else {
            self
        }
        #else
        self
        #endif
    }
}

#endif
