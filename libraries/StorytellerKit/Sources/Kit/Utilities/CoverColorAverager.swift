public struct CoverRGB8: Equatable, Sendable {
    public let red: UInt8
    public let green: UInt8
    public let blue: UInt8

    public init(red: UInt8, green: UInt8, blue: UInt8) {
        self.red = red
        self.green = green
        self.blue = blue
    }
}

public struct CoverHSB: Equatable, Sendable {
    public let hue: Double
    public let saturation: Double
    public let brightness: Double

    public init(hue: Double, saturation: Double, brightness: Double) {
        self.hue = hue
        self.saturation = saturation
        self.brightness = brightness
    }
}

public enum CoverColorAverager {
    /// The platform adapter owns downsampling and supplies non-premultiplied RGBA bytes.
    public static func surfaceColor(rgbaPixels: [UInt8], dark: Bool) -> CoverRGB8 {
        let surface =
            surfaceHSB(rgbaPixels: rgbaPixels)
            ?? CoverHSB(hue: 0.56, saturation: 0.34, brightness: 0.28)

        guard !dark else { return rgb(surface) }
        let lightSaturation =
            surface.saturation < 0.08
            ? 0 : min(max(surface.saturation * 0.24, 0.055), 0.16)
        return rgb(CoverHSB(hue: surface.hue, saturation: lightSaturation, brightness: 0.92))
    }

    public static func surfaceHSB(rgbaPixels: [UInt8]) -> CoverHSB? {
        guard let average = averageColor(rgbaPixels: rgbaPixels) else { return nil }
        let source = hsb(
            red: Double(average.red) / 255,
            green: Double(average.green) / 255,
            blue: Double(average.blue) / 255,
        )
        return CoverHSB(
            hue: source.hue,
            saturation: source.saturation < 0.08
                ? 0.06 : min(max(source.saturation * 1.15, 0.28), 0.78),
            brightness: min(max(source.brightness * 0.58, 0.18), 0.38),
        )
    }

    static func averageColor(rgbaPixels: [UInt8]) -> CoverRGB8? {
        guard !rgbaPixels.isEmpty, rgbaPixels.count.isMultiple(of: 4) else { return nil }

        var red = 0.0
        var green = 0.0
        var blue = 0.0
        var weight = 0.0

        for offset in stride(from: 0, to: rgbaPixels.count, by: 4) {
            let alpha = Double(rgbaPixels[offset + 3]) / 255
            guard alpha > 0.05 else { continue }
            red += Double(rgbaPixels[offset]) * alpha
            green += Double(rgbaPixels[offset + 1]) * alpha
            blue += Double(rgbaPixels[offset + 2]) * alpha
            weight += alpha
        }

        guard weight > 0 else { return nil }
        return CoverRGB8(
            red: UInt8(clamping: Int((red / weight).rounded())),
            green: UInt8(clamping: Int((green / weight).rounded())),
            blue: UInt8(clamping: Int((blue / weight).rounded())),
        )
    }

    static func hsb(red: Double, green: Double, blue: Double) -> CoverHSB {
        let maximum = max(red, green, blue)
        let minimum = min(red, green, blue)
        let delta = maximum - minimum
        let saturation = maximum == 0 ? 0 : delta / maximum

        let hue: Double
        if delta == 0 {
            hue = 0
        } else if maximum == red {
            hue = ((green - blue) / delta).truncatingRemainder(dividingBy: 6) / 6
        } else if maximum == green {
            hue = ((blue - red) / delta + 2) / 6
        } else {
            hue = ((red - green) / delta + 4) / 6
        }

        return CoverHSB(
            hue: hue < 0 ? hue + 1 : hue,
            saturation: saturation,
            brightness: maximum,
        )
    }

    static func rgb(_ hsb: CoverHSB) -> CoverRGB8 {
        let chroma = hsb.brightness * hsb.saturation
        let hueSection = hsb.hue * 6
        let intermediate =
            chroma
            * (1 - abs(hueSection.truncatingRemainder(dividingBy: 2) - 1))
        let offset = hsb.brightness - chroma

        let channels: (Double, Double, Double)
        switch Int(hueSection.rounded(.down)) % 6 {
            case 0: channels = (chroma, intermediate, 0)
            case 1: channels = (intermediate, chroma, 0)
            case 2: channels = (0, chroma, intermediate)
            case 3: channels = (0, intermediate, chroma)
            case 4: channels = (intermediate, 0, chroma)
            default: channels = (chroma, 0, intermediate)
        }

        return CoverRGB8(
            red: channel(channels.0 + offset),
            green: channel(channels.1 + offset),
            blue: channel(channels.2 + offset),
        )
    }

    private static func channel(_ value: Double) -> UInt8 {
        UInt8(clamping: Int((value * 255).rounded()))
    }
}
