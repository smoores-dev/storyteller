import StorytellerKit
import SwiftUI

public struct PlayerBookData: Codable, Hashable, Sendable {
    public let metadata: BookMetadata
    public let localMediaPath: URL?
    public let category: LocalMediaCategory
    public var coverArt: Image?
    public var ebookCoverArt: Image?

    enum CodingKeys: String, CodingKey {
        case metadata
        case localMediaPath
        case category
    }

    public init(
        metadata: BookMetadata,
        localMediaPath: URL?,
        category: LocalMediaCategory,
        coverArt: Image? = nil,
        ebookCoverArt: Image? = nil,
    ) {
        self.metadata = metadata
        self.localMediaPath = localMediaPath
        self.category = category
        self.coverArt = coverArt
        self.ebookCoverArt = ebookCoverArt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        metadata = try container.decode(BookMetadata.self, forKey: .metadata)
        localMediaPath = try container.decodeIfPresent(URL.self, forKey: .localMediaPath)
        category = try container.decode(LocalMediaCategory.self, forKey: .category)
        coverArt = nil
        ebookCoverArt = nil
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(metadata, forKey: .metadata)
        try container.encodeIfPresent(localMediaPath, forKey: .localMediaPath)
        try container.encode(category, forKey: .category)
    }

    public func hash(into hasher: inout Hasher) {
        // WindowGroup uses this value to find an existing player window. BookMetadata
        // contains mutable fields such as position and status, so hashing all of it
        // causes a deep link to open a duplicate window after those fields change.
        hasher.combine(metadata.id)
        hasher.combine(localMediaPath)
        hasher.combine(category)
    }

    public static func == (lhs: PlayerBookData, rhs: PlayerBookData) -> Bool {
        lhs.metadata.id == rhs.metadata.id
            && lhs.localMediaPath == rhs.localMediaPath
            && lhs.category == rhs.category
    }
}
