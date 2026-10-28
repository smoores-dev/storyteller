import Foundation
import StorytellerKit

/// Thin Android adapter around the platform-neutral audiobook session.
/// Compose supplies commands and renders the encoded shared state.
actor AndroidAudiobookSession {
    static let shared = AndroidAudiobookSession()

    func open(bookID: BookID) async throws {
        _ = try await ActiveReadingSession.shared.open(bookID: bookID, category: .audio)
    }

    func openHeadless(bookID: BookID, category: LocalMediaCategory) async throws {
        _ = try await ActiveReadingSession.shared.open(bookID: bookID, category: category)
    }

    func close() async {
        guard let session = await ActiveReadingSession.shared.current,
            await session.category == .audio
        else { return }
        await session.close(.endSession)
    }

    func control(command: String, value: Double, text: String) async throws {
        guard let session = await ActiveReadingSession.shared.current else {
            throw AudiobookSessionError.audiobookNotOpen
        }
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
                await session.cyclePlaybackRate()
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

        try await session.control(sharedCommand)
    }

}

func publishAndroidAudiobookState(_ state: AudiobookSessionState?) {
    guard let state else {
        notifyAndroidAudiobookStateDidChange("")
        return
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    guard let data = try? encoder.encode(state) else { return }
    notifyAndroidAudiobookStateDidChange(String(decoding: data, as: UTF8.self))
}
