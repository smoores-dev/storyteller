#if os(iOS) || os(macOS)
import SwiftUI

struct EditorialEyebrow: View {
    let text: String
    var icon: String? = nil
    var prominent = false

    init(_ text: String, icon: String? = nil, prominent: Bool = false) {
        self.text = text
        self.icon = icon
        self.prominent = prominent
    }

    var body: some View {
        HStack(spacing: 6) {
            if let icon {
                Image(systemName: icon)
                    .font(prominent ? .subheadline : .caption)
            }
            Text(text.uppercased())
                .font(prominent ? .footnote.weight(.medium) : .caption2.weight(.medium))
                .kerning(2)
        }
    }
}

extension Font {
    static func editorialTitle(_ size: CGFloat) -> Font {
        .system(size: size, weight: .medium, design: .serif)
    }
}
#endif
