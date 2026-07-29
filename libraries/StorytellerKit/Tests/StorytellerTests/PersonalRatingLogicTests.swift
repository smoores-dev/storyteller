import Foundation
import Testing

@testable import StorytellerAppleKit
@testable import StorytellerKit

@Test func snapToHalfClampsAndRounds() {
    #expect(PersonalRatingLogic.snapToHalf(-1) == 0)
    #expect(PersonalRatingLogic.snapToHalf(0) == 0)
    #expect(PersonalRatingLogic.snapToHalf(2.24) == 2)
    #expect(PersonalRatingLogic.snapToHalf(2.25) == 2.5)
    #expect(PersonalRatingLogic.snapToHalf(2.74) == 2.5)
    #expect(PersonalRatingLogic.snapToHalf(2.76) == 3)
    #expect(PersonalRatingLogic.snapToHalf(4.8) == 5)
    #expect(PersonalRatingLogic.snapToHalf(7) == 5)
}

@Test func seedScoresUsesSnappedStarRatingForEveryDimension() {
    let scores = PersonalRatingLogic.seedScores(
        for: RatingDimension.defaultDimensions,
        from: 3.7,
    )
    #expect(scores.count == RatingDimension.defaultDimensions.count)
    #expect(scores.values.allSatisfy { $0 == 3.5 })
    #expect(Set(scores.keys) == Set(RatingDimension.defaultDimensions.map(\.id)))
}

@Test func seedScoresWithoutRatingSeedsZero() {
    let scores = PersonalRatingLogic.seedScores(
        for: [RatingDimension(id: "plot", label: "Plot")],
        from: nil,
    )
    #expect(scores == ["plot": 0])
}

@Test func displayDimensionsFallsBackToDefaultsAndKeepsStoredExtras() {
    let fromDefaults = PersonalRatingLogic.displayDimensions(
        preferred: nil,
        existingScores: nil,
    )
    #expect(fromDefaults == RatingDimension.defaultDimensions)

    let emptyPreferred = PersonalRatingLogic.displayDimensions(
        preferred: [],
        existingScores: nil,
    )
    #expect(emptyPreferred == RatingDimension.defaultDimensions)

    let custom = [
        RatingDimension(id: "pacing", label: "Pacing"),
        RatingDimension(id: "prose", label: "Prose"),
    ]
    let merged = PersonalRatingLogic.displayDimensions(
        preferred: custom,
        existingScores: ["prose": 4, "world_building": 3, "atmosphere": 5],
    )
    #expect(merged.map(\.id) == ["pacing", "prose", "atmosphere", "world_building"])
    #expect(merged.last?.label == "world_building")
}

@Test func reviewerDisplayNameStripsEmailDomain() {
    #expect(PersonalRatingLogic.reviewerDisplayName("kyonifer") == "kyonifer")
    #expect(PersonalRatingLogic.reviewerDisplayName("kyle.j@example.com") == "kyle.j")
    #expect(PersonalRatingLogic.reviewerDisplayName("  kyle@example.com  ") == "kyle")
    #expect(PersonalRatingLogic.reviewerDisplayName("@example.com") == "@example.com")
    #expect(PersonalRatingLogic.reviewerDisplayName("") == nil)
    #expect(PersonalRatingLogic.reviewerDisplayName(nil) == nil)
}

private func encodedKeys(_ update: UserBookRatingUpdate) throws -> [String: Any] {
    let data = try JSONEncoder().encode(update)
    let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    return object ?? [:]
}

@Test func buildUpdateWithNoChangesReturnsNil() {
    let update = PersonalRatingLogic.buildUpdate(
        starsEdited: false,
        stars: 4,
        sendDimensions: false,
        dimensions: ["plot": 3],
        reviewChanged: false,
        review: "text",
    )
    #expect(update == nil)
}

@Test func buildUpdateStarsOnlyOmitsDimensions() throws {
    let update = PersonalRatingLogic.buildUpdate(
        starsEdited: true,
        stars: 4.5,
        sendDimensions: false,
        dimensions: nil,
        reviewChanged: false,
        review: "",
    )
    let keys = try encodedKeys(#require(update))
    #expect(keys["rating"] as? Double == 4.5)
    #expect(keys["dimensions"] == nil)
    #expect(keys["review"] == nil)
}

@Test func buildUpdateDimensionsWithoutStarEditOmitsRatingKey() throws {
    let update = PersonalRatingLogic.buildUpdate(
        starsEdited: false,
        stars: 4,
        sendDimensions: true,
        dimensions: ["plot": 3, "prose": 5],
        reviewChanged: false,
        review: "",
    )
    let keys = try encodedKeys(#require(update))
    #expect(keys["rating"] == nil)
    #expect((keys["dimensions"] as? [String: Double]) == ["plot": 3, "prose": 5])
}

@Test func buildUpdateRemovedDimensionsEncodeAsNull() throws {
    let update = PersonalRatingLogic.buildUpdate(
        starsEdited: false,
        stars: nil,
        sendDimensions: true,
        dimensions: nil,
        reviewChanged: false,
        review: "",
    )
    let keys = try encodedKeys(#require(update))
    #expect(keys["dimensions"] is NSNull)
}

@Test func buildUpdateEmptyReviewEncodesAsNull() throws {
    let update = PersonalRatingLogic.buildUpdate(
        starsEdited: false,
        stars: nil,
        sendDimensions: false,
        dimensions: nil,
        reviewChanged: true,
        review: "",
    )
    let keys = try encodedKeys(#require(update))
    #expect(keys["review"] is NSNull)

    let withText = PersonalRatingLogic.buildUpdate(
        starsEdited: false,
        stars: nil,
        sendDimensions: false,
        dimensions: nil,
        reviewChanged: true,
        review: "Loved it",
    )
    let textKeys = try encodedKeys(#require(withText))
    #expect(textKeys["review"] as? String == "Loved it")
}

@Test func allNullReviewClearReassertsSurvivingRating() throws {
    let update = try #require(
        PersonalRatingLogic.buildUpdate(
            starsEdited: false,
            stars: nil,
            sendDimensions: false,
            dimensions: nil,
            reviewChanged: true,
            review: "",
        )
    )
    #expect(!PersonalRatingLogic.hasProvidedValue(update))

    let resolved = try #require(
        PersonalRatingLogic.resolveAllNullUpdate(
            update,
            currentRating: 4,
            currentReview: "old review",
            currentDimensions: nil,
        )
    )
    let keys = try encodedKeys(resolved)
    #expect(keys["rating"] as? Double == 4)
    #expect(keys["review"] is NSNull)
}

@Test func allNullDimensionClearFallsBackToSurvivingReview() throws {
    let update = try #require(
        PersonalRatingLogic.buildUpdate(
            starsEdited: false,
            stars: nil,
            sendDimensions: true,
            dimensions: nil,
            reviewChanged: false,
            review: "",
        )
    )
    let resolved = try #require(
        PersonalRatingLogic.resolveAllNullUpdate(
            update,
            currentRating: nil,
            currentReview: "kept review",
            currentDimensions: ["plot": 3],
        )
    )
    let keys = try encodedKeys(resolved)
    #expect(keys["review"] as? String == "kept review")
    #expect(keys["dimensions"] is NSNull)
}

@Test func allNullUpdateWithNothingSurvivingRequestsDeletion() throws {
    let update = try #require(
        PersonalRatingLogic.buildUpdate(
            starsEdited: false,
            stars: nil,
            sendDimensions: true,
            dimensions: nil,
            reviewChanged: true,
            review: "",
        )
    )
    let resolved = PersonalRatingLogic.resolveAllNullUpdate(
        update,
        currentRating: nil,
        currentReview: "being cleared",
        currentDimensions: ["plot": 3],
    )
    #expect(resolved == nil)
}

@Test func updateWithValueKeyNeedsNoResolution() throws {
    let update = try #require(
        PersonalRatingLogic.buildUpdate(
            starsEdited: true,
            stars: 3,
            sendDimensions: false,
            dimensions: nil,
            reviewChanged: true,
            review: "",
        )
    )
    #expect(PersonalRatingLogic.hasProvidedValue(update))
}

