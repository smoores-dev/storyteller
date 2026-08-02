import Foundation

/// Opt-in LAN sync of readaloud positions: Bonjour/NSD discovery,
/// point-to-point UDP.
@globalActor
public actor LiveReadingSyncActor {
    public static let shared = LiveReadingSyncActor()

    private static let protocolVersion = 1

    public struct Status: Sendable {
        public let isActive: Bool
        public let packetsSent: Int
        public let packetsReceived: Int
        public let peerCount: Int
        public let lastIncomingBookID: BookID?
        public let lastError: String?
    }

    /// Doubles as the advertised Bonjour service instance name.
    private let instanceID = UUID().uuidString

    private var socket: LiveSyncUDPSocket?
    private var discovery: (any LiveSyncPeerDiscovering)?
    private var settingsObserverId: UUID?
    private var incomingObservers:
        [UUID: (bookID: BookID, callback: @Sendable (LiveReadingSyncPacket) -> Void)] = [:]

    private struct Peer {
        var host: String
        var port: UInt16
    }
    private var peers: [String: Peer] = [:]
    private var lastPositionKey: [String: String] = [:]

    private var packetsSent = 0
    private var packetsReceived = 0
    private var lastIncomingBookID: BookID?
    private var lastError: String?

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public func start() async {
        guard settingsObserverId == nil else { return }
        settingsObserverId = await SettingsActor.shared.request_notify {
            Task { await LiveReadingSyncActor.shared.reconcileWithSettings() }
        }
        await reconcileWithSettings()
    }

    public func reconcileWithSettings() async {
        let enabled = await SettingsActor.shared.config.sync.liveReadingSyncEnabled
        setEnabled(enabled)
    }

    private func setEnabled(_ enabled: Bool) {
        if enabled {
            guard socket == nil else { return }
            let newSocket = LiveSyncUDPSocket { data in
                Task { await LiveReadingSyncActor.shared.handleIncoming(data) }
            }
            do {
                try newSocket.open()
                socket = newSocket
                lastError = nil
                startDiscovery(port: newSocket.localPort)
                debugLog("[LiveSync] Listening on UDP port \(newSocket.localPort)")
            } catch {
                lastError = "\(error)"
                debugLog("[LiveSync] Failed to open socket: \(error)")
            }
        } else {
            guard let socket else { return }
            discovery?.stop()
            discovery = nil
            socket.close()
            self.socket = nil
            peers.removeAll()
            lastPositionKey.removeAll()
            debugLog("[LiveSync] Stopped")
        }
    }

    private func startDiscovery(port: UInt16) {
        guard let provider = StorytellerPlatform.liveSyncDiscovery else {
            lastError = "No peer discovery available on this platform"
            debugLog("[LiveSync] \(lastError!)")
            return
        }
        discovery = provider
        provider.start(
            instanceID: instanceID,
            port: port,
            onPeerFound: { id, host, port in
                Task {
                    await LiveReadingSyncActor.shared.registerPeer(
                        id: id, host: host, port: port
                    )
                }
            },
            onPeerLost: { id in
                Task { await LiveReadingSyncActor.shared.unregisterPeer(id: id) }
            },
        )
    }

    private func registerPeer(id: String, host: String, port: UInt16) {
        peers[id] = Peer(host: host, port: port)
        debugLog("[LiveSync] Peer found: \(host):\(port) (\(peers.count) total)")
    }

    private func unregisterPeer(id: String) {
        peers.removeValue(forKey: id)
        lastPositionKey.removeValue(forKey: id)
        debugLog("[LiveSync] Peer lost (\(peers.count) remaining)")
    }

    public func status() -> Status {
        Status(
            isActive: socket != nil,
            packetsSent: packetsSent,
            packetsReceived: packetsReceived,
            peerCount: peers.count,
            lastIncomingBookID: lastIncomingBookID,
            lastError: lastError,
        )
    }

    public func reportLocalAdvancement(
        bookID: BookID,
        sectionIndex: Int,
        entryIndex: Int,
        textId: String,
        textHref: String,
        playbackRate: Double,
    ) {
        guard let socket, !peers.isEmpty else { return }
        let packet = LiveReadingSyncPacket(
            version: Self.protocolVersion,
            senderID: instanceID,
            bookID: bookID,
            sectionIndex: sectionIndex,
            entryIndex: entryIndex,
            textId: textId,
            textHref: textHref,
            playbackRate: playbackRate,
            sentAt: Date().timeIntervalSince1970,
        )
        guard let data = try? encoder.encode(packet) else { return }
        for (_, peer) in peers {
            socket.send(data, host: peer.host, port: peer.port)
        }
        packetsSent += 1
    }

    @discardableResult
    public func addIncomingObserver(
        for bookID: BookID,
        _ callback: @escaping @Sendable (LiveReadingSyncPacket) -> Void,
    ) -> UUID {
        let id = UUID()
        incomingObservers[id] = (bookID: bookID, callback: callback)
        return id
    }

    public func removeIncomingObserver(id: UUID) {
        incomingObservers.removeValue(forKey: id)
    }

    private func handleIncoming(_ data: Data) {
        guard let packet = try? decoder.decode(LiveReadingSyncPacket.self, from: data) else {
            return
        }
        guard packet.version == Self.protocolVersion else { return }
        guard packet.senderID != instanceID else { return }

        let positionKey = "\(packet.sectionIndex)/\(packet.entryIndex)/\(packet.textId)"
        guard lastPositionKey[packet.senderID] != positionKey else { return }
        lastPositionKey[packet.senderID] = positionKey

        packetsReceived += 1
        lastIncomingBookID = packet.bookID

        // Source IDs are client-local, so peers never agree on them; the book
        // uuid alone identifies the same book across devices.
        for (_, observer) in incomingObservers
        where observer.bookID.uuid == packet.bookID.uuid {
            observer.callback(packet)
        }
    }
}
