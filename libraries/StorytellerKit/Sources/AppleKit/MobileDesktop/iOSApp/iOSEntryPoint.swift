#if os(iOS)
import StorytellerKit
import SwiftUI

/// Public entry point that the XCode project can call.
@MainActor
public func iosAppEntryPoint(environment: StorytellerEnvironment = StorytellerEnvironment()) {
    bootstrapApplePlatformDefaultsIfNeeded()
    AppLaunchContext.environment = environment
    StorytellerReaderApp.main()
}
#endif
