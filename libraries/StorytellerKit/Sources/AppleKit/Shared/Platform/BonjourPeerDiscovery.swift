#if !os(watchOS)
import Darwin
import Foundation

/// NetService is exempt from the multicast entitlement and requires the
/// main run loop.
final class BonjourPeerDiscovery: NSObject, LiveSyncPeerDiscovering, @unchecked Sendable {
    static let serviceType = "_storyteller-lrs._udp."
    private static let domain = "local."

    private var published: NetService?
    private var browser: NetServiceBrowser?
    private var resolving: [NetService] = []
    private var knownPeerNames: Set<String> = []
    private var instanceID = ""
    private var onPeerFound: (@Sendable (String, String, UInt16) -> Void)?
    private var onPeerLost: (@Sendable (String) -> Void)?

    func start(
        instanceID: String,
        port: UInt16,
        onPeerFound: @escaping @Sendable (String, String, UInt16) -> Void,
        onPeerLost: @escaping @Sendable (String) -> Void,
    ) {
        DispatchQueue.main.async {
            self.instanceID = instanceID
            self.onPeerFound = onPeerFound
            self.onPeerLost = onPeerLost

            let service = NetService(
                domain: Self.domain,
                type: Self.serviceType,
                name: instanceID,
                port: Int32(port),
            )
            service.publish()
            self.published = service

            let browser = NetServiceBrowser()
            browser.delegate = self
            browser.searchForServices(ofType: Self.serviceType, inDomain: Self.domain)
            self.browser = browser
        }
    }

    func stop() {
        DispatchQueue.main.async {
            self.browser?.stop()
            self.browser = nil
            self.published?.stop()
            self.published = nil
            self.resolving.forEach { $0.stop() }
            self.resolving.removeAll()
            self.knownPeerNames.removeAll()
            self.onPeerFound = nil
            self.onPeerLost = nil
        }
    }
}

extension BonjourPeerDiscovery: NetServiceBrowserDelegate, NetServiceDelegate {
    func netServiceBrowser(
        _ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool
    ) {
        guard service.name != instanceID, service.name != published?.name else { return }
        service.delegate = self
        resolving.append(service)
        service.resolve(withTimeout: 10)
    }

    func netServiceBrowser(
        _ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool
    ) {
        resolving.removeAll { $0 === service }
        if knownPeerNames.remove(service.name) != nil {
            onPeerLost?(service.name)
        }
    }

    func netServiceDidResolveAddress(_ sender: NetService) {
        resolving.removeAll { $0 === sender }
        guard sender.name != instanceID, sender.name != published?.name else { return }

        for addressData in sender.addresses ?? [] {
            let parsed: (String, UInt16)? = addressData.withUnsafeBytes { raw in
                guard raw.count >= MemoryLayout<sockaddr_in>.size else { return nil }
                let address = raw.loadUnaligned(as: sockaddr_in.self)
                guard address.sin_family == sa_family_t(AF_INET) else { return nil }
                var host = address.sin_addr
                var text = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
                guard inet_ntop(AF_INET, &host, &text, socklen_t(INET_ADDRSTRLEN)) != nil
                else {
                    return nil
                }
                let bytes = text.prefix(while: { $0 != 0 }).map { UInt8(bitPattern: $0) }
                return (
                    String(decoding: bytes, as: UTF8.self),
                    UInt16(bigEndian: address.sin_port),
                )
            }
            if let (host, port) = parsed {
                knownPeerNames.insert(sender.name)
                onPeerFound?(sender.name, host, port)
                return
            }
        }
    }

    func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
        resolving.removeAll { $0 === sender }
    }
}
#endif
