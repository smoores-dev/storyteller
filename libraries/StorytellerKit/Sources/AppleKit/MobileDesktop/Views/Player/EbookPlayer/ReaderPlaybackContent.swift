#if os(iOS) || os(macOS)
import SwiftUI

/// Evaluates playback content in a separate SwiftUI observation scope.
/// Clock updates invalidate this content independently of the containing reader.
struct ReaderPlaybackContent<Content: View>: View {
    private let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View { content() }
}
#endif
