import Foundation
import StoryAlignCore

public final class ReadaloudProgressListener: ProgressListener, @unchecked Sendable {
    private let onUpdate: @Sendable (ProgressStage, String, Double) -> Void
    private let updateQueue = DispatchQueue(label: "com.storyteller.readaloud.progress")

    public init(onUpdate: @escaping @Sendable (ProgressStage, String, Double) -> Void) {
        self.onUpdate = onUpdate
    }

    public func show(_ snapshot: ProgressSnapshot) {
        updateQueue.async {
            let stage = snapshot.stage
            let message = ProgressFormatter().detailedStageText(snapshot)
            let progress = snapshot.timeEstimateProgress()
            self.onUpdate(stage, message, progress)
        }
    }
}
