#if os(iOS) || os(macOS)
import SwiftUI

public struct PlaybackRateButton: View {
    private let currentRate: Double
    private let onRateChange: (Double) -> Void
    private let backgroundColor: Color
    private let foregroundColor: Color
    private let transparency: Double
    private let showLabel: Bool
    private let buttonSize: CGFloat
    private let showBackground: Bool
    private let compactLabel: Bool
    private let iconFont: Font

    @State private var showSpeedPicker = false
    @State private var sliderValue: Double = 1.0
    @State private var textFieldValue: String = ""
    @FocusState private var isTextFieldFocused: Bool

    public init(
        currentRate: Double,
        onRateChange: @escaping (Double) -> Void,
        backgroundColor: Color = Color.secondary,
        foregroundColor: Color = Color.primary,
        transparency: Double = 1.0,
        showLabel: Bool = true,
        buttonSize: CGFloat = 38,
        showBackground: Bool = true,
        compactLabel: Bool = false,
        iconFont: Font = .callout.weight(.semibold),
    ) {
        self.currentRate = currentRate
        self.onRateChange = onRateChange
        self.backgroundColor = backgroundColor
        self.foregroundColor = foregroundColor
        self.transparency = transparency
        self.showLabel = showLabel
        self.buttonSize = buttonSize
        self.showBackground = showBackground
        self.compactLabel = compactLabel
        self.iconFont = iconFont
    }

    public var body: some View {
        VStack(spacing: compactLabel ? 0 : 6) {
            #if os(iOS)
            Button(action: {
                sliderValue = currentRate
                textFieldValue = formatRate(currentRate)
                showSpeedPicker = true
            }) {
                Image(systemName: "speedometer")
                    .font(iconFont)
                    .foregroundStyle(foregroundColor.opacity(transparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Group {
                            if showBackground {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(backgroundColor.opacity(0.12 * transparency))
                            }
                        }
                    )
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showSpeedPicker) {
                speedSheet
            }
            #else
            Button(action: {
                sliderValue = currentRate
                textFieldValue = formatRate(currentRate)
                showSpeedPicker = true
            }) {
                Image(systemName: "speedometer")
                    .font(iconFont)
                    .foregroundStyle(foregroundColor.opacity(transparency))
                    .frame(width: buttonSize, height: buttonSize)
                    .background(
                        Group {
                            if showBackground {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(backgroundColor.opacity(0.12 * transparency))
                            }
                        }
                    )
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showSpeedPicker) {
                speedPickerContent
                    .frame(width: 340)
                    .padding()
            }
            .onChange(of: showSpeedPicker) { _, isShowing in
                if !isShowing {
                    applyTextFieldValue()
                }
            }
            #endif

            if showLabel && !compactLabel {
                Text(playbackRateDescription)
                    .font(.footnote)
                    .foregroundStyle(foregroundColor.opacity(0.7 * transparency))
            }
        }
        .overlay(alignment: .bottom) {
            if showLabel && compactLabel {
                Text(playbackRateDescription)
                    .font(.caption2)
                    .foregroundStyle(foregroundColor.opacity(0.7 * transparency))
                    .offset(y: 9)
            }
        }
    }

    private var speedPickerContent: some View {
        HStack(spacing: 12) {
            Text("1x")
                .font(.caption)
                .foregroundStyle(.secondary)

            Slider(
                value: $sliderValue,
                in: 1.0...3.0,
                step: 0.05,
            )
            .onChange(of: sliderValue) { _, newValue in
                let snapped = snapToIncrement(newValue)
                textFieldValue = formatRate(snapped)
                onRateChange(snapped)
            }

            Text("3x")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(spacing: 4) {
                TextField("1.0", text: $textFieldValue)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 60)
                    .multilineTextAlignment(.center)
                    #if os(iOS)
                .keyboardType(.decimalPad)
                    #endif
                    .focused($isTextFieldFocused)
                    .onSubmit {
                        applyTextFieldValue()
                    }
                    .onChange(of: isTextFieldFocused) { _, focused in
                        if !focused {
                            applyTextFieldValue()
                        }
                    }

                Text("x")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    #if os(iOS)
    private var speedSheet: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Spacer()
                speedPickerContent
                    .padding(.horizontal, 16)

                HStack(spacing: 24) {
                    Button(action: {
                        let newRate = max(0.5, sliderValue - 0.05)
                        sliderValue = snapToIncrement(newRate)
                        textFieldValue = formatRate(sliderValue)
                        onRateChange(sliderValue)
                    }) {
                        Image(systemName: "minus.circle.fill")
                            .font(.title)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)

                    Button(action: {
                        let newRate = min(10.0, sliderValue + 0.05)
                        sliderValue = snapToIncrement(newRate)
                        textFieldValue = formatRate(sliderValue)
                        onRateChange(sliderValue)
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .navigationTitle("Playback Speed")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        applyTextFieldValue()
                        showSpeedPicker = false
                    }
                }
            }
        }
        .presentationDetents([.height(180)])
    }
    #endif

    private func snapToIncrement(_ value: Double) -> Double {
        (value * 20).rounded() / 20
    }

    private func formatRate(_ rate: Double) -> String {
        if rate == rate.rounded() {
            return String(format: "%.1f", rate)
        }
        let formatted = String(format: "%.2f", rate)
        if formatted.hasSuffix("0") {
            return String(format: "%.1f", rate)
        }
        return formatted
    }

    private func applyTextFieldValue() {
        if let rate = Double(textFieldValue) {
            let clampedRate = min(max(rate, 0.5), 10.0)
            textFieldValue = formatRate(clampedRate)
            onRateChange(clampedRate)
        } else {
            textFieldValue = formatRate(sliderValue)
        }
    }

    private var playbackRateDescription: String {
        let formatted = String(format: "%.2fx", currentRate)
        if formatted.hasSuffix("0x") {
            return String(format: "%.1fx", currentRate)
        }
        return formatted
    }
}

#endif
