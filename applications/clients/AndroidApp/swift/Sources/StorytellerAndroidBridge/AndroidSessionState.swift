import Foundation
import Observation
import StorytellerKit

/// Publishes reading session state to the Kotlin UI.
@StorytellerUIActor
enum AndroidSessionState {
    private static var started = false
    static func startObserving() {
        guard !started else { return }
        started = true
        observePlayback()
    }

    private static func observePlayback() {
        let (snapshot, audiobook) = withObservationTracking {
            let session = ActiveReadingSession.shared.current
            return (session?.playbackSnapshot, session?.audiobookState)
        } onChange: {
            Task { @StorytellerUIActor in observePlayback() }
        }
        publish(snapshot)
        publishAndroidAudiobookState(audiobook)
    }

    private struct Payload: Encodable {
        let kind: String
        let bookID: String
        let sourceID: String
        let title: String
        let author: String
        let isPlaying: Bool
        let playbackRate: Double
    }

    private static func publish(_ snapshot: AudioSessionSnapshot?) {
        guard let snapshot else {
            notifyAndroidSessionDidChange("")
            return
        }
        let payload = Payload(
            kind: snapshot.kind.isReadaloud ? "readaloud" : "audiobook",
            bookID: snapshot.kind.bookID.uuid,
            sourceID: snapshot.kind.bookID.sourceID,
            title: snapshot.title ?? "",
            author: snapshot.author ?? "",
            isPlaying: snapshot.isPlaying,
            playbackRate: snapshot.playbackRate,
        )
        guard let data = try? JSONEncoder().encode(payload) else { return }
        notifyAndroidSessionDidChange(String(decoding: data, as: UTF8.self))
    }
}

extension AudioSessionKind {
    fileprivate var isReadaloud: Bool {
        if case .readaloud = self { return true }
        return false
    }
}
