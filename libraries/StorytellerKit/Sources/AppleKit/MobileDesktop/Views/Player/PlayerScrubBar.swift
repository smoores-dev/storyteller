#if os(iOS) || os(macOS)
import SwiftUI

struct PlayerScrubBar: View {
    @Binding var value: Double
    let tint: Color
    var onEditingChanged: (Bool) -> Void = { _ in }

    @State private var isDragging = false

    private let trackHeight: CGFloat = 4
    private let thumbDiameter: CGFloat = 14

    var body: some View {
        GeometryReader { proxy in
            let usable = max(proxy.size.width - thumbDiameter, 1)
            let fraction = min(max(value, 0), 1)
            let thumbCenter = thumbDiameter / 2 + usable * fraction

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(tint.opacity(0.25))
                    .frame(height: trackHeight)
                Capsule()
                    .fill(tint)
                    .frame(width: thumbCenter, height: trackHeight)
                Circle()
                    .fill(tint)
                    .frame(width: thumbDiameter, height: thumbDiameter)
                    .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
                    .offset(x: thumbCenter - thumbDiameter / 2)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        if !isDragging {
                            isDragging = true
                            onEditingChanged(true)
                        }
                        value = position(of: drag.location.x, usable: usable)
                    }
                    .onEnded { drag in
                        value = position(of: drag.location.x, usable: usable)
                        isDragging = false
                        onEditingChanged(false)
                    }
            )
        }
        .frame(height: 20)
    }

    private func position(of x: CGFloat, usable: CGFloat) -> Double {
        Double(min(max((x - thumbDiameter / 2) / usable, 0), 1))
    }
}
#endif
