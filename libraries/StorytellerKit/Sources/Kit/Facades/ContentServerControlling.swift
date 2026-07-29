import Foundation

/// Runtime configuration for the embedded content server.
public struct ContentServerConfiguration: Sendable {
    public var port: Int
    public var username: String
    public var password: String
    /// The folder source whose books are served. When nil, the first local folder source is used.
    public var sourceID: BookSourceID?

    public init(
        port: Int = 8088,
        username: String,
        password: String,
        sourceID: BookSourceID? = nil,
    ) {
        self.port = port
        self.username = username
        self.password = password
        self.sourceID = sourceID
    }
}

public struct ContentServerStartInfo: Sendable {
    public let port: Int
    public let sourceID: BookSourceID

    public init(port: Int, sourceID: BookSourceID) {
        self.port = port
        self.sourceID = sourceID
    }
}

public enum ContentServerError: Error, Sendable {
    case alreadyRunning
    case noFolderSource
    case sourceNotFound
}

/// Protocol for the embedded LAN content server. The Hummingbird-backed implementation
/// lives in the StorytellerContentServer satellite; the app shell injects it via
/// StorytellerEnvironment. UI hides the feature when no implementation is injected.
public protocol ContentServerControlling: Sendable {
    var isRunning: Bool { get async }
    func start(_ configuration: ContentServerConfiguration) async throws -> ContentServerStartInfo
    func stop() async
}
