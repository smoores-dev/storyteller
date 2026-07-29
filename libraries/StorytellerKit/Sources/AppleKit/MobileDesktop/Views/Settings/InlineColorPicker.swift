#if os(iOS) || os(macOS)
import SwiftUI

let themePresetColors: [String] = [
    "#FFD60A", "#FF9F0A", "#FF453A", "#FF375F", "#BF5AF2", "#5E5CE6", "#0A84FF",
    "#FFF59D", "#FFCC80", "#EF9A9A", "#F48FB1", "#CE93D8", "#90CAF9", "#A5D6A7",
    "#FFFFFF", "#FAF4E8", "#F5E9D5", "#E4EBF5", "#1A1A1A", "#22252A", "#000000",
]

struct InlineColorPicker: View {
    @Binding var hex: String
    @State private var hue: Double = 0
    @State private var saturation: Double = 0
    @State private var brightness: Double = 1
    @State private var hexText: String = ""
    @State private var initialized = false

    private var currentColor: Color {
        Color(hue: hue / 360, saturation: saturation, brightness: brightness)
    }

    private var currentHex: String {
        hsvToHex(hue: hue, saturation: saturation, brightness: brightness)
    }

    var body: some View {
        VStack(spacing: 12) {
            saturationBrightnessPanel
            hueSlider
            HStack(spacing: 12) {
                TextField("#RRGGBB", text: $hexText)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.body, design: .monospaced))
                    #if os(iOS)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled(true)
                    #endif
                    .onChange(of: hexText) { _, typed in
                        guard initialized else { return }
                        guard let hsv = hexToHSV(typed.trimmingCharacters(in: .whitespaces))
                        else { return }
                        if hsvToHex(hue: hsv.h, saturation: hsv.s, brightness: hsv.v)
                            .caseInsensitiveCompare(currentHex) != .orderedSame
                        {
                            hue = hsv.h
                            saturation = hsv.s
                            brightness = hsv.v
                            hex = currentHex
                        }
                    }
                Circle()
                    .fill(currentColor)
                    .frame(width: 36, height: 36)
                    .overlay(Circle().strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1))
            }
            presetRows
        }
        .onAppear {
            adopt(hex)
            initialized = true
        }
        .onChange(of: hex) { _, newHex in
            guard initialized else { return }
            if currentHex.caseInsensitiveCompare(newHex.trimmingCharacters(in: .whitespaces))
                != .orderedSame
            {
                adopt(newHex)
            }
        }
    }

    private func adopt(_ value: String) {
        guard let hsv = hexToHSV(value.trimmingCharacters(in: .whitespaces)) else { return }
        hue = hsv.h
        saturation = hsv.s
        brightness = hsv.v
        hexText = hsvToHex(hue: hsv.h, saturation: hsv.s, brightness: hsv.v)
    }

    private func commitInternalChange() {
        hexText = currentHex
        hex = currentHex
    }

    private var saturationBrightnessPanel: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: [
                                .white,
                                Color(hue: hue / 360, saturation: 1, brightness: 1),
                            ],
                            startPoint: .leading,
                            endPoint: .trailing,
                        )
                    )
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: [.clear, .black],
                            startPoint: .top,
                            endPoint: .bottom,
                        )
                    )
                pickerThumb(color: currentColor)
                    .offset(
                        x: saturation * geo.size.width - 11,
                        y: (1 - brightness) * geo.size.height - 11,
                    )
            }
            .contentShape(RoundedRectangle(cornerRadius: 14))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        saturation = (gesture.location.x / geo.size.width)
                            .clamped(to: 0...1)
                        brightness =
                            1
                            - (gesture.location.y / geo.size.height)
                            .clamped(to: 0...1)
                        commitInternalChange()
                    }
            )
        }
        .frame(height: 170)
    }

    private var hueSlider: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: stride(from: 0, through: 360, by: 60).map {
                                Color(hue: Double($0) / 360, saturation: 1, brightness: 1)
                            },
                            startPoint: .leading,
                            endPoint: .trailing,
                        )
                    )
                pickerThumb(
                    color: Color(hue: hue / 360, saturation: 1, brightness: 1)
                )
                .offset(x: hue / 360 * geo.size.width - 11, y: geo.size.height / 2 - 11)
            }
            .contentShape(RoundedRectangle(cornerRadius: 14))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        hue = (gesture.location.x / geo.size.width).clamped(to: 0...1) * 360
                        commitInternalChange()
                    }
            )
        }
        .frame(height: 28)
    }

    private var presetRows: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(themePresetColors.chunked(into: 7).enumerated()), id: \.offset) {
                _,
                rowColors in
                HStack(spacing: 10) {
                    ForEach(rowColors, id: \.self) { preset in
                        let selected = currentHex.caseInsensitiveCompare(preset) == .orderedSame
                        Circle()
                            .fill(Color(hex: preset) ?? .clear)
                            .frame(width: 30, height: 30)
                            .overlay(
                                Circle().strokeBorder(
                                    selected ? Color.accentColor : Color.secondary.opacity(0.5),
                                    lineWidth: selected ? 2 : 1,
                                )
                            )
                            .onTapGesture {
                                adopt(preset)
                                hex = currentHexAfterAdopt(preset)
                            }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func currentHexAfterAdopt(_ preset: String) -> String {
        guard let hsv = hexToHSV(preset) else { return preset }
        return hsvToHex(hue: hsv.h, saturation: hsv.s, brightness: hsv.v)
    }

    private func pickerThumb(color: Color) -> some View {
        Circle()
            .fill(color)
            .frame(width: 22, height: 22)
            .overlay(Circle().strokeBorder(Color.white, lineWidth: 3))
            .shadow(radius: 2)
    }
}

private func hexToHSV(_ hex: String) -> (h: Double, s: Double, v: Double)? {
    var cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
    cleaned = cleaned.uppercased()
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    let maxC = max(r, g, b)
    let minC = min(r, g, b)
    let delta = maxC - minC
    var h = 0.0
    if delta > 0 {
        if maxC == r {
            h = 60 * ((g - b) / delta).truncatingRemainder(dividingBy: 6)
        } else if maxC == g {
            h = 60 * ((b - r) / delta + 2)
        } else {
            h = 60 * ((r - g) / delta + 4)
        }
        if h < 0 { h += 360 }
    }
    return (h, maxC == 0 ? 0 : delta / maxC, maxC)
}

private func hsvToHex(hue: Double, saturation: Double, brightness: Double) -> String {
    let h = hue.clamped(to: 0...360)
    let c = brightness * saturation
    let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))
    let m = brightness - c
    let (r, g, b): (Double, Double, Double)
    switch h {
        case ..<60: (r, g, b) = (c, x, 0)
        case ..<120: (r, g, b) = (x, c, 0)
        case ..<180: (r, g, b) = (0, c, x)
        case ..<240: (r, g, b) = (0, x, c)
        case ..<300: (r, g, b) = (x, 0, c)
        default: (r, g, b) = (c, 0, x)
    }
    func channel(_ v: Double) -> Int {
        Int(((v + m) * 255).rounded().clamped(to: 0...255))
    }
    return String(format: "#%02X%02X%02X", channel(r), channel(g), channel(b))
}

extension Comparable {
    fileprivate func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

extension Array {
    fileprivate func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}

#endif
