#if os(iOS) || os(macOS)
import Foundation

#if os(iOS)
import UIKit
#endif

@MainActor
final class ScreenWakeLock {
    static let shared = ScreenWakeLock()

    #if os(macOS)
    private var displaySleepActivity: NSObjectProtocol?
    #endif

    private init() {}

    func set(_ enabled: Bool) {
        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = enabled
        debugLog(
            "[ScreenWakeLock] iOS idle timer \(enabled ? "disabled" : "enabled")"
        )
        #elseif os(macOS)
        if enabled {
            guard displaySleepActivity == nil else { return }
            displaySleepActivity = ProcessInfo.processInfo.beginActivity(
                options: [.idleDisplaySleepDisabled, .userInitiated],
                reason: "Audio narration playback",
            )
            debugLog("[ScreenWakeLock] macOS display sleep disabled")
        } else if let activity = displaySleepActivity {
            ProcessInfo.processInfo.endActivity(activity)
            displaySleepActivity = nil
            debugLog("[ScreenWakeLock] macOS display sleep enabled")
        }
        #endif
    }
}
#endif
