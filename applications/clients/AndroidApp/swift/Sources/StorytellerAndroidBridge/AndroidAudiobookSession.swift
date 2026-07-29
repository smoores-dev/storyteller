import Foundation
import StorytellerKit

/// Thin Android adapter around the platform-neutral audiobook session.
/// Compose supplies commands and renders the encoded shared state.
actor AndroidAudiobookSession {
    static let shared = AndroidAudiobookSession()

    private var stateObserverID: UUID?

    func open(bookID: BookID) async throws {
        try await AudioSessionActor.shared.openAudiobook(bookID: bookID)
        await installStateObserverIfNeeded()
    }

    func openHeadless(bookID: BookID, category: LocalMediaCategory) async throws {
        try await HeadlessAudioSession.open(bookID: bookID, category: category)
        if category == .audio {
            await installStateObserverIfNeeded()
        }
    }

    func close() async {
        await AudioSessionActor.shared.closeAudiobook()
    }

    func control(command: String, value: Double, text: String) async throws {
        let sharedCommand: AudiobookSessionCommand
        switch command {
            case "togglePlayPause":
                sharedCommand = .togglePlayPause
            case "skipBackward":
                sharedCommand = .skipBackward
            case "skipForward":
                sharedCommand = .skipForward
            case "previousChapter":
                sharedCommand = .previousChapter
            case "nextChapter":
                sharedCommand = .nextChapter
            case "seekChapterFraction":
                sharedCommand = .seekChapterFraction(value)
            case "selectChapter":
                sharedCommand = .selectChapter(text)
            case "setPlaybackRate":
                sharedCommand = .setPlaybackRate(value)
            case "cyclePlaybackRate":
                await AudioSessionActor.shared.cyclePlaybackRate()
                return
            case "setVolume":
                sharedCommand = .setVolume(value)
            case "startSleepTimer":
                sharedCommand = .startSleepTimer(value)
            case "startEndOfChapterSleepTimer":
                sharedCommand = .startEndOfChapterSleepTimer
            case "cancelSleepTimer":
                sharedCommand = .cancelSleepTimer
            case "acceptServerPosition":
                sharedCommand = .acceptServerPosition
            case "declineServerPosition":
                sharedCommand = .declineServerPosition
            default:
                throw AndroidBridgeError.invalidAudiobookCommand(command)
        }

        try await AudioSessionActor.shared.control(sharedCommand)
    }

    private func installStateObserverIfNeeded() async {
        guard stateObserverID == nil else { return }
        stateObserverID = await AudioSessionActor.shared.addStateObserver { state in
            publishAndroidAudiobookState(state)
        }
    }
}

private func publishAndroidAudiobookState(_ state: AudiobookSessionState?) {
    guard let state else {
        notifyAndroidAudiobookStateDidChange("")
        return
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(state) else { return }
    notifyAndroidAudiobookStateDidChange(String(decoding: data, as: UTF8.self))
}
