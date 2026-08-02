#if os(iOS) || os(macOS)
import SwiftUI

public struct ThinCircularProgressViewStyle: ProgressViewStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        ThinCircularProgressBody(configuration: configuration)
    }

    private struct ThinCircularProgressBody: View {
        let configuration: Configuration
        @State private var rotation: Double = 0
        @State private var animating = false

        private let lineWidth: CGFloat = 1.3

        var body: some View {
            Group {
                if let fraction = configuration.fractionCompleted {
                    Circle()
                        .trim(from: 0, to: max(0.02, CGFloat(fraction)))
                        .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                } else {
                    Circle()
                        .trim(from: 0, to: 0.55)
                        .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                        .rotationEffect(.degrees(rotation))
                        .onAppear { startAnimating() }
                        .onDisappear { stopAnimating() }
                }
            }
            .frame(width: 12, height: 12)
            .foregroundStyle(.secondary)
        }

        private func startAnimating() {
            guard !animating else { return }
            animating = true
            withAnimation(Animation.linear(duration: 0.8).repeatForever(autoreverses: false)) {
                rotation = 360
            }
        }

        private func stopAnimating() {
            animating = false
            rotation = 0
        }
    }
}

#endif
