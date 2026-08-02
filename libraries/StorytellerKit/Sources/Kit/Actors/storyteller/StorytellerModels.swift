import Foundation

struct AccessToken: Decodable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int64?
}
public struct StorytellerCollectionUser: Codable, Sendable {
    public let id: String
    public let email: String?
    public let username: String?
}

public struct StorytellerCollection: Decodable, Sendable {
    public let uuid: String
    public let name: String
    public let description: String?
    public let isPublic: Bool
    public let importPath: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let users: [StorytellerCollectionUser]?

    private enum CodingKeys: String, CodingKey {
        case uuid
        case name
        case description
        case isPublic = "public"
        case importPath
        case createdAt
        case updatedAt
        case users
    }
}

public struct StorytellerCoverUpload: Sendable {
    public let filename: String
    public let data: Data
    public let contentType: String?

    public init(filename: String, data: Data, contentType: String?) {
        self.filename = filename
        self.data = data
        self.contentType = contentType
    }
}

public struct StorytellerCreatorRelationUpdate: Codable, Sendable {
    public let uuid: String?
    public let id: Int?
    public let name: String
    public let fileAs: String
    public let role: String?

    public init(uuid: String?, id: Int?, name: String, fileAs: String, role: String?) {
        self.uuid = uuid
        self.id = id
        self.name = name
        self.fileAs = fileAs
        self.role = role
    }
}

public struct StorytellerSeriesRelationUpdate: Codable, Sendable {
    public let uuid: String?
    public let name: String
    public let featured: Bool?
    public let position: Double?

    public init(uuid: String?, name: String, featured: Bool?, position: Double?) {
        self.uuid = uuid
        self.name = name
        self.featured = featured
        self.position = position
    }
}

struct StorytellerBookAssetRelationUpdate: Codable {
    let filepath: String?
    let missing: Int?
}

struct StorytellerReadaloudRelationUpdate: Codable {
    let filepath: String?
    let missing: Int?
    let status: String?
    let currentStage: String?
    let stageProgress: Double?
    let queuePosition: Int?
    let restartPending: Int?
}

struct StorytellerStatusRelationUpdate: Codable {
    let statusUuid: String
    let userId: String?
}

struct StorytellerBookRelationsUpdatePayload: Codable {
    var creators: [StorytellerCreatorRelationUpdate]?
    var series: [StorytellerSeriesRelationUpdate]?
    var collections: [String]?
    var tags: [String]?
    var ebook: StorytellerBookAssetRelationUpdate?
    var audiobook: StorytellerBookAssetRelationUpdate?
    var readaloud: StorytellerReadaloudRelationUpdate?
    var books: [String]?
    var status: StorytellerStatusRelationUpdate?
}

struct StorytellerBookMergeUpdate: Codable {
    var title: String?
    var subtitle: String?
    var language: String?
    var publicationDate: String?
    var description: String?
    var rating: Double?
}

public struct StorytellerBookUpdatePayload: Sendable {
    public let uuid: String
    public var title: String?
    public var subtitle: String?
    public var language: String?
    public var publicationDate: NullableField<String>?
    public var description: String?
    public var status: String?
    public var authors: [String]?
    public var narrators: [String]?
    public var creators: [StorytellerCreatorRelationUpdate]?
    public var series: [StorytellerSeriesRelationUpdate]?
    public var collections: [String]?
    public var tags: [String]?

    public init(uuid: String) {
        self.uuid = uuid
    }
}

public struct StorytellerCollectionCreatePayload: Codable, Sendable {
    public let name: String
    public let description: String
    public let isPublic: Bool
    public let users: [String]?

    public init(name: String, description: String, isPublic: Bool, users: [String]?) {
        self.name = name
        self.description = description
        self.isPublic = isPublic
        self.users = users
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case description
        case isPublic = "public"
        case users
    }
}

struct StorytellerCollectionUpdatePayload: Codable, Sendable {
    var name: String?
    var description: String?
    var isPublic: Bool?
    var users: [String]?

    private enum CodingKeys: String, CodingKey {
        case name
        case description
        case isPublic = "public"
        case users
    }
}

enum StorytellerDownloadEvent: Sendable {
    case response(
        filename: String,
        expectedBytes: Int64?,
        contentType: String?,
        etag: String?,
        lastModified: String?,
    )
    case progress(receivedBytes: Int64, expectedBytes: Int64?)
    case finished(temporaryURL: URL)
}

enum StorytellerDownloadFailure: Error, Sendable {
    case nonHTTPResponse
    case unauthorized
    case notFound
    case unexpectedStatus(Int)
}

struct StorytellerBookDownload: Sendable {
    let initialFilename: String
    let events: AsyncThrowingStream<StorytellerDownloadEvent, Error>
    let cancel: @Sendable () -> Void
}

public enum StorytellerBookFormat: String, Sendable {
    case ebook
    case audiobook
    case readaloud
}

public struct StorytellerUploadAsset: Sendable {
    public let format: StorytellerBookFormat
    public let filename: String
    public let data: Data
    public let contentType: String?
    public let relativePath: String?

    public init(
        format: StorytellerBookFormat,
        filename: String,
        data: Data,
        contentType: String? = nil,
        relativePath: String? = nil,
    ) {
        self.format = format
        self.filename = filename
        self.data = data
        self.contentType = contentType
        self.relativePath = relativePath
    }
}
