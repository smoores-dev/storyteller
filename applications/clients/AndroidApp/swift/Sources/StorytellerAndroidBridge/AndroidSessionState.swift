import Foundation
import StorytellerKit

/// App-facing mirror of `AudioSessionActor`'s snapshot for the Kotlin UI. This
/// is the cross-language equivalent of the Apple app observing the actor
/// in-process; it is distinct from `NowPlayingPresenting`, which drives the OS
/// now-playing surface (lock screen / Android Auto).
enum AndroidSessionState {
    static func startObserving() async {
        _ = await AudioSessionActor.shared.addSnapshotObserver { snapshot in
            publish(snapshot)
        }
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
