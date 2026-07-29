#if os(macOS)
import StorytellerKit
import SwiftUI

/// Public entry point that the XCode project can call.
@MainActor
public func macAppEntryPoint(environment: StorytellerEnvironment = StorytellerEnvironment()) {
    bootstrapApplePlatformDefaultsIfNeeded()
    AppLaunchContext.environment = environment
    StorytellerReaderApp.main()
}

#endif
