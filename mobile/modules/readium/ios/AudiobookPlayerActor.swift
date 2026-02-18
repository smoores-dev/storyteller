//
//  AudiobookPlayer.swift
//  Pods
//
//  Created by Shane Friedman on 1/14/26.
//

import Foundation
import ReadiumShared
import AVFoundation
import MediaPlayer

class Track {
    let uri: FileURL
    let bookUuid: String
    let title: String
    let duration: Double
    let bookTitle: String
    let author: String?
    let coverUri: FileURL?
    let relativeUri: RelativeURL
    let narrator: String?
    let mimeType: String

    init(uri: FileURL, bookUuid: String, title: String, duration: Double, bookTitle: String, author: String?, coverUri: FileURL?, relativeUri: RelativeURL, narrator: String?, mimeType: String) {
        self.uri = uri
        self.bookUuid = bookUuid
        self.title = title
        self.duration = duration
        self.bookTitle = bookTitle
        self.author = author
        self.coverUri = coverUri
        self.relativeUri = relativeUri
        self.narrator = narrator
        self.mimeType = mimeType
    }

    func toJson() -> [String:Any?] {
        return [
            "bookUuid": bookUuid,
            "uri": uri.string,
            "title": title,
            "duration": duration,
            "bookTitle": bookTitle,
            "author": author,
            "coverUri": coverUri?.string,
            "relativeUri": relativeUri.string,
            "narrator": narrator,
            "mimeType": mimeType
        ]
    }

    static func fromJson(json: [String:Any?]) -> Track {
        return Track(uri: FileURL(string: json["uri"] as! String)!,
                     bookUuid: json["bookUuid"] as! String,
                     title: json["title"] as! String,
                     duration: json["duration"] as! Double,
                     bookTitle: json["bookTitle"] as! String,
                     author: json["author"] as? String,
                     coverUri: (json["coverUri"] as? String).flatMap { FileURL(string: $0) },
                     relativeUri: RelativeURL(epubHREF: json["relativeUri"] as! String)!,
                     narrator: json["narrator"] as? String,
                     mimeType: json["mimeType"] as! String)
    }
}

public typealias ClipChangedCallback = (_ clip: OverlayPar) -> Void
typealias DuckCallback = () -> Void
typealias TrackChangedCallback = (_ track: Track, _ position: Double) -> Void
typealias PositionChangedCallback = (_ position: Double) -> Void
typealias IsPlayingChangedCallback = (_ isPlaying: Bool) -> Void

let interruptionInterval = TimeInterval(integerLiteral: 5 * 60)

@globalActor
public actor AudiobookPlayerActor {
    private let bookService: BookService
    private var player: AVPlayer = AVPlayer()
    private var currentIndex = 0
    private var playbackRate = 1.0
    private var tracks: [Track] = [Track]()
    private var bookUuid: String?
    private var relativeUriToIndex: [String:Int] = [:]
    private var relativeUriToClips: [String:[OverlayPar]] = [:]
    private var observers: [Any] = [Any]()

    private var interruptionObserver: Any?
    private var routeChangeNotificationObserver: Any?
    private var itemObserver: NSKeyValueObservation?
    private var rateObserver: NSKeyValueObservation?
    private var statusObserver: NSKeyValueObservation?
    private var isPlayingObserver: NSKeyValueObservation?
    private var playToEndObserver: Any?
    private var positionChangeObserver: Any?

    private var automaticRewind = false
    private var afterInterruptionRewind = 0.0
    private var afterBreakRewind = 0.0
    private var lastPaused: Date?
    private var headphonesConnected = hasHeadphones(in: AVAudioSession.sharedInstance().currentRoute)

    private var clipChangedCallbacks: [ClipChangedCallback] = [ClipChangedCallback]()
    private var duckCallbacks: [DuckCallback] = [DuckCallback]()
    private var trackChangedCallbacks: [TrackChangedCallback] = [TrackChangedCallback]()
    private var positionChangedCallbacks: [PositionChangedCallback] = [PositionChangedCallback]()
    private var isPlayingChangedCallbacks: [IsPlayingChangedCallback] = [IsPlayingChangedCallback]()

    private var currentImageTask: URLSessionDataTask?

    public static let shared = AudiobookPlayerActor(bookService: BookService.shared)

    init(bookService: BookService) {
        self.bookService = bookService

        let remoteCommandCenter = MPRemoteCommandCenter.shared()

        remoteCommandCenter.pauseCommand.removeTarget(nil)
        remoteCommandCenter.playCommand.removeTarget(nil)
        remoteCommandCenter.togglePlayPauseCommand.removeTarget(nil)
        remoteCommandCenter.nextTrackCommand.removeTarget(nil)
        remoteCommandCenter.previousTrackCommand.removeTarget(nil)
        remoteCommandCenter.skipForwardCommand.removeTarget(nil)
        remoteCommandCenter.changePlaybackPositionCommand.removeTarget(nil)

        remoteCommandCenter.pauseCommand.isEnabled = true
        remoteCommandCenter.playCommand.isEnabled = true
        remoteCommandCenter.togglePlayPauseCommand.isEnabled = true
        remoteCommandCenter.nextTrackCommand.isEnabled = true
        remoteCommandCenter.previousTrackCommand.isEnabled = true
        remoteCommandCenter.skipForwardCommand.isEnabled = true
        remoteCommandCenter.changePlaybackPositionCommand.isEnabled = true


        remoteCommandCenter.pauseCommand.addTarget { event in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.pause()
            }
            return .success
        }

        remoteCommandCenter.playCommand.addTarget { event in
            Task { @AudiobookPlayerActor in
                if await AudiobookPlayerActor.shared.player.timeControlStatus == .playing {
                    await AudiobookPlayerActor.shared.pause()
                } else {
                    await AudiobookPlayerActor.shared.play(automaticRewind: true)
                }
            }

            return .success
        }

        remoteCommandCenter.togglePlayPauseCommand.addTarget { event in
            Task { @AudiobookPlayerActor in
                if await AudiobookPlayerActor.shared.player.timeControlStatus == .playing {
                    await AudiobookPlayerActor.shared.pause()
                } else {
                    await AudiobookPlayerActor.shared.play(automaticRewind: true)
                }
            }

            return .success
        }

        remoteCommandCenter.nextTrackCommand.addTarget { event in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.next()
            }
            return .success
        }

        remoteCommandCenter.previousTrackCommand.addTarget { event in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.prev()
            }

            return .success
        }

        remoteCommandCenter.skipForwardCommand.addTarget { event in
            guard let event = event as? MPSkipIntervalCommandEvent else { return .commandFailed }
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.seekBy(amount: event.interval, bounded: false)
            }
            return .success
        }

        remoteCommandCenter.skipBackwardCommand.addTarget { event in
            guard let event = event as? MPSkipIntervalCommandEvent else { return .commandFailed }
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.seekBy(amount: -event.interval, bounded: false)
            }
            return .success
        }

        remoteCommandCenter.changePlaybackPositionCommand.addTarget { event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }

            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.skip(to: event.positionTime)
            }

            return .success
        }
    }

    func loadTracks(tracks: [Track]) throws {
        unload()

        guard let firstTrack = tracks.first else {
            return
        }

        self.tracks = tracks
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playback, mode: .spokenAudio)
        try audioSession.setActive(true)
        interruptionObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: audioSession, queue: .main) {
            notification in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.handleAudioSessionInterruption(notification: notification)
            }
        }

        routeChangeNotificationObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: audioSession, queue: .main) {
            notification in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.handleRouteChange(notification: notification)
            }
        }

        bookUuid = firstTrack.bookUuid

        let clips = try bookService.getOverlayClips(for: firstTrack.bookUuid)

        relativeUriToClips.removeAll()
        clips.forEach { clip in
            var trackClips = relativeUriToClips[clip.relativeUrl.absoluteString] ?? [OverlayPar]()
            trackClips.append(clip)
            relativeUriToClips[clip.relativeUrl.absoluteString] = trackClips
        }

        relativeUriToIndex.removeAll()
        tracks.enumerated().forEach { index, track in
            relativeUriToIndex[track.relativeUri.string] = index
        }

        let nowPlayingInfoCenter = MPNowPlayingInfoCenter.default()
        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
        nowPlayingInfoCenter.nowPlayingInfo = nowPlayingInfo
    }

    func getIsPlaying() -> Bool {
        return player.timeControlStatus == .playing
    }

    func getPosition() -> Double {
        return player.currentTime().seconds
    }

    func getCurrentTrack() -> Track? {
        if currentIndex > tracks.count - 1 {
            return nil
        }
        return tracks[currentIndex]
    }

    func getCurrentClip() -> OverlayPar? {
        guard let track = getCurrentTrack() else {
            return nil
        }

        guard let clips = relativeUriToClips[track.relativeUri.string] else {
            return nil
        }

        return searchForClip(clips: clips, position: getPosition())
    }

    func getTracks() -> [Track] {
        return tracks
    }

    private func emitClipChange(relativeUri: RelativeURL, positionSeconds: Double) {
        guard let trackClips = relativeUriToClips[relativeUri.string] else {
            return
        }

        guard let clip = searchForClip(clips: trackClips, position: positionSeconds) else {
            return
        }

        clipChangedCallbacks.forEach {
            $0(clip)
        }
    }

    func play(automaticRewind: Bool) async {
        guard automaticRewind && self.automaticRewind else {
            player.play()
            player.rate = Float(playbackRate)
            return
        }
        if lastPaused.flatMap({ $0.addingTimeInterval(interruptionInterval) > Date() }) ?? false {
            await seekBy(amount: -afterInterruptionRewind, bounded: true)
        } else {
            await seekBy(amount: -afterBreakRewind, bounded: true)
        }
        player.play()
        player.rate = Float(playbackRate)

        guard let track = getCurrentTrack() else { return }
        let position = getPosition()

        emitClipChange(relativeUri: track.relativeUri, positionSeconds: position)
    }

    func pause() {
        player.pause()
    }

    func skip(to position: Double) async {
        await player.seek(to: CMTime(seconds: position, preferredTimescale: 1))

        guard let track = getCurrentTrack() else { return }
        let position = getPosition()

        emitClipChange(relativeUri: track.relativeUri, positionSeconds: position)
    }

    func seekBy(amount: Double, bounded: Bool) async {
        let endPosition = getPosition() + amount
        let currentTrack = tracks[currentIndex]

        if endPosition < 0.0 {
            if currentIndex == 0 || bounded {
                await player.seek(to: CMTime(seconds: 0, preferredTimescale: 1))
            } else {
                let seekToIndex = currentIndex - 1
                let seekToTrack = tracks[seekToIndex]
                await loadTrack(index: seekToIndex, position: seekToTrack.duration + endPosition)
            }
        } else if endPosition >= currentTrack.duration {
            if currentIndex == tracks.count - 1 || bounded {
                await player.seek(to: CMTime(seconds: currentTrack.duration, preferredTimescale: 1))
            } else {
                await loadTrack(index: currentIndex + 1, position: endPosition - currentTrack.duration)
            }
        } else {
            await player.seek(to: CMTime(seconds: endPosition, preferredTimescale: 1))
        }

        guard let track = getCurrentTrack() else { return }
        let position = getPosition()

        emitClipChange(relativeUri: track.relativeUri, positionSeconds: position)
    }

    func seekTo(relativeUri: String, position: Double, skipEmit: Bool) async {
        // try direct lookup first, then normalize via RelativeURL for
        // cases where the incoming uri is raw (e.g. from manifest href)
        let seekToIndex = relativeUriToIndex[relativeUri]
            ?? RelativeURL(epubHREF: relativeUri).flatMap { relativeUriToIndex[$0.string] }

        guard let seekToIndex else {
            return
        }

        if seekToIndex == currentIndex && player.currentItem != nil {
            await player.seek(to: CMTime(seconds: position, preferredTimescale: 1))
        } else {
            await loadTrack(index: seekToIndex, position: position)
        }

        if !skipEmit {
            emitClipChange(relativeUri: tracks[seekToIndex].relativeUri, positionSeconds: position)
        }
    }

    func next() async {
        if currentIndex == tracks.count - 1 { return }
        await loadTrack(index: currentIndex + 1, position: 0.0)

        guard let track = getCurrentTrack() else { return }
        let position = getPosition()

        emitClipChange(relativeUri: track.relativeUri, positionSeconds: position)
    }

    func prev() async {
        if currentIndex == 0 { return }
        await loadTrack(index: currentIndex - 1, position: 0.0)

        guard let track = getCurrentTrack() else { return }
        let position = getPosition()

        emitClipChange(relativeUri: track.relativeUri, positionSeconds: position)
    }

    func setRate(rate: Double) {
        if player.timeControlStatus == .playing {
            player.rate = Float(rate)
        }

        playbackRate = rate

        updateElapsedTime()
    }

    func setAutomaticRewind(enabled: Bool, afterInterruption: Double, afterBreak: Double) {
        self.automaticRewind = enabled
        self.afterInterruptionRewind = afterInterruption
        self.afterBreakRewind = afterBreak
    }

    func unload() {
        if let interruptionObserver = self.interruptionObserver {
            NotificationCenter.default.removeObserver(interruptionObserver)
        }

        observers.forEach {
            player.removeTimeObserver($0)
        }

        observers.removeAll()
        relativeUriToClips.removeAll()
        relativeUriToIndex.removeAll()

        tracks = [Track]()

        itemObserver = nil
        rateObserver = nil
        statusObserver = nil
        isPlayingObserver = nil
    }

    private func loadTrack(index: Int, position: Double, shouldContinuePlaying: Bool? = nil) async {
        let isPlaying = shouldContinuePlaying ?? (player.timeControlStatus == .playing)

        observers.forEach {
            player.removeTimeObserver($0)
        }

        observers.removeAll()

        if let playToEndObserver = self.playToEndObserver {
            NotificationCenter.default.removeObserver(playToEndObserver)
        }
        if let positionChangeObserver = self.positionChangeObserver {
            player.removeTimeObserver(positionChangeObserver)
        }

        currentIndex = index

        let track = tracks[index]

        let playerItem = AVPlayerItem(url: track.uri.url)
        playerItem.audioTimePitchAlgorithm = .timeDomain

        self.playToEndObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: playerItem,
                    queue: nil
        ) { _ in
            Task { @AudiobookPlayerActor in
                let currentIndex = await AudiobookPlayerActor.shared.currentIndex
                let tracks = await AudiobookPlayerActor.shared.tracks
                if currentIndex < tracks.count - 1 {
                    await AudiobookPlayerActor.shared.loadTrack(index: currentIndex + 1, position: 0.0, shouldContinuePlaying: true)
                }
            }
        }

        player = AVPlayer(playerItem: playerItem)
        player.rate = isPlaying ? Float(playbackRate) : 0.0

        let clips = relativeUriToClips[track.relativeUri.string] ?? [OverlayPar]()
        let times = clips.map { NSValue(time: CMTime(value: Int64($0.start * 1000), timescale: 1000)) }
        if times.count != 0 {
            observers.append(
                player.addBoundaryTimeObserver(
                    forTimes: times,
                    queue: .main
                ) {
                    Task { @AudiobookPlayerActor in
                        let currentTime = await AudiobookPlayerActor.shared.player.currentTime()
                        guard let track = await AudiobookPlayerActor.shared.getCurrentTrack() else {
                            return
                        }
                        await AudiobookPlayerActor.shared.emitClipChange(relativeUri: track.relativeUri, positionSeconds: currentTime.seconds)
                    }
                }
            )
        }

        isPlayingObserver = nil

        // Weirdly fails if set below 1?
        self.positionChangeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1.0, preferredTimescale: 1), queue: .main) { time in
            Task { @AudiobookPlayerActor in
                await AudiobookPlayerActor.shared.updateElapsedTime()
                await AudiobookPlayerActor.shared.positionChangedCallbacks.forEach {
                    $0(time.seconds)
                }
            }
        }

        await player.seek(to: CMTime(seconds: position, preferredTimescale: 1))

        currentImageTask?.cancel()

        trackChangedCallbacks.forEach {
            $0(track, position)
        }

        let nowPlayingInfoCenter = MPNowPlayingInfoCenter.default()
        var nowPlayingInfo = nowPlayingInfoCenter.nowPlayingInfo ?? [String: Any]()

        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = track.bookTitle
        nowPlayingInfo[MPMediaItemPropertyTitle] = track.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = track.author
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = track.duration
        if track.narrator != nil {
            nowPlayingInfo[MPMediaItemPropertyComposer] = track.narrator
        }
        nowPlayingInfo[MPMediaItemPropertyAlbumTrackCount] = NSNumber(value: tracks.count)
        nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
        nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = NSNumber(value: false)

        nowPlayingInfoCenter.nowPlayingInfo = nowPlayingInfo

        currentImageTask = track.coverUri.flatMap {
            URLSession.shared.dataTask(with: $0.url, completionHandler: { (data, _, error) in
                if let data = data, let image = UIImage(data: data), error == nil {
                    let artwork = MPMediaItemArtwork(boundsSize: image.size, requestHandler: { (size) -> UIImage in
                        return image
                    })
                    let nowPlayingInfoCenter = MPNowPlayingInfoCenter.default()
                    nowPlayingInfoCenter.nowPlayingInfo?[MPMediaItemPropertyArtwork] = artwork
                }
            })
        }

        currentImageTask?.resume()

        // ios (sometimes?) deactivates the session between tracks in the background
        if isPlaying {
            try? AVAudioSession.sharedInstance().setActive(true)
        }

        if isPlaying && player.timeControlStatus != .playing {
            await self.play(automaticRewind: false)
        }

        isPlayingObserver = player.observe(\.timeControlStatus, options: []) {
            _, _ in
            Task { @AudiobookPlayerActor in
                if await AudiobookPlayerActor.shared.player.timeControlStatus == .paused {
                    await AudiobookPlayerActor.shared.setLastPaused(date: Date.now)
                }
                await AudiobookPlayerActor.shared.isPlayingChangedCallbacks.asyncForEach {
                    $0(await AudiobookPlayerActor.shared.player.timeControlStatus == .playing)
                }
            }
        }


    }

    private func setLastPaused(date: Date) {
        self.lastPaused = date
    }

    func updateElapsedTime() {
        var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String:Any]()
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = NSNumber(value: self.player.currentTime().seconds)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }

        switch reason {
            case .oldDeviceUnavailable:
                if let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
                    if hasHeadphones(in: previousRoute) {
                        self.pause()
                    }
                }
            default: ()
        }

    }

    func handleAudioSessionInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
            let interruptionTypeUInt = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let interruptionType = AVAudioSession.InterruptionType(rawValue: interruptionTypeUInt) else { return }

        switch interruptionType {
        case .began:
            duckCallbacks.forEach {
                $0()
            }

        case .ended:
            do {

                try AVAudioSession.sharedInstance().setActive(true)

                if let optionsUInt = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt,
                    AVAudioSession.InterruptionOptions(rawValue: optionsUInt).contains(.shouldResume) {
                    Task { @AudiobookPlayerActor in
                        await AudiobookPlayerActor.shared.play(automaticRewind: true)
                    }
                }

                // nothing
            } catch {
                // nothing
            }
        @unknown default:
            return
        }
    }

    public func observeClipChanged(_ callback: @escaping ClipChangedCallback) {
        clipChangedCallbacks.append(callback)
    }

    func observerDuck(_ callback: @escaping DuckCallback) {
        duckCallbacks.append(callback)
    }

    func observeTrackChanged(_ callback: @escaping TrackChangedCallback) {
        trackChangedCallbacks.append(callback)
    }

    func observePositionChanged(_ callback: @escaping PositionChangedCallback) {
        positionChangedCallbacks.append(callback)
    }

    func observeIsPlayingChanged(_ callback: @escaping IsPlayingChangedCallback) {
        isPlayingChangedCallbacks.append(callback)
    }

}

extension Sequence {
    func asyncForEach(
        _ operation: (Element) async throws -> Void
    ) async rethrows {
        for element in self {
            try await operation(element)
        }
    }
}


private func hasHeadphones(in routeDescription: AVAudioSessionRouteDescription) -> Bool {
    // Filter the outputs to only those with a port type of headphones.
    return !routeDescription.outputs.filter({$0.portType == .headphones}).isEmpty
}

func searchForClip(clips: [OverlayPar], position: Double) -> OverlayPar? {
    var startIndex = clips.startIndex
    var endIndex = clips.endIndex
    while (startIndex <= endIndex) {
        let midIndex = Int((startIndex + endIndex) / 2)
        let midItem = clips[midIndex]
        if position < midItem.start {
            endIndex = midIndex - 1
            continue
        }
        if position >= midItem.end {
            startIndex = midIndex + 1
            continue
        }
        return midItem
    }
    return nil
}
