import Foundation
import Testing

@testable import StorytellerKit

#if canImport(AVFoundation)
import StorytellerAppleKit
#endif

struct PlaybackNotificationCadenceTests {
    private func state(elapsed: Double, total: Double = 20.37, rate: Double = 1)
        -> SMILPlaybackState
    {
        SMILPlaybackState(
            isPlaying: true,
            currentSectionIndex: 0,
            currentEntryIndex: 0,
            currentFragment: "chapter#sentence",
            chapterLabel: "Chapter",
            chapterElapsed: elapsed,
            chapterTotal: total,
            bookElapsed: elapsed,
            bookTotal: total,
            playbackRate: rate,
            volume: 1,
            bookID: nil,
        )
    }

    @Test func unchangedDigitsDoNotPublish() {
        var cadence = PlaybackNotificationCadence()
        let initial = cadence.shouldNotify(state(elapsed: 0), span: 0, chapter: 0)
        #expect(initial)
        for elapsed in [0.1, 0.2, 0.3, 0.4] {
            let published = cadence.shouldNotify(state(elapsed: elapsed), span: 0, chapter: 0)
            #expect(!published)
        }
        let elapsedChanged = cadence.shouldNotify(state(elapsed: 0.51), span: 0, chapter: 0)
        #expect(elapsedChanged)
        let remainingChanged = cadence.shouldNotify(state(elapsed: 0.88), span: 0, chapter: 0)
        #expect(remainingChanged)
    }

    @Test func eventsDoNotPostponeTheNextSecond() {
        var cadence = PlaybackNotificationCadence()
        _ = cadence.shouldNotify(state(elapsed: 0.4), span: 0, chapter: 0)
        let sentence = cadence.shouldNotify(state(elapsed: 0.45), span: 1, chapter: 0)
        #expect(sentence)
        let nextSecond = cadence.shouldNotify(state(elapsed: 0.51), span: 1, chapter: 0)
        #expect(nextSecond)
        let chapter = cadence.shouldNotify(state(elapsed: 0.52), span: 1, chapter: 1)
        #expect(chapter)
        let command = cadence.shouldNotify(
            state(elapsed: 0.53),
            span: 1,
            chapter: 1,
            force: true,
        )
        #expect(command)
    }

    @Test(arguments: [0.75, 1.0, 1.05, 1.5, 2.0, 5.0])
    func jitterAndSentenceEventsDoNotSkipDisplayedSeconds(rate: Double) {
        // Fractional durations give media-time and listening-time clocks
        // different rounding boundaries.
        for total in [20.13, 60.01, 20.37 * rate] {
            var cadence = PlaybackNotificationCadence()
            var wallTime = 0.0
            var previousElapsed = -1
            var previousMediaElapsed = -1
            var previousRemaining = Int((total / rate).rounded()) + 1
            var previousMediaRemaining = Int(total.rounded()) + 1
            var tick = 0
            while true {
                let snapshot = state(
                    elapsed: min(wallTime * rate, total),
                    total: total,
                    rate: rate,
                )
                if cadence.shouldNotify(snapshot, span: tick / 7, chapter: 0) {
                    let elapsed = Int((snapshot.chapterElapsed / rate).rounded())
                    let mediaElapsed = Int(snapshot.chapterElapsed.rounded())
                    let remaining = Int(((total - snapshot.chapterElapsed) / rate).rounded())
                    let mediaRemaining = Int((total - snapshot.chapterElapsed).rounded())
                    #expect((0...1).contains(elapsed - previousElapsed))
                    #expect((0...1).contains(mediaElapsed - previousMediaElapsed))
                    #expect((0...1).contains(previousRemaining - remaining))
                    #expect((0...1).contains(previousMediaRemaining - mediaRemaining))
                    previousElapsed = elapsed
                    previousMediaElapsed = mediaElapsed
                    previousRemaining = remaining
                    previousMediaRemaining = mediaRemaining
                }
                if wallTime * rate >= total { break }
                wallTime += [0.08, 0.12, 0.09, 0.14][tick % 4]
                tick += 1
            }
            #expect(previousRemaining == 0)
            #expect(previousMediaRemaining == 0)
            #expect(previousElapsed == Int((total / rate).rounded()))
        }
    }

    @Test func normalSpeedClockDoesNotPublishEveryEngineTick() {
        var cadence = PlaybackNotificationCadence()
        var notifications = 0
        for tick in 0..<1000 {
            if cadence.shouldNotify(
                state(elapsed: Double(tick) / 10, total: 120.37),
                span: 0,
                chapter: 0,
            ) {
                notifications += 1
            }
        }
        // Elapsed and remaining seconds have different rounding boundaries.
        #expect(notifications == 201)
    }
    #if canImport(AVFoundation)
    @MainActor
    @Test func textPlayerClockUsesTheSameRoundingAsNotifications() {
        let player = SMILTextPlaybackViewModel()
        for (time, label) in [
            (0.7, "0:01"), (1.4, "0:01"), (2.1, "0:02"),
            (59.6, "1:00"), (3599.6, "1:00:00"),
        ] {
            player.currentTime = time
            #expect(player.currentTimeFormatted == label)
        }
    }
    #endif

}
