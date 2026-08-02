#if os(macOS)
import Foundation
import Observation
import StorytellerKit

#if canImport(Darwin)
import Darwin
#endif

@MainActor
@Observable
final class ContentServerManager {
    enum Status: Equatable {
        case stopped
        case starting
        case running(port: Int)
        case failed(String)
    }

    private let server: any ContentServerControlling
    private(set) var status: Status = .stopped

    init(server: any ContentServerControlling) {
        self.server = server
    }

    var isRunning: Bool {
        if case .running = status { return true }
        return false
    }

    func start(port: Int, username: String, password: String, sourceID: BookSourceID?) async {
        guard !username.isEmpty, !password.isEmpty else {
            status = .failed("A username and password are required.")
            return
        }
        status = .starting
        do {
            let info = try await server.start(
                ContentServerConfiguration(
                    port: port,
                    username: username,
                    password: password,
                    sourceID: sourceID,
                )
            )
            status = .running(port: info.port)
        } catch {
            status = .failed(Self.describe(error))
        }
    }

    /// Folder sources eligible to be served, for the picker in the settings UI.
    func folderSources() async -> [BookSourceRecord] {
        let snapshot = await BookServiceActor.shared.librarySnapshot()
        return snapshot.sources.filter { $0.kind == .localFolder }
    }

    func stop() async {
        await server.stop()
        status = .stopped
    }

    private static func describe(_ error: Error) -> String {
        switch error {
            case ContentServerError.noFolderSource:
                return "Add a Folder Source before starting the content server."
            case ContentServerError.alreadyRunning:
                return "The server is already running."
            case ContentServerError.sourceNotFound:
                return "The selected folder source could not be found."
            default:
                return String(describing: error)
        }
    }

    /// Best-effort primary LAN IPv4 address, for showing a connectable URL.
    static func localIPv4Address() -> String? {
        #if canImport(Darwin)
        var address: String?
        var ifaddrPointer: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddrPointer) == 0, let first = ifaddrPointer else { return nil }
        defer { freeifaddrs(ifaddrPointer) }

        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let interface = pointer.pointee
            guard interface.ifa_addr.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: interface.ifa_name)
            // en0/en1 are the typical Wi-Fi/Ethernet interfaces on macOS.
            guard name.hasPrefix("en") else { continue }

            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            let result = getnameinfo(
                interface.ifa_addr,
                socklen_t(interface.ifa_addr.pointee.sa_len),
                &host,
                socklen_t(host.count),
                nil,
                0,
                NI_NUMERICHOST,
            )
            if result == 0 {
                address = String(cString: host)
                break
            }
        }
        return address
        #else
        return nil
        #endif
    }
}

#endif
