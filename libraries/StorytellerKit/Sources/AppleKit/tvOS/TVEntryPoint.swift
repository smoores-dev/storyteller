#if os(tvOS)
import StorytellerKit
import SwiftUI

/// Public entry point that the XCode project can call.
@MainActor
public func tvAppEntryPoint(environment: StorytellerEnvironment = StorytellerEnvironment()) {
    bootstrapApplePlatformDefaultsIfNeeded()
    AppLaunchContext.environment = environment
    StorytellerTVApp.main()
}
#endif
