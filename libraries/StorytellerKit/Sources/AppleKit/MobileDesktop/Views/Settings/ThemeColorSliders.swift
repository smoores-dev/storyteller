#if os(iOS) || os(macOS)
import SwiftUI

#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct ThemeColorSliders: View {
    let label: String
    @Binding var value: String
    let role: CoverReaderChrome.Role
    let dark: Bool
    let tone: CoverHSB
    let stockValue: String

    @State private var hue: Double = 0
    @State private var saturation: Double = 0
    @State private var brightness: Double = 1
    @State private var showPicker = false
    @State private var copied = false
    @State private var initialized = false
    @State private var lastCommitted: String?

    private var usesCoverHue: Bool {
        CoverReaderChrome.isCoverValue(value)
    }

    private var displayHue: Double {
        usesCoverHue ? tone.hue : hue
    }

    private var resetComponents: (hue: Double, saturation: Double, brightness: Double) {
        if usesCoverHue || CoverReaderChrome.isToken(stockValue) {
            let defaults = CoverReaderChrome.defaultCoverComponents(role: role, dark: dark)
            return (tone.hue, defaults.saturation, defaults.brightness)
        }
        if let components = CoverReaderChrome.coverComponents(stockValue) {
            return (tone.hue, components.saturation, components.brightness)
        }
        return Self.hexToHSB(stockValue) ?? (hue, saturation, brightness)
    }

    private var resolvedHex: String {
        CoverReaderChrome.resolvedHex(value, role: role, tone: tone, dark: dark)
            ?? Self.hsbToHex(hue: displayHue, saturation: saturation, brightness: brightness)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            headerRow
            coverHueToggle
            if !usesCoverHue {
                slider(
                    title: "Hue",
                    value: Binding(
                        get: { hue },
                        set: {
                            hue = $0
                            commit()
                        },
                    ),
                    colors: Self.hueTrackColors,
                    resetTo: resetComponents.hue,
                )
            }
            slider(
                title: "Saturation",
                value: Binding(
                    get: { saturation },
                    set: {
                        saturation = $0
                        commit()
                    },
                ),
                colors: [
                    Color(hue: displayHue, saturation: 0, brightness: brightness),
                    Color(hue: displayHue, saturation: 1, brightness: brightness),
                ],
                resetTo: resetComponents.saturation,
            )
            slider(
                title: "Brightness",
                value: Binding(
                    get: { brightness },
                    set: {
                        brightness = $0
                        commit()
                    },
                ),
                colors: [
                    .black,
                    Color(hue: displayHue, saturation: saturation, brightness: 1),
                ],
                resetTo: resetComponents.brightness,
            )
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.secondary.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.secondary.opacity(0.25), lineWidth: 1)
        )
        .onAppear {
            adopt(value)
            initialized = true
        }
        .onChange(of: value) { _, newValue in
            guard initialized, newValue != lastCommitted else { return }
            adopt(newValue)
        }
    }

    private func adopt(_ raw: String) {
        if let components = CoverReaderChrome.coverComponents(raw) {
            saturation = components.saturation
            brightness = components.brightness
            hue = tone.hue
            return
        }
        if CoverReaderChrome.isToken(raw) {
            let defaults = CoverReaderChrome.defaultCoverComponents(role: role, dark: dark)
            saturation = defaults.saturation
            brightness = defaults.brightness
            hue = tone.hue
            return
        }
        guard let parsed = Self.hexToHSB(raw) else { return }
        if parsed.saturation > 0 || parsed.hue > 0 { hue = parsed.hue }
        saturation = parsed.saturation
        brightness = parsed.brightness
    }

    private func commit() {
        let committed =
            usesCoverHue
            ? CoverReaderChrome.coverValue(saturation: saturation, brightness: brightness)
            : Self.hsbToHex(hue: hue, saturation: saturation, brightness: brightness)
        lastCommitted = committed
        value = committed
    }

    private var headerRow: some View {
        HStack(spacing: 10) {
            Text(label)
                .foregroundStyle(.primary)
            Spacer()
            Button {
                copyHex()
            } label: {
                HStack(spacing: 4) {
                    Text(copied ? "Copied" : resolvedHex.uppercased())
                        .font(.system(.caption, design: .monospaced))
                    Image(systemName: "doc.on.doc")
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            Button {
                showPicker.toggle()
            } label: {
                Circle()
                    .fill(Color(hex: resolvedHex) ?? .clear)
                    .frame(width: 32, height: 32)
                    .overlay(Circle().strokeBorder(Color.secondary.opacity(0.5), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showPicker, arrowEdge: .bottom) {
                InlineColorPicker(
                    hex: Binding(
                        get: { resolvedHex },
                        set: { value = $0 },
                    )
                )
                .padding()
                .frame(width: 320)
                #if os(iOS)
                .presentationCompactAdaptation(.popover)
                #endif
            }
        }
    }

    private var coverHueToggle: some View {
        Toggle(
            "Derive hue from cover",
            isOn: Binding(
                get: { usesCoverHue },
                set: { enabled in
                    if enabled {
                        if saturation < 0.02 {
                            let defaults = CoverReaderChrome.defaultCoverComponents(
                                role: role,
                                dark: dark,
                            )
                            saturation = defaults.saturation
                            brightness = defaults.brightness
                        }
                        value = CoverReaderChrome.coverValue(
                            saturation: saturation,
                            brightness: brightness,
                        )
                    } else {
                        hue = tone.hue
                        value = Self.hsbToHex(
                            hue: tone.hue,
                            saturation: saturation,
                            brightness: brightness,
                        )
                    }
                },
            ),
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        #if os(macOS)
        .toggleStyle(.checkbox)
        #endif
    }

    private func slider(
        title: String,
        value: Binding<Double>,
        colors: [Color],
        resetTo: Double,
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(title): \(Int((value.wrappedValue * 100).rounded()))%")
                .font(.caption2)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                GradientTrackSlider(value: value, colors: colors)
                Button {
                    value.wrappedValue = resetTo
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Reset \(title.lowercased())")
            }
        }
    }

    private func copyHex() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(resolvedHex.uppercased(), forType: .string)
        #else
        UIPasteboard.general.string = resolvedHex.uppercased()
        #endif
        copied = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.2))
            copied = false
        }
    }

    private static let hueTrackColors: [Color] = stride(from: 0, through: 360, by: 60).map {
        Color(hue: Double($0) / 360, saturation: 1, brightness: 1)
    }

    static func hexToHSB(_ hex: String) -> (hue: Double, saturation: Double, brightness: Double)? {
        var cleaned = hex.trimmingCharacters(in: .whitespaces)
        if cleaned.hasPrefix("#") { cleaned = String(cleaned.dropFirst()) }
        guard cleaned.count == 6, let packed = UInt32(cleaned, radix: 16) else { return nil }
        let hsb = CoverColorAverager.hsb(
            red: Double((packed >> 16) & 0xFF) / 255,
            green: Double((packed >> 8) & 0xFF) / 255,
            blue: Double(packed & 0xFF) / 255,
        )
        return (hsb.hue, hsb.saturation, hsb.brightness)
    }

    static func hsbToHex(hue: Double, saturation: Double, brightness: Double) -> String {
        CoverPaletteColor(hue: hue, saturation: saturation, brightness: brightness).hexString
    }
}

struct GradientTrackSlider: View {
    @Binding var value: Double
    let colors: [Color]

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 11)
                    .fill(
                        LinearGradient(
                            colors: colors,
                            startPoint: .leading,
                            endPoint: .trailing,
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 11)
                            .strokeBorder(Color.secondary.opacity(0.25), lineWidth: 1)
                    )
                Circle()
                    .fill(Color.white)
                    .frame(width: 18, height: 18)
                    .overlay(Circle().strokeBorder(Color.black.opacity(0.25), lineWidth: 1))
                    .shadow(radius: 1.5)
                    .offset(
                        x: min(max(value, 0), 1) * (geo.size.width - 22) + 2,
                        y: (geo.size.height - 18) / 2,
                    )
            }
            .contentShape(RoundedRectangle(cornerRadius: 11))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { gesture in
                        value = min(max(gesture.location.x / geo.size.width, 0), 1)
                    }
            )
        }
        .frame(height: 22)
    }
}

#endif
