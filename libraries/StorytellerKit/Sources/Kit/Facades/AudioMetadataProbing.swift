import Foundation

public struct ProbedAudioChapter: Sendable {
    public var title: String?
    public var start: TimeInterval
    public var duration: TimeInterval

    public init(title: String?, start: TimeInterval, duration: TimeInterval) {
        self.title = title
        self.start = start
        self.duration = duration
    }
}

public protocol AudioMetadataProbing: Sendable {
    func duration(of url: URL) async throws -> TimeInterval
    func chapters(of url: URL) async throws -> [ProbedAudioChapter]
}
