import Foundation
import StorytellerKit
import SwiftJava

@JavaClass("dev.smoores.storyteller.platform.AndroidNowPlayingBridge")
open class JavaAndroidNowPlayingBridge: JavaObject {}

extension JavaClass<JavaAndroidNowPlayingBridge> {
    @JavaStaticMethod
    func update(
        _ title: String,
        _ artist: String,
        _ albumTitle: String,
        _ durationSeconds: Double,
        _ elapsedSeconds: Double,
        _ playbackRate: Double,
        _ isPlaying: Bool,
        _ artworkBase64: String,
        _ artworkChanged: Bool,
    )

    @JavaStaticMethod
    func updateChapters(_ payload: String)

    @JavaStaticMethod
    func clear()

    @JavaStaticMethod
    func configureCommands(
        _ token: String,
        _ skipForwardSeconds: Double,
        _ skipBackwardSeconds: Double,
        _ supportsChangePlaybackPosition: Bool,
        _ supportsChangePlaybackRate: Bool,
    )

    @JavaStaticMethod
    func teardownCommands(_ token: String)
}

actor AndroidNowPlayingPresenter: NowPlayingPresenting {
    static let shared = AndroidNowPlayingPresenter()

    private var commandToken: String?
    private var commandHandler: (@Sendable (RemoteCommand) -> Void)?
    private var cachedArtwork: Data?

    private init() {}

    func update(_ info: NowPlayingInfo) {
        let artworkChanged = info.artwork != cachedArtwork
        let artworkBase64 = artworkChanged ? (info.artwork?.base64EncodedString() ?? "") : ""

        do {
            try JavaClass<JavaAndroidNowPlayingBridge>().update(
                info.title,
                info.artist ?? "",
                info.albumTitle ?? "",
                bridgeTime(info.duration),
                bridgeTime(info.elapsedTime),
                info.playbackRate,
                info.isPlaying,
                artworkBase64,
                artworkChanged,
            )
            if artworkChanged {
                cachedArtwork = info.artwork
            }
        } catch {
            // A later periodic update will retry, including unchanged artwork.
        }
    }

    func updateChapters(_ chapters: NowPlayingChapters?) {
        guard let chapters, !chapters.chapters.isEmpty else {
            try? JavaClass<JavaAndroidNowPlayingBridge>().updateChapters("")
            return
        }
        let payload = EncodedChapters(
            currentChapterID: chapters.currentChapterID,
            currentChapterIndex: chapters.currentChapterIndex,
            // JSONEncoder throws on non-finite values, which would abandon the
            // whole payload and strand the previously published list.
            chapters: chapters.chapters.map {
                EncodedChapters.Chapter(
                    id: $0.id,
                    title: $0.title,
                    duration: $0.duration.isFinite ? max(0, $0.duration) : 0,
                )
            },
        )
        guard let data = try? JSONEncoder().encode(payload) else { return }
        try? JavaClass<JavaAndroidNowPlayingBridge>()
            .updateChapters(String(decoding: data, as: UTF8.self))
    }

    func clear() {
        cachedArtwork = nil
        try? JavaClass<JavaAndroidNowPlayingBridge>().clear()
    }

    func configureCommands(
        skipForwardInterval: TimeInterval,
        skipBackwardInterval: TimeInterval,
        supportsChangePlaybackPosition: Bool,
        supportsChangePlaybackRate: Bool,
        handler: @escaping @Sendable (RemoteCommand) -> Void,
    ) {
        let token = UUID().uuidString
        commandToken = token
        commandHandler = handler
        try? JavaClass<JavaAndroidNowPlayingBridge>().configureCommands(
            token,
            skipForwardInterval,
            skipBackwardInterval,
            supportsChangePlaybackPosition,
            supportsChangePlaybackRate,
        )
    }

    func teardownCommands() {
        guard let token = commandToken else { return }
        commandToken = nil
        commandHandler = nil
        try? JavaClass<JavaAndroidNowPlayingBridge>().teardownCommands(token)
    }

    fileprivate func handleCommand(
        token: String,
        command: String,
        value: Double,
        text: String,
    ) async {
        guard token == commandToken, let commandHandler else { return }

        switch command {
            case "play":
                commandHandler(.play)
            case "pause":
                commandHandler(.pause)
            case "togglePlayPause":
                commandHandler(.togglePlayPause)
            case "skipForward":
                commandHandler(.skipForward(value))
            case "skipBackward":
                commandHandler(.skipBackward(value))
            case "changePlaybackPosition":
                commandHandler(.changePlaybackPosition(value))
            case "changePlaybackRate":
                commandHandler(.changePlaybackRate(value))
            case "selectChapter":
                commandHandler(.selectChapter(text))
            case "nextChapter":
                commandHandler(.nextChapter)
            case "previousChapter":
                commandHandler(.previousChapter)
            default:
                break
        }
    }

    private struct EncodedChapters: Encodable {
        struct Chapter: Encodable {
            let id: String
            let title: String
            let duration: Double
        }

        let currentChapterID: String?
        let currentChapterIndex: Int?
        let chapters: [Chapter]
    }

    private func bridgeTime(_ value: TimeInterval?) -> Double {
        guard let value, value.isFinite, value >= 0 else { return -1 }
        return value
    }
}

/// Kotlin-to-Swift delivery for MediaSession/MediaLibrarySession player commands.
public func androidNowPlayingCommand(
    token: String,
    command: String,
    value: Double,
    text: String,
) async {
    await AndroidNowPlayingPresenter.shared.handleCommand(
        token: token,
        command: command,
        value: value,
        text: text,
    )
}
