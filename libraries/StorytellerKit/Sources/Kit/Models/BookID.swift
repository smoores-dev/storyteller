/// Globally unique identity for a library entry.
///
/// A book UUID is only unique inside one source. Cross-source state must use this
/// composite identity and pass the raw UUID to a provider only after selecting its source.
public struct BookID: Codable, Hashable, Sendable {
    public let sourceID: BookSourceID
    public let uuid: String

    public init(sourceID: BookSourceID, uuid: String) {
        self.sourceID = sourceID
        self.uuid = uuid
    }
}

extension BookID: CustomStringConvertible {
    public var description: String { "\(sourceID)/\(uuid)" }
}

extension BookID: Comparable {
    public static func < (lhs: BookID, rhs: BookID) -> Bool {
        (lhs.uuid, lhs.sourceID) < (rhs.uuid, rhs.sourceID)
    }
}
