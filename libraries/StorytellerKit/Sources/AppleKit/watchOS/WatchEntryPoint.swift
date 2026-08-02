#if os(watchOS)
import StorytellerKit
import SwiftUI

/// Public entry point that the XCode project can call.
@MainActor
public func watchAppEntryPoint(environment: StorytellerEnvironment = StorytellerEnvironment()) {
    bootstrapApplePlatformDefaultsIfNeeded()
    AppLaunchContext.environment = environment
    StorytellerWatchApp.main()
}
#endif
