public protocol AudioRouteQuerying: Sendable {
    /// True when the active output route is headphones or a Bluetooth audio device.
    var isHeadphoneRouteActive: Bool { get }
}
