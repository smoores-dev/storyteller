// Storyteller-to-Kotlin platform adapters and callbacks.
import Foundation
import StorytellerKit
import SwiftJava
import Synchronization

@JavaClass("dev.smoores.storyteller.platform.AndroidSecureStore")
open class JavaAndroidSecureStore: JavaObject {}

extension JavaClass<JavaAndroidSecureStore> {
    @JavaStaticMethod
    func store(_ key: String, _ value: String) -> Bool

    @JavaStaticMethod
    func load(_ key: String) -> String

    @JavaStaticMethod
    func contains(_ key: String) -> Bool

    @JavaStaticMethod
    func remove(_ key: String) -> Bool
}

@JavaClass("dev.smoores.storyteller.platform.LiveSyncNsdBridge")
open class JavaLiveSyncNsdBridge: JavaObject {}

extension JavaClass<JavaLiveSyncNsdBridge> {
    @JavaStaticMethod
    func start(_ instanceID: String, _ port: Int32)

    @JavaStaticMethod
    func stop()
}

/// Peers arrive from Kotlin via the liveSyncPeerFound/liveSyncPeerLost
/// bridge entry points.
final class AndroidNsdPeerDiscovery: LiveSyncPeerDiscovering, @unchecked Sendable {
    static let shared = AndroidNsdPeerDiscovery()

    private let callbacks = Mutex<
        (
            found: (@Sendable (String, String, UInt16) -> Void)?,
            lost: (@Sendable (String) -> Void)?
        )
    >((nil, nil))

    func start(
        instanceID: String,
        port: UInt16,
        onPeerFound: @escaping @Sendable (String, String, UInt16) -> Void,
        onPeerLost: @escaping @Sendable (String) -> Void,
    ) {
        callbacks.withLock { $0 = (onPeerFound, onPeerLost) }
        do {
            let bridge = try JavaClass<JavaLiveSyncNsdBridge>()
            bridge.start(instanceID, Int32(port))
        } catch {
            debugLog("[LiveSync] Failed to start NSD bridge: \(error)")
        }
    }

    func stop() {
        callbacks.withLock { $0 = (nil, nil) }
        do {
            let bridge = try JavaClass<JavaLiveSyncNsdBridge>()
            bridge.stop()
        } catch {
            debugLog("[LiveSync] Failed to stop NSD bridge: \(error)")
        }
    }

    func handlePeerFound(id: String, host: String, port: UInt16) {
        callbacks.withLock { $0.found }?(id, host, port)
    }

    func handlePeerLost(id: String) {
        callbacks.withLock { $0.lost }?(id)
    }
}

@JavaClass("dev.smoores.storyteller.bridge.AndroidBridgeCallbacks")
open class JavaAndroidBridgeCallbacks: JavaObject {}

extension JavaClass<JavaAndroidBridgeCallbacks> {
    @JavaStaticMethod
    func librarySnapshotDidChange()

    @JavaStaticMethod
    func bridgeRequestDidComplete(_ requestID: String, _ payload: String, _ error: String)

    @JavaStaticMethod
    func audiobookStateDidChange(_ payload: String)

    @JavaStaticMethod
    func downloadStateDidChange(_ payload: String)

    @JavaStaticMethod
    func sourceStatusDidChange(_ payload: String)

    @JavaStaticMethod
    func coverColorsNeeded(_ bookID: String, _ sourceID: String, _ audio: Bool)

    @JavaStaticMethod
    func coverRequestDidComplete(
        _ requestID: String,
        _ data: [UInt8],
        _ shouldPersist: Bool,
        _ error: String,
    )

    @JavaStaticMethod
    func bytesRequestDidComplete(
        _ requestID: String,
        _ data: [UInt8],
        _ error: String,
    )

    @JavaStaticMethod
    func evaluateReaderJS(_ requestID: String, _ script: String)

    @JavaStaticMethod
    func readerStateDidChange(_ payload: String)

    @JavaStaticMethod
    func sessionStateDidChange(_ payload: String)
}

enum AndroidPlatformBootstrap {
    private static let bootstrappedDirectory = Mutex<URL?>(nil)

    static func bootstrap(filesDirectory: String) throws {
        let directory = URL(fileURLWithPath: filesDirectory, isDirectory: true)
            .standardizedFileURL

        try bootstrappedDirectory.withLock { bootstrappedDirectory in
            if let bootstrappedDirectory {
                guard bootstrappedDirectory == directory else {
                    throw AndroidBridgeError.alreadyBootstrapped(
                        existing: bootstrappedDirectory.path,
                        requested: directory.path,
                    )
                }
                return
            }

            StorytellerPlatform.bootstrap(
                audioPlayerFactory: AndroidAudioPlayerFactory(),
                nowPlaying: AndroidNowPlayingPresenter.shared,
                keychain: AndroidKeychainStore(),
                applicationStorage: AndroidApplicationStorageProvider(
                    applicationSupportDirectory: directory
                ),
                liveSyncDiscovery: AndroidNsdPeerDiscovery.shared,
            )
            bootstrappedDirectory = directory
        }
    }

    static var isBootstrapped: Bool {
        bootstrappedDirectory.withLock { $0 != nil }
    }
}

struct AndroidApplicationStorageProvider: ApplicationStorageProviding {
    let applicationSupportDirectory: URL
}

final class AndroidKeychainStore: KeychainStoring, @unchecked Sendable {
    func setItem(_ data: Data, account: String) throws {
        let storage = try JavaClass<JavaAndroidSecureStore>()
        guard storage.store(account, data.base64EncodedString()) else {
            throw AndroidBridgeError.secureStorageFailure(account)
        }
    }

    func item(account: String) throws -> Data? {
        let storage = try JavaClass<JavaAndroidSecureStore>()
        let encoded = storage.load(account)
        if encoded.isEmpty {
            return storage.contains(account) ? Data() : nil
        }
        guard let data = Data(base64Encoded: encoded) else {
            throw KeychainError.invalidData
        }
        return data
    }

    func removeItem(account: String) throws {
        let storage = try JavaClass<JavaAndroidSecureStore>()
        guard storage.remove(account) else {
            throw AndroidBridgeError.secureStorageFailure(account)
        }
    }
}

func notifyAndroidLibrarySnapshotDidChange() {
    try? JavaClass<JavaAndroidBridgeCallbacks>().librarySnapshotDidChange()
}

func notifyAndroidCoverColorsNeeded(bookID: String, sourceID: String, audio: Bool) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().coverColorsNeeded(bookID, sourceID, audio)
}

func notifyAndroidAudiobookStateDidChange(_ payload: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().audiobookStateDidChange(payload)
}

func notifyAndroidDownloadStateDidChange(_ payload: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().downloadStateDidChange(payload)
}

func notifyAndroidSourceStatusDidChange(_ payload: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().sourceStatusDidChange(payload)
}

func notifyAndroidEvaluateReaderJS(requestID: String, script: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().evaluateReaderJS(requestID, script)
}

func notifyAndroidReaderStateDidChange(_ payload: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().readerStateDidChange(payload)
}

func notifyAndroidSessionDidChange(_ payload: String) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().sessionStateDidChange(payload)
}

func deliverAndroidCoverPayload(
    requestID: String,
    data: Data,
    shouldPersist: Bool,
) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().coverRequestDidComplete(
        requestID,
        [UInt8](data),
        shouldPersist,
        "",
    )
}

func deliverAndroidCoverError(requestID: String, error: Error) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().coverRequestDidComplete(
        requestID,
        [],
        false,
        String(describing: error),
    )
}

func deliverAndroidBytesPayload(requestID: String, data: Data) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().bytesRequestDidComplete(
        requestID,
        [UInt8](data),
        "",
    )
}

func deliverAndroidBytesError(requestID: String, error: Error) {
    try? JavaClass<JavaAndroidBridgeCallbacks>().bytesRequestDidComplete(
        requestID,
        [],
        String(describing: error),
    )
}

func deliverAndroidBridgePayload(
    requestID: String,
    operation: () async throws -> String,
) async throws {
    // swift-java 0.4.2 retains async String refs; upcalls release them in a local frame.
    let payload: String
    do {
        payload = try await operation()
    } catch {
        try JavaClass<JavaAndroidBridgeCallbacks>().bridgeRequestDidComplete(
            requestID,
            "",
            String(describing: error),
        )
        return
    }
    try JavaClass<JavaAndroidBridgeCallbacks>().bridgeRequestDidComplete(requestID, payload, "")
}
