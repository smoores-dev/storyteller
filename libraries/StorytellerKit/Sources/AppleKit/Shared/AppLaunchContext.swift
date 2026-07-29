import StorytellerKit

/// Hands the environment across the App.main() boundary: @main App structs are
/// instantiated by SwiftUI, so entry points park the injected value here.
public enum AppLaunchContext {
    @MainActor public static var environment = StorytellerEnvironment()
}
