import StorytellerKit
import SwiftUI

extension HighlightColor {
    // Static fallback hue used only when a configured hex string fails to parse.
    public var color: Color {
        switch self {
            case .pink: return Color(red: 0.886, green: 0.369, blue: 0.639)
            case .orange: return Color(red: 0.808, green: 0.549, blue: 0.290)
            case .yellow: return Color(red: 0.710, green: 0.722, blue: 0.243)
            case .green: return Color(red: 0.098, green: 0.529, blue: 0.267)
            case .blue: return Color(red: 0.306, green: 0.565, blue: 0.780)
            case .purple: return Color(red: 0.702, green: 0.400, blue: 1.0)
        }
    }
}
