#if os(iOS) || os(macOS)
import SwiftUI

struct SoftScrollEdgeModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            content.scrollEdgeEffectStyle(.soft, for: .top)
        } else {
            content
        }
    }
}

#if os(macOS)
import AppKit

/// Tracks how much a window has been expanded by sidebars so we can
/// always derive the base content width: `window.frame.width - right - left`.
@MainActor
private final class WindowExpansionState {
    static let shared = WindowExpansionState()
    private var windowStates: [ObjectIdentifier: (right: CGFloat, left: CGFloat)] = [:]

    func get(for window: NSWindow) -> (right: CGFloat, left: CGFloat) {
        windowStates[ObjectIdentifier(window)] ?? (0, 0)
    }

    func set(for window: NSWindow, right: CGFloat, left: CGFloat) {
        windowStates[ObjectIdentifier(window)] = (right, left)
    }

    func baseWidth(for window: NSWindow) -> CGFloat {
        let exp = get(for: window)
        return window.frame.width - exp.right - exp.left
    }
}

/// Expands a window outward when sidebars open, contracts when they close,
/// and persists the base (no-sidebar) width to UserDefaults.
///
/// Invariant: UserDefaults[savedWidthKey] always stores the base content width
/// (with no sidebar expansion). On restore we add back whatever sidebars are
/// currently requested.
struct WindowFrameAdjuster: NSViewRepresentable {
    let expandRight: Bool
    let expandLeft: Bool
    let rightAmount: CGFloat
    let leftAmount: CGFloat
    let savedWidthKey: String?

    init(expandRight: Bool, rightAmount: CGFloat, savedWidthKey: String? = nil) {
        self.expandRight = expandRight
        self.expandLeft = false
        self.rightAmount = rightAmount
        self.leftAmount = 0
        self.savedWidthKey = savedWidthKey
    }

    init(
        expandRight: Bool,
        expandLeft: Bool,
        rightAmount: CGFloat,
        leftAmount: CGFloat,
        savedWidthKey: String? = nil,
    ) {
        self.expandRight = expandRight
        self.expandLeft = expandLeft
        self.rightAmount = rightAmount
        self.leftAmount = leftAmount
        self.savedWidthKey = savedWidthKey
    }

    func makeNSView(context: Context) -> NSView { NSView() }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            guard let window = nsView.window else { return }
            let c = context.coordinator
            c.window = window
            c.rightAmount = rightAmount
            c.leftAmount = leftAmount
            c.savedWidthKey = savedWidthKey

            if !c.initialized {
                initialize(window: window, coordinator: c)
            } else {
                handleSidebarChange(window: window, coordinator: c)
            }
        }
    }

    private func initialize(window: NSWindow, coordinator c: Coordinator) {
        c.initialized = true
        c.lastExpandRight = expandRight
        c.lastExpandLeft = expandLeft

        let state = WindowExpansionState.shared

        // 1. Determine base width: saved value or current window width.
        let baseWidth: CGFloat
        if let key = savedWidthKey,
            let saved = UserDefaults.standard.object(forKey: key) as? CGFloat,
            saved > 0
        {
            baseWidth = saved
        } else {
            baseWidth = window.frame.width
        }

        // 2. Compute target = base + whichever sidebars are open right now.
        let targetRight: CGFloat = expandRight ? rightAmount : 0
        let targetLeft: CGFloat = expandLeft ? leftAmount : 0
        let targetWidth = baseWidth + targetRight + targetLeft

        // 3. Set frame if it differs.
        if abs(window.frame.width - targetWidth) > 1 {
            var frame = window.frame
            frame.size.width = targetWidth
            window.setFrame(frame, display: true, animate: false)
        }

        // 4. Record expansion so future toggles know the current state.
        state.set(for: window, right: targetRight, left: targetLeft)

        // 5. Start observing resizes to persist base width.
        if let key = savedWidthKey {
            setupResizeObserver(window: window, coordinator: c, key: key)
        }
    }

    private func handleSidebarChange(window: NSWindow, coordinator c: Coordinator) {
        let state = WindowExpansionState.shared
        let exp = state.get(for: window)
        var frame = window.frame
        var newRight = exp.right
        var newLeft = exp.left
        var changed = false

        if expandRight != c.lastExpandRight {
            if expandRight && exp.right == 0 {
                frame.size.width += rightAmount
                newRight = rightAmount
                changed = true
            } else if !expandRight && exp.right > 0 {
                frame.size.width -= rightAmount
                newRight = 0
                changed = true
            }
            c.lastExpandRight = expandRight
        }

        if expandLeft != c.lastExpandLeft {
            if expandLeft && exp.left == 0 {
                frame.size.width += leftAmount
                frame.origin.x -= leftAmount
                newLeft = leftAmount
                changed = true
            } else if !expandLeft && exp.left > 0 {
                frame.size.width -= leftAmount
                frame.origin.x += leftAmount
                newLeft = 0
                changed = true
            }
            c.lastExpandLeft = expandLeft
        }

        if changed {
            state.set(for: window, right: newRight, left: newLeft)
            window.setFrame(frame, display: true, animate: true)
            saveBaseWidth(window: window)
        }
    }

    private func saveBaseWidth(window: NSWindow) {
        guard let key = savedWidthKey else { return }
        let base = WindowExpansionState.shared.baseWidth(for: window)
        UserDefaults.standard.set(base, forKey: key)
    }

    private func setupResizeObserver(window: NSWindow, coordinator c: Coordinator, key: String) {
        c.resizeObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didEndLiveResizeNotification,
            object: window,
            queue: .main,
        ) { [weak c] _ in
            MainActor.assumeIsolated {
                guard c != nil else { return }
                let base = WindowExpansionState.shared.baseWidth(for: window)
                UserDefaults.standard.set(base, forKey: key)
            }
        }
    }

    class Coordinator: @unchecked Sendable {
        var initialized = false
        var lastExpandRight = false
        var lastExpandLeft = false
        var resizeObserver: Any?
        weak var window: NSWindow?
        var rightAmount: CGFloat = 0
        var leftAmount: CGFloat = 0
        var savedWidthKey: String?

        deinit {
            if let observer = resizeObserver {
                NotificationCenter.default.removeObserver(observer)
            }
            guard let window else { return }

            let w = window
            let wasRight = lastExpandRight
            let wasLeft = lastExpandLeft
            let rAmt = rightAmount
            let lAmt = leftAmount
            let key = savedWidthKey

            DispatchQueue.main.async {
                let state = WindowExpansionState.shared
                let exp = state.get(for: w)
                var frame = w.frame
                var newRight = exp.right
                var newLeft = exp.left
                var changed = false

                if wasRight && exp.right > 0 {
                    frame.size.width -= rAmt
                    newRight = 0
                    changed = true
                }
                if wasLeft && exp.left > 0 {
                    frame.size.width -= lAmt
                    frame.origin.x += lAmt
                    newLeft = 0
                    changed = true
                }
                if changed {
                    state.set(for: w, right: newRight, left: newLeft)
                    w.setFrame(frame, display: true, animate: false)
                }
                if let key {
                    let base = state.baseWidth(for: w)
                    UserDefaults.standard.set(base, forKey: key)
                }
            }
        }
    }
}
#endif

#endif
