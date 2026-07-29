import Foundation

public struct RatingDimension: Codable, Sendable, Hashable {
    public let id: String
    public let label: String

    public init(id: String, label: String) {
        self.id = id
        self.label = label
    }

    public static let defaultDimensions: [RatingDimension] = [
        RatingDimension(id: "plot", label: "Plot"),
        RatingDimension(id: "personal", label: "Personal"),
        RatingDimension(id: "pleasure", label: "Pleasure"),
        RatingDimension(id: "purpose", label: "Purpose"),
        RatingDimension(id: "prose", label: "Prose"),
    ]

    public static let scoreMinimum: Double = 0
    public static let scoreMaximum: Double = 5
}

extension UserBookRating {
    public static func average(of scores: [String: Double]?) -> Double? {
        guard let scores else { return nil }
        let valid = scores.values.filter { value in
            value.isFinite
                && value >= RatingDimension.scoreMinimum
                && value <= RatingDimension.scoreMaximum
        }
        guard !valid.isEmpty else { return nil }
        let mean = valid.reduce(0, +) / Double(valid.count)
        return (mean * 100).rounded() / 100
    }

    public static func format(_ value: Double) -> String {
        var formatted = String(format: "%.2f", value)
        while formatted.contains("."), formatted.hasSuffix("0") {
            formatted.removeLast()
        }
        if formatted.hasSuffix(".") {
            formatted.removeLast()
        }
        return formatted
    }

    public static func isManualOverride(rating: Double?, average: Double?) -> Bool {
        guard let rating, let average else { return false }
        return abs(rating - average) > 0.01
    }
}

public struct UserBookRating: Codable, Sendable, Hashable {
    public let uuid: String
    public let userId: String?
    public let bookUuid: String
    public let rating: Double?
    public let review: String?
    public let dimensions: [String: Double]?
    public let createdAt: String?
    public let updatedAt: String?

    public init(
        uuid: String,
        userId: String?,
        bookUuid: String,
        rating: Double?,
        review: String?,
        dimensions: [String: Double]?,
        createdAt: String? = nil,
        updatedAt: String? = nil,
    ) {
        self.uuid = uuid
        self.userId = userId
        self.bookUuid = bookUuid
        self.rating = rating
        self.review = review
        self.dimensions = dimensions
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case uuid, userId, bookUuid, rating, review, dimensions, createdAt, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        uuid = try container.decode(String.self, forKey: .uuid)
        bookUuid = try container.decode(String.self, forKey: .bookUuid)
        userId = container.decodeLenient(String.self, forKey: .userId)
        rating = container.decodeLenient(Double.self, forKey: .rating)
        review = container.decodeLenient(String.self, forKey: .review)
        createdAt = container.decodeLenient(String.self, forKey: .createdAt)
        updatedAt = container.decodeLenient(String.self, forKey: .updatedAt)

        if let parsed = container.decodeLenient([String: Double].self, forKey: .dimensions) {
            dimensions = parsed
        } else if let raw = container.decodeLenient(String.self, forKey: .dimensions),
            let data = raw.data(using: .utf8),
            let parsed = try? JSONDecoder().decode([String: Double].self, from: data)
        {
            dimensions = parsed
        } else {
            dimensions = nil
        }
    }
}

// The server only writes keys present in the body, so absent, null, and value are three
// distinct states. Dimensions without a rating key makes the server recompute the rating
// from their average, discarding any manual override.
public struct UserBookRatingUpdate: Encodable, Sendable {
    public var rating: NullableField<Double>?
    public var review: NullableField<String>?
    public var dimensions: NullableField<[String: Double]>?

    public init(
        rating: NullableField<Double>? = nil,
        review: NullableField<String>? = nil,
        dimensions: NullableField<[String: Double]>? = nil,
    ) {
        self.rating = rating
        self.review = review
        self.dimensions = dimensions
    }

    private enum CodingKeys: String, CodingKey {
        case rating, review, dimensions
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeTriState(rating, forKey: .rating)
        try container.encodeTriState(review, forKey: .review)
        try container.encodeTriState(dimensions, forKey: .dimensions)
    }
}

public enum UserBookRatingUpdateResult: Sendable {
    case saved(UserBookRating)
    case cleared
    case failed(message: String?)
}
