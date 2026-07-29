import Foundation

/// Set-once holder for platform service implementations, populated by the app
/// shell at launch. Distinct from StorytellerEnvironment: that is MainActor UI
/// state for optional features; this is what nonisolated singleton actors read
/// for platform services. A missing provider degrades the capability (no audio
/// playback, keychain reports unsupportedPlatform, default font traits).
public enum StorytellerPlatform {
    // nonisolated(unsafe) is sound here: bootstrap() runs once at launch
    // before any concurrent reader exists, and the values never change after.
    public private(set) nonisolated(unsafe) static var audioPlayerFactory: (any AudioPlayerFactory)?
    public private(set) nonisolated(unsafe) static var nowPlaying: (any NowPlayingPresenting)?
    public private(set) nonisolated(unsafe) static var audioMetadata: (any AudioMetadataProbing)?
    public private(set) nonisolated(unsafe) static var keychain: (any KeychainStoring)?
    public private(set) nonisolated(unsafe) static var fontMetadata: (any FontMetadataProbing)?
    public private(set) nonisolated(unsafe) static var folderWatcher: (any FolderWatching)?
    public private(set) nonisolated(unsafe) static var applicationStorage:
        (any ApplicationStorageProviding)?
    public private(set) nonisolated(unsafe) static var liveSyncDiscovery:
        (any LiveSyncPeerDiscovering)?
    /// True once bootstrap has run. Entry points use this to install platform
    /// defaults only when the app shell has not already chosen its own.
    public private(set) nonisolated(unsafe) static var isBootstrapped = false

    public static func bootstrap(
        audioPlayerFactory: (any AudioPlayerFactory)? = nil,
        nowPlaying: (any NowPlayingPresenting)? = nil,
        audioMetadata: (any AudioMetadataProbing)? = nil,
        keychain: (any KeychainStoring)? = nil,
        fontMetadata: (any FontMetadataProbing)? = nil,
        folderWatcher: (any FolderWatching)? = nil,
        applicationStorage: (any ApplicationStorageProviding)? = nil,
        liveSyncDiscovery: (any LiveSyncPeerDiscovering)? = nil,
    ) {
        Self.audioPlayerFactory = audioPlayerFactory
        Self.nowPlaying = nowPlaying
        Self.audioMetadata = audioMetadata
        Self.keychain = keychain
        Self.fontMetadata = fontMetadata
        Self.folderWatcher = folderWatcher
        Self.applicationStorage = applicationStorage
        Self.liveSyncDiscovery = liveSyncDiscovery
        Self.isBootstrapped = true
    }
}
