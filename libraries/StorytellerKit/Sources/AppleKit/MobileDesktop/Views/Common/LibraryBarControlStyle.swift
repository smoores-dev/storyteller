#if os(macOS)
import SwiftUI

extension View {
    func libraryBarButton() -> some View {
        self
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .font(.body)
            .tint(nil)
    }

    func libraryBarMenu() -> some View {
        self
            .menuStyle(.button)
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .font(.body)
            .tint(nil)
            .fixedSize()
    }
}

enum LibraryBarIcon {
    static let viewOptions = "slider.horizontal.3"
}
#endif
