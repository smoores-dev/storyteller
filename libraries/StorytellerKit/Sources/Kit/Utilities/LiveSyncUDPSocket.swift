import Foundation

#if canImport(Darwin)
    import Darwin
#elseif canImport(Android)
    import Android
#elseif canImport(Glibc)
    import Glibc
#endif

enum LiveSyncUDPSocketError: Error {
    case openFailed(String)
}

#if os(Windows)

    /// Windows has Winsock rather than BSD sockets. Nothing registers a peer
    /// discovery provider there yet, so live sync cannot find peers regardless.
    final class LiveSyncUDPSocket: @unchecked Sendable {
        private(set) var localPort: UInt16 = 0

        init(onReceive: @escaping @Sendable (Data) -> Void) {}

        func open() throws {
            throw LiveSyncUDPSocketError.openFailed("live sync is unsupported on Windows")
        }

        func close() {}

        func send(_ data: Data, host: String, port: UInt16) {}
    }

#else

    /// BSD sockets because Kit also builds for Android. The 1s receive timeout
    /// lets close() just flip a flag.
    final class LiveSyncUDPSocket: @unchecked Sendable {
        private let onReceive: @Sendable (Data) -> Void

        private let lock = NSLock()
        private var fd: Int32 = -1
        private var isOpen = false
        /// Host byte order; valid after open().
        private(set) var localPort: UInt16 = 0

        init(onReceive: @escaping @Sendable (Data) -> Void) {
            self.onReceive = onReceive
        }

        deinit {
            close()
        }

        func open() throws {
            lock.lock()
            defer { lock.unlock() }
            guard !isOpen else { return }

            #if canImport(Glibc)
                let sock = socket(AF_INET, Int32(SOCK_DGRAM.rawValue), 0)
            #else
                let sock = socket(AF_INET, Int32(SOCK_DGRAM), 0)
            #endif
            guard sock >= 0 else {
                throw LiveSyncUDPSocketError.openFailed("socket() failed: errno \(errno)")
            }

            var timeout = timeval(tv_sec: 1, tv_usec: 0)
            _ = setsockopt(
                sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size)
            )

            var bindAddr = sockaddr_in()
            #if canImport(Darwin)
                bindAddr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            #endif
            bindAddr.sin_family = sa_family_t(AF_INET)
            bindAddr.sin_port = 0
            // INADDR_ANY spelled as 0: the C macro does not import on Android.
            bindAddr.sin_addr = in_addr(s_addr: in_addr_t(0))

            let bindResult = withUnsafePointer(to: &bindAddr) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    bind(sock, sockaddrPointer, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            guard bindResult == 0 else {
                _ = closeSocket(sock)
                throw LiveSyncUDPSocketError.openFailed("bind() failed: errno \(errno)")
            }

            var assigned = sockaddr_in()
            var assignedLength = socklen_t(MemoryLayout<sockaddr_in>.size)
            let nameResult = withUnsafeMutablePointer(to: &assigned) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                    getsockname(sock, sockaddrPointer, &assignedLength)
                }
            }
            guard nameResult == 0 else {
                _ = closeSocket(sock)
                throw LiveSyncUDPSocketError.openFailed("getsockname() failed: errno \(errno)")
            }

            localPort = UInt16(bigEndian: assigned.sin_port)
            fd = sock
            isOpen = true

            let thread = Thread { [weak self] in
                self?.receiveLoop()
            }
            thread.name = "storyteller.live-reading-sync.receive"
            thread.start()
        }

        func close() {
            lock.lock()
            defer { lock.unlock() }
            guard isOpen else { return }
            isOpen = false
            _ = closeSocket(fd)
            fd = -1
            localPort = 0
        }

        /// Host must be a numeric IPv4 string; port is host byte order.
        func send(_ data: Data, host: String, port: UInt16) {
            lock.lock()
            let sock = fd
            let open = isOpen
            lock.unlock()
            guard open, sock >= 0 else { return }

            var destination = sockaddr_in()
            #if canImport(Darwin)
                destination.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            #endif
            destination.sin_family = sa_family_t(AF_INET)
            destination.sin_port = port.bigEndian
            guard inet_pton(AF_INET, host, &destination.sin_addr) == 1 else { return }

            data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) in
                guard let base = buffer.baseAddress else { return }
                _ = withUnsafePointer(to: &destination) { pointer in
                    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockaddrPointer in
                        sendto(
                            sock, base, buffer.count, 0, sockaddrPointer,
                            socklen_t(MemoryLayout<sockaddr_in>.size),
                        )
                    }
                }
            }
        }

        private func receiveLoop() {
            var buffer = [UInt8](repeating: 0, count: 4096)
            while true {
                lock.lock()
                let sock = fd
                let open = isOpen
                lock.unlock()
                guard open, sock >= 0 else { return }

                let received = recv(sock, &buffer, buffer.count, 0)
                if received > 0 {
                    onReceive(Data(buffer[0..<received]))
                }
            }
        }

        private func closeSocket(_ sock: Int32) -> Int32 {
            #if canImport(Darwin)
                return Darwin.close(sock)
            #elseif canImport(Android)
                return Android.close(sock)
            #else
                return Glibc.close(sock)
            #endif
        }
    }

#endif
