#if os(iOS) || os(macOS) || os(tvOS)
import SwiftUI

struct RatingStarStrip: View {
    let value: Double?
    var starSize: CGFloat = 15
    var spacing: CGFloat = 4
    let fillColor: Color
    let emptyColor: Color

    private var snapped: Double {
        PersonalRatingLogic.snapToHalf(value ?? 0)
    }

    var body: some View {
        HStack(spacing: spacing) {
            ForEach(0..<5, id: \.self) { index in
                Self.glyph(for: index, value: snapped)
                    .font(.system(size: starSize))
                    .foregroundStyle(snapped > Double(index) ? fillColor : emptyColor)
            }
        }
    }

    static func glyph(for index: Int, value: Double) -> Image {
        let starValue = Double(index) + 1
        if value >= starValue {
            return Image(systemName: "star.fill")
        } else if value >= starValue - 0.5 {
            return Image(systemName: "star.leadinghalf.filled")
        } else {
            return Image(systemName: "star")
        }
    }
}

#endif
