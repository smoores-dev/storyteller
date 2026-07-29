import Foundation

public struct UserShelfBook: Codable, Sendable, Hashable {
    public let bookUuid: String
    public let position: Int?

    public init(bookUuid: String, position: Int?) {
        self.bookUuid = bookUuid
        self.position = position
    }
}

public struct UserShelf: Codable, Sendable, Hashable {
    public let uuid: String
    public let userId: String?
    public let name: String
    public let description: String?
    public let filter: JSONValue?
    public let orderBy: String
    public let orderDirection: String
    public let limitCount: Int?
    public let icon: String?
    public let color: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let books: [UserShelfBook]

    public init(
        uuid: String,
        userId: String?,
        name: String,
        description: String?,
        filter: JSONValue?,
        orderBy: String,
        orderDirection: String,
        limitCount: Int?,
        icon: String?,
        color: String?,
        createdAt: String?,
        updatedAt: String?,
        books: [UserShelfBook],
    ) {
        self.uuid = uuid
        self.userId = userId
        self.name = name
        self.description = description
        self.filter = filter
        self.orderBy = orderBy
        self.orderDirection = orderDirection
        self.limitCount = limitCount
        self.icon = icon
        self.color = color
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.books = books
    }

    private enum CodingKeys: String, CodingKey {
        case uuid, userId, name, description, filter, orderBy, orderDirection
        case limitCount, icon, color, createdAt, updatedAt, books
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = try container.decode(String.self, forKey: .uuid)
        name = (try? container.decode(String.self, forKey: .name)) ?? ""
        userId = container.decodeLenient(String.self, forKey: .userId)
        description = container.decodeLenient(String.self, forKey: .description)
        let rawFilter = container.decodeLenient(JSONValue.self, forKey: .filter)
        filter = rawFilter?.isNull == true ? nil : rawFilter
        orderBy = container.decodeLenient(String.self, forKey: .orderBy) ?? "createdAt"
        orderDirection = container.decodeLenient(String.self, forKey: .orderDirection) ?? "desc"
        limitCount = container.decodeLenient(Int.self, forKey: .limitCount)
        icon = container.decodeLenient(String.self, forKey: .icon)
        color = container.decodeLenient(String.self, forKey: .color)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)
        books = container.decodeLenient([UserShelfBook].self, forKey: .books) ?? []
    }
}

public struct UserShelfCreatePayload: Encodable, Sendable {
    public var name: String
    public var description: String?
    public var filter: JSONValue?
    public var orderBy: String?
    public var orderDirection: String?
    public var limitCount: Int?
    public var books: [String]?
    public var icon: String?
    public var color: String?

    public init(name: String) {
        self.name = name
    }
}

// PATCH semantics: only keys present in the body are applied, and books, when present,
// replaces the whole manual list.
public struct UserShelfUpdatePayload: Encodable, Sendable {
    public var name: String?
    public var description: NullableField<String>?
    public var filter: NullableField<JSONValue>?
    public var orderBy: String?
    public var orderDirection: String?
    public var limitCount: NullableField<Int>?
    public var icon: NullableField<String>?
    public var color: NullableField<String>?
    public var books: [String]?

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case name, description, filter, orderBy, orderDirection, limitCount, icon, color, books
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeTriState(description, forKey: .description)
        try container.encodeTriState(filter, forKey: .filter)
        try container.encodeIfPresent(orderBy, forKey: .orderBy)
        try container.encodeIfPresent(orderDirection, forKey: .orderDirection)
        try container.encodeTriState(limitCount, forKey: .limitCount)
        try container.encodeTriState(icon, forKey: .icon)
        try container.encodeTriState(color, forKey: .color)
        try container.encodeIfPresent(books, forKey: .books)
    }
}
