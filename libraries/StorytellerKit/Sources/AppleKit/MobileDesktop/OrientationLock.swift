#if os(iOS)
import Observation
import SwiftUI
import UIKit

/// Session-only; relaunching the app unlocks rotation.
@MainActor
@Observable
public final class OrientationLock {
    public static let shared = OrientationLock()

    public private(set) var lockedMask: UIInterfaceOrientationMask? = nil

    public var isLocked: Bool { lockedMask != nil }

    public var defaultMask: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .allButUpsideDown
    }

    public func toggle() {
        if lockedMask != nil {
            lockedMask = nil
        } else {
            lockedMask = currentOrientationMask()
        }
        applyToScenes()
    }

    private func currentOrientationMask() -> UIInterfaceOrientationMask {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        switch scene?.interfaceOrientation {
            case .landscapeLeft: return .landscapeLeft
            case .landscapeRight: return .landscapeRight
            case .portraitUpsideDown: return .portraitUpsideDown
            default: return .portrait
        }
    }

    private func applyToScenes() {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            windowScene.requestGeometryUpdate(
                .iOS(interfaceOrientations: lockedMask ?? defaultMask)
            )
            for window in windowScene.windows {
                window.rootViewController?
                    .setNeedsUpdateOfSupportedInterfaceOrientations()
            }
        }
    }
}
#endif
