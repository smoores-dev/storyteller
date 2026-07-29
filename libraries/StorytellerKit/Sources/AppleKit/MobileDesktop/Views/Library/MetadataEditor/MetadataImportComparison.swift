#if os(iOS) || os(macOS)
import SwiftUI

/// Wrapping row layout for tag pills in the import comparison table.
struct PillFlowLayout: Layout {
    var horizontalSpacing: CGFloat = 6
    var verticalSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout (),
    ) {
        let arrangement = arrange(
            proposal: ProposedViewSize(width: bounds.width, height: proposal.height),
            subviews: subviews,
        )
        for item in arrangement.items {
            subviews[item.index].place(
                at: CGPoint(x: bounds.minX + item.origin.x, y: bounds.minY + item.origin.y),
                proposal: ProposedViewSize(item.size),
            )
        }
    }

    private func arrange(
        proposal: ProposedViewSize,
        subviews: Subviews,
    ) -> (items: [(index: Int, origin: CGPoint, size: CGSize)], size: CGSize) {
        let maxWidth = max(proposal.width ?? 0, 0)
        var origin = CGPoint.zero
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        var items: [(index: Int, origin: CGPoint, size: CGSize)] = []

        for index in subviews.indices {
            let ideal = subviews[index].sizeThatFits(.unspecified)
            let size = CGSize(
                width: maxWidth > 0 ? min(ideal.width, maxWidth) : ideal.width,
                height: ideal.height,
            )
            if origin.x > 0, maxWidth > 0, origin.x + size.width > maxWidth {
                origin.x = 0
                origin.y += rowHeight + verticalSpacing
                rowHeight = 0
            }
            items.append((index: index, origin: origin, size: size))
            usedWidth = max(usedWidth, origin.x + size.width)
            origin.x += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }

        return (
            items,
            CGSize(width: maxWidth > 0 ? maxWidth : usedWidth, height: origin.y + rowHeight),
        )
    }
}

extension View {
    func metadataImportTagPill(isSelected: Bool) -> some View {
        self
            .font(.caption)
            .foregroundStyle(isSelected ? Color.white : Color.primary)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background {
                Capsule()
                    .fill(
                        isSelected ? Color.accentColor.opacity(0.88) : Color.secondary.opacity(0.10)
                    )
            }
            .overlay {
                Capsule()
                    .stroke(
                        isSelected ? Color.white.opacity(0.35) : Color.secondary.opacity(0.28),
                        lineWidth: isSelected ? 1.0 : 0.75,
                    )
            }
    }
}
#endif
