import Foundation
import StorytellerKit

@MainActor
public func bootstrapLinuxPlatformDefaultsIfNeeded() {
    guard !StorytellerPlatform.isBootstrapped else { return }
    #if canImport(CMpv)
    StorytellerPlatform.bootstrap(
        audioPlayerFactory: MpvAudioPlayerFactory(),
        folderWatcher: PollingFolderWatcher(),
    )
    #else
    StorytellerPlatform.bootstrap(folderWatcher: PollingFolderWatcher())
    #endif
}
