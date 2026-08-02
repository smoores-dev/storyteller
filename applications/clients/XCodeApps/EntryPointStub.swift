import StorytellerAppleKit

#if os(macOS)
import StorytellerContentServer
#endif
#if os(iOS) || os(macOS)
import StorytellerReadaloud
#endif

/// Keep code out of the Xcode project, because LSP can't complete here.
@main
class EntryPointStub {
    static func main() {
        #if os(macOS)
        macAppEntryPoint(
            environment: StorytellerEnvironment(
                contentServer: ContentServer(),
                readaloudAligner: ReadaloudEngine(),
                showStorytellerLockup: true,
            )
        )
        #elseif os(iOS)
        iosAppEntryPoint(
            environment: StorytellerEnvironment(readaloudAligner: ReadaloudEngine())
        )
        #elseif os(watchOS)
        watchAppEntryPoint()
        #elseif os(tvOS)
        tvAppEntryPoint()
        #endif
    }
}
