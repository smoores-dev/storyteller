import Foundation

/// Advertise this client's UDP port under a Bonjour/NSD service and browse
/// for peers doing the same.
public protocol LiveSyncPeerDiscovering: AnyObject, Sendable {
    func start(
        instanceID: String,
        port: UInt16,
        onPeerFound: @escaping @Sendable (_ instanceID: String, _ host: String, _ port: UInt16)
            -> Void,
        onPeerLost: @escaping @Sendable (_ instanceID: String) -> Void,
    )
    func stop()
}
