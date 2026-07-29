import Foundation
import Testing

@testable import StorytellerKit

private func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

private func encodeToJSONObject(_ value: some Encodable) throws -> [String: Any] {
    let data = try JSONEncoder().encode(value)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return try #require(object)
}

@Test func userBookRatingDecodesFullRow() throws {
    let json = """
        {
          "uuid": "6a1f2c3d-0000-4000-8000-000000000001",
          "userId": "9b8c7d6e-0000-4000-8000-000000000002",
          "bookUuid": "5e4d3c2b-0000-4000-8000-000000000003",
          "rating": 4.8,
          "review": "Loved it.",
          "dimensions": { "plot": 5, "personal": 4, "prose_style": 5 },
          "createdAt": "2026-07-01 12:00:00",
          "updatedAt": "2026-07-02 08:30:00"
        }
        """
    let rating = try decode(UserBookRating.self, from: json)
    #expect(rating.uuid == "6a1f2c3d-0000-4000-8000-000000000001")
    #expect(rating.bookUuid == "5e4d3c2b-0000-4000-8000-000000000003")
    #expect(rating.rating == 4.8)
    #expect(rating.review == "Loved it.")
    #expect(rating.dimensions == ["plot": 5, "personal": 4, "prose_style": 5])
    #expect(rating.createdAt == "2026-07-01 12:00:00")
}

@Test func userBookRatingDecodesWithoutDimensionsAndWithNulls() throws {
    let json = """
        {
          "uuid": "r-1",
          "userId": "u-1",
          "bookUuid": "b-1",
          "rating": null,
          "review": "Review only",
          "dimensions": null,
          "createdAt": "2026-07-01 12:00:00",
          "updatedAt": "2026-07-01 12:00:00"
        }
        """
    let rating = try decode(UserBookRating.self, from: json)
    #expect(rating.rating == nil)
    #expect(rating.review == "Review only")
    #expect(rating.dimensions == nil)
}

@Test func userBookRatingDecodesDimensionsSentAsJSONString() throws {
    let json = """
        {
          "uuid": "r-2",
          "bookUuid": "b-2",
          "rating": 3,
          "dimensions": "{\\"plot\\": 3, \\"prose\\": 4}"
        }
        """
    let rating = try decode(UserBookRating.self, from: json)
    #expect(rating.dimensions == ["plot": 3, "prose": 4])
}

@Test func ratingUpdateEncodesOnlyPresentKeys() throws {
    let update = UserBookRatingUpdate(rating: .value(4.5))
    let object = try encodeToJSONObject(update)
    #expect(object.keys.sorted() == ["rating"])
    #expect(object["rating"] as? Double == 4.5)
}

@Test func ratingUpdateEncodesExplicitNulls() throws {
    let update = UserBookRatingUpdate(review: .null, dimensions: .null)
    let object = try encodeToJSONObject(update)
    #expect(object.keys.sorted() == ["dimensions", "review"])
    #expect(object["review"] is NSNull)
    #expect(object["dimensions"] is NSNull)
    #expect(object["rating"] == nil)
}

@Test func ratingUpdateEncodesDimensionsWithoutRatingForUseAverage() throws {
    let update = UserBookRatingUpdate(dimensions: .value(["plot": 5, "prose": 4]))
    let object = try encodeToJSONObject(update)
    #expect(object.keys.sorted() == ["dimensions"])
    let dimensions = try #require(object["dimensions"] as? [String: Double])
    #expect(dimensions == ["plot": 5, "prose": 4])
}

@Test func ratingUpdateEncodesManualOverrideAlongsideDimensions() throws {
    let update = UserBookRatingUpdate(
        rating: .value(5),
        dimensions: .value(["plot": 4, "prose": 4]),
    )
    let object = try encodeToJSONObject(update)
    #expect(object.keys.sorted() == ["dimensions", "rating"])
    #expect(object["rating"] as? Double == 5)
}

@Test func emptyRatingUpdateEncodesEmptyObject() throws {
    let object = try encodeToJSONObject(UserBookRatingUpdate())
    #expect(object.isEmpty)
}

@Test func defaultRatingDimensionsAreTheFivePs() {
    #expect(RatingDimension.defaultDimensions.map(\.id) == [
        "plot", "personal", "pleasure", "purpose", "prose",
    ])
}

@Test func computeRatingAverageEdgeCases() {
    #expect(UserBookRating.average(of: nil) == nil)
    #expect(UserBookRating.average(of: [:]) == nil)
    #expect(UserBookRating.average(of: ["a": 5, "b": 99]) == 5)
    #expect(UserBookRating.average(of: ["a": -1, "b": .infinity]) == nil)
    #expect(UserBookRating.average(of: ["plot": 5, "personal": 5, "prose": 4.5]) == 4.83)
    #expect(UserBookRating.average(of: ["plot": 5, "personal": 4]) == 4.5)
}

@Test func formatRatingStripsTrailingZeros() {
    #expect(UserBookRating.format(5.00) == "5")
    #expect(UserBookRating.format(4.80) == "4.8")
    #expect(UserBookRating.format(4.8333) == "4.83")
    #expect(UserBookRating.format(0) == "0")
    #expect(UserBookRating.format(3.05) == "3.05")
}

@Test func manualOverrideDetectionThreshold() {
    #expect(UserBookRating.isManualOverride(rating: nil, average: 4.5) == false)
    #expect(UserBookRating.isManualOverride(rating: 4.5, average: nil) == false)
    #expect(UserBookRating.isManualOverride(rating: 4.84, average: 4.83) == false)
    #expect(UserBookRating.isManualOverride(rating: 4.85, average: 4.83) == true)
    #expect(UserBookRating.isManualOverride(rating: 5, average: 4) == true)
}

@Test func bookRatingComesFromTheUsersOwnRatingRow() throws {
    let rated = """
        {
          "uuid": "book-uuid-1",
          "title": "A Book",
          "rating": 3,
          "userBookRating": {
            "rating": 4.5,
            "review": "Loved it.",
            "dimensions": { "plot": 5, "prose": 4 }
          }
        }
        """
    let noRow = """
        { "uuid": "book-uuid-1", "title": "A Book", "rating": 3 }
        """
    let reviewOnly = """
        {
          "uuid": "book-uuid-1",
          "title": "A Book",
          "userBookRating": { "rating": null, "review": "No stars, just words." }
        }
        """
    func rating(_ json: String) throws -> Double? {
        try decode(StorytellerBookMetadataPayload.self, from: json)
            .scoped(to: BookSourceID("src"))
            .rating
    }
    #expect(try rating(rated) == 4.5)
    #expect(try rating(noRow) == nil)
    #expect(try rating(reviewOnly) == nil)
}
