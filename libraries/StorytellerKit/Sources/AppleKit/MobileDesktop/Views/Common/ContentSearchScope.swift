#if os(macOS)
import SwiftUI

private struct ContentSearchTextKey: EnvironmentKey {
    static let defaultValue: Binding<String> = .constant("")
}

private struct ContentSearchFocusKey: EnvironmentKey {
    static let defaultValue: Binding<Bool> = .constant(false)
}

extension EnvironmentValues {
    var contentSearchText: Binding<String> {
        get { self[ContentSearchTextKey.self] }
        set { self[ContentSearchTextKey.self] = newValue }
    }

    var contentSearchFocus: Binding<Bool> {
        get { self[ContentSearchFocusKey.self] }
        set { self[ContentSearchFocusKey.self] = newValue }
    }
}
#endif
