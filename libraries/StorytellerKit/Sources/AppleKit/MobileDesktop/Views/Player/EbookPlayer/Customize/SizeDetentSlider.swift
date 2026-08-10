#if os(iOS)
import SwiftUI

struct SizeDetentSlider: View {
    @Binding var size: MiniPlayerSize

    private let order: [MiniPlayerSize] = [.large, .regular, .compact]

    private func label(for size: MiniPlayerSize) -> String {
        switch size {
            case .compact: return "S"
            case .regular: return "M"
            case .large: return "L"
        }
    }

    var body: some View {
        GeometryReader { geo in
            let height = max(geo.size.height - 24, 1)
            let step = height / CGFloat(order.count - 1)

            ZStack(alignment: .top) {
                Capsule()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(width: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)

                ForEach(Array(order.enumerated()), id: \.offset) { index, detent in
                    let y = 12 + step * CGFloat(index)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(
                                detent == size
                                    ? Color.accentColor : Color.secondary.opacity(0.4)
                            )
                            .frame(width: 10, height: 10)
                        Text(label(for: detent))
                            .font(.caption2.weight(detent == size ? .bold : .regular))
                            .foregroundStyle(detent == size ? .primary : .secondary)
                    }
                    .position(x: geo.size.width / 2 + 8, y: y)
                    .onTapGesture { select(detent) }
                }

                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 22, height: 22)
                    .shadow(radius: 2)
                    .position(
                        x: geo.size.width / 2 - 8,
                        y: 12 + step * CGFloat(order.firstIndex(of: size) ?? 2),
                    )
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: size)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let y = min(max(value.location.y - 12, 0), height)
                        let index = Int((y / step).rounded())
                        let clamped = min(max(index, 0), order.count - 1)
                        select(order[clamped])
                    }
            )
        }
        .frame(width: 56)
    }

    private func select(_ detent: MiniPlayerSize) {
        guard detent != size else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        size = detent
    }
}
#endif
