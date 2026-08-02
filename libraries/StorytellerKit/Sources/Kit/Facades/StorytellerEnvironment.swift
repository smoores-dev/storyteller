import Foundation
import Observation

/// Injection point for optional/heavy capabilities. App shells construct one at
/// launch, fill in the providers their platform links, and hand it to the entry
/// point; consuming UI renders a feature only when its provider is non-nil.
@Observable
@MainActor
public final class StorytellerEnvironment {
    public var contentServer: (any ContentServerControlling)?
    public var readaloudAligner: (any ReadaloudAligning)?
    /// Shows the Storyteller logo/wordmark lockup in the sidebar header.
    /// Off in Storyteller's own shells; Storyteller's apps opt in.
    public var showStorytellerLockup: Bool

    public init(
        contentServer: (any ContentServerControlling)? = nil,
        readaloudAligner: (any ReadaloudAligning)? = nil,
        showStorytellerLockup: Bool = false,
    ) {
        self.contentServer = contentServer
        self.readaloudAligner = readaloudAligner
        self.showStorytellerLockup = showStorytellerLockup
    }
}
