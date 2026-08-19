#if os(iOS) || os(macOS)
import Foundation

#if os(iOS)
import UIKit
#endif

enum ScreenWakeLockReason: String, Sendable {
    case playback
    case bookOpen
    case downloading
}

@MainActor
final class ScreenWakeLock {
    static let shared = ScreenWakeLock()

    private var reasons: Set<ScreenWakeLockReason> = []

    #if os(macOS)
    private var displaySleepActivity: NSObjectProtocol?
    #endif

    private init() {}

    func set(_ enabled: Bool, reason: ScreenWakeLockReason = .playback) {
        let before = reasons
        if enabled {
            reasons.insert(reason)
        } else {
            reasons.remove(reason)
        }
        guard reasons.isEmpty != before.isEmpty else { return }
        apply(!reasons.isEmpty)
    }

    private func apply(_ enabled: Bool) {
        #if os(iOS)
        UIApplication.shared.isIdleTimerDisabled = enabled
        debugLog(
            "[ScreenWakeLock] iOS idle timer \(enabled ? "disabled" : "enabled") reasons=\(reasons.map(\.rawValue).sorted().joined(separator: ","))"
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
