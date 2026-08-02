import Foundation

#if os(iOS) || os(watchOS) || os(tvOS)
import MediaPlayer
#endif

#if os(iOS)
import UIKit
#endif

@MainActor
public final class MediaNowPlayingPresenter: NowPlayingPresenting {
    #if os(iOS)
    private var cachedArtworkData: Data?
    private var cachedArtwork: MPMediaItemArtwork?
    #endif

    public nonisolated init() {}

    #if os(iOS) || os(watchOS) || os(tvOS)
    public func update(_ info: NowPlayingInfo) {
        var nowPlayingInfo = [String: Any]()

        nowPlayingInfo[MPMediaItemPropertyTitle] = info.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = info.artist ?? ""
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = info.albumTitle ?? ""
        if let duration = info.duration {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        }
        if let elapsedTime = info.elapsedTime {
            nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsedTime
        }
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] =
            info.isPlaying ? info.playbackRate : 0.0

        #if os(iOS)
        if let artwork = artwork(for: info.artwork) {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
        }
        #endif

        let center = MPNowPlayingInfoCenter.default()
        center.nowPlayingInfo = nowPlayingInfo
        center.playbackState = info.isPlaying ? .playing : .paused
    }

    public func clear() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    public func configureCommands(
        skipForwardInterval: TimeInterval,
        skipBackwardInterval: TimeInterval,
        supportsChangePlaybackPosition: Bool,
        supportsChangePlaybackRate: Bool,
        handler: @escaping @Sendable (RemoteCommand) -> Void,
    ) {
        let commandCenter = MPRemoteCommandCenter.shared()

        removeAllTargets(from: commandCenter)

        commandCenter.nextTrackCommand.isEnabled = false
        commandCenter.previousTrackCommand.isEnabled = false

        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { _ in
            handler(.play)
            return .success
        }

        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { _ in
            handler(.pause)
            return .success
        }

        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { _ in
            handler(.togglePlayPause)
            return .success
        }

        commandCenter.skipForwardCommand.isEnabled = true
        commandCenter.skipForwardCommand.preferredIntervals = [
            NSNumber(value: skipForwardInterval)
        ]
        commandCenter.skipForwardCommand.addTarget { _ in
            handler(.skipForward(skipForwardInterval))
            return .success
        }

        commandCenter.skipBackwardCommand.isEnabled = true
        commandCenter.skipBackwardCommand.preferredIntervals = [
            NSNumber(value: skipBackwardInterval)
        ]
        commandCenter.skipBackwardCommand.addTarget { _ in
            handler(.skipBackward(skipBackwardInterval))
            return .success
        }

        commandCenter.changePlaybackPositionCommand.isEnabled = supportsChangePlaybackPosition
        if supportsChangePlaybackPosition {
            commandCenter.changePlaybackPositionCommand.addTarget { event in
                guard let positionEvent = event as? MPChangePlaybackPositionCommandEvent else {
                    return .commandFailed
                }
                handler(.changePlaybackPosition(positionEvent.positionTime))
                return .success
            }
        }

        commandCenter.changePlaybackRateCommand.isEnabled = supportsChangePlaybackRate
        if supportsChangePlaybackRate {
            commandCenter.changePlaybackRateCommand.addTarget { event in
                guard let rateEvent = event as? MPChangePlaybackRateCommandEvent else {
                    return .commandFailed
                }
                handler(.changePlaybackRate(Double(rateEvent.playbackRate)))
                return .success
            }
        }

        debugLog("[MediaNowPlayingPresenter] Remote commands configured")
    }

    public func teardownCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        removeAllTargets(from: commandCenter)

        commandCenter.nextTrackCommand.isEnabled = true
        commandCenter.previousTrackCommand.isEnabled = true
    }

    private func removeAllTargets(from commandCenter: MPRemoteCommandCenter) {
        commandCenter.playCommand.removeTarget(nil)
        commandCenter.pauseCommand.removeTarget(nil)
        commandCenter.togglePlayPauseCommand.removeTarget(nil)
        commandCenter.skipForwardCommand.removeTarget(nil)
        commandCenter.skipBackwardCommand.removeTarget(nil)
        commandCenter.changePlaybackPositionCommand.removeTarget(nil)
        commandCenter.changePlaybackRateCommand.removeTarget(nil)
        commandCenter.nextTrackCommand.removeTarget(nil)
        commandCenter.previousTrackCommand.removeTarget(nil)
    }

    #if os(iOS)
    private func artwork(for data: Data?) -> MPMediaItemArtwork? {
        guard let data else {
            cachedArtworkData = nil
            cachedArtwork = nil
            return nil
        }

        if data == cachedArtworkData, let cachedArtwork {
            return cachedArtwork
        }

        guard let image = UIImage(data: data) else { return nil }
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
        cachedArtworkData = data
        cachedArtwork = artwork
        return artwork
    }
    #endif
    #else
    public func update(_ info: NowPlayingInfo) {}

    public func clear() {}

    public func configureCommands(
        skipForwardInterval: TimeInterval,
        skipBackwardInterval: TimeInterval,
        supportsChangePlaybackPosition: Bool,
        supportsChangePlaybackRate: Bool,
        handler: @escaping @Sendable (RemoteCommand) -> Void,
    ) {}

    public func teardownCommands() {}
    #endif
}
