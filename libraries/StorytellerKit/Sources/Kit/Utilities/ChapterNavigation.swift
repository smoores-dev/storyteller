import Foundation

/// True when a previous-chapter press should restart the current chapter
/// rather than step back: past 1% progress and not within 2s of a restart.
public func previousChapterRestarts(
    progressInChapter: Double,
    lastRestartAt: Date?,
    now: Date = Date(),
) -> Bool {
    let justRestarted = lastRestartAt.map { now.timeIntervalSince($0) < 2 } ?? false
    return progressInChapter > 0.01 && !justRestarted
}
