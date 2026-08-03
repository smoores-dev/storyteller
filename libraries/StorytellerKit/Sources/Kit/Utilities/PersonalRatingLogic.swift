import Foundation

public enum PersonalRatingLogic {
    public static func snapToHalf(_ value: Double) -> Double {
        let clamped = min(max(value, 0), 5)
        return (clamped * 2).rounded() / 2
    }

    public static func seedScores(
        for dimensions: [RatingDimension],
        from rating: Double?,
    ) -> [String: Double] {
        let seed = snapToHalf(rating ?? 0)
        return Dictionary(uniqueKeysWithValues: dimensions.map { ($0.id, seed) })
    }

    /// Stored scores can carry ids the preferred list dropped; they are appended so no
    /// stored value becomes invisible and unclearable.
    public static func displayDimensions(
        preferred: [RatingDimension]?,
        existingScores: [String: Double]?,
    ) -> [RatingDimension] {
        var list = preferred?.isEmpty == false ? preferred! : RatingDimension.defaultDimensions
        let known = Set(list.map(\.id))
        let extras = (existingScores ?? [:]).keys
            .filter { !known.contains($0) }
            .sorted()
        list.append(contentsOf: extras.map { RatingDimension(id: $0, label: $0) })
        return list
    }

    /// Dimensions sent without a rating key make the server recompute the star rating from
    /// their average, so a manual star edit must include the rating key to survive.
    public static func buildUpdate(
        starsEdited: Bool,
        stars: Double?,
        sendDimensions: Bool,
        dimensions: [String: Double]?,
        reviewChanged: Bool,
        review: String,
    ) -> UserBookRatingUpdate? {
        var update = UserBookRatingUpdate()
        if sendDimensions {
            if let dimensions, !dimensions.isEmpty {
                update.dimensions = .value(dimensions)
            } else {
                update.dimensions = .null
            }
        }
        if starsEdited, let stars {
            update.rating = .value(stars)
        }
        if reviewChanged {
            update.review = review.isEmpty ? .null : .value(review)
        }
        guard update.rating != nil || update.review != nil || update.dimensions != nil else {
            return nil
        }
        return update
    }

    public static func reviewerDisplayName(_ login: String?) -> String? {
        guard let login = login?.trimmingCharacters(in: .whitespacesAndNewlines),
            !login.isEmpty
        else { return nil }
        guard let atIndex = login.firstIndex(of: "@"), atIndex != login.startIndex else {
            return login
        }
        return String(login[..<atIndex])
    }

    public static func hasProvidedValue(_ update: UserBookRatingUpdate) -> Bool {
        if case .value? = update.rating { return true }
        if case .value? = update.review { return true }
        if case .value? = update.dimensions { return true }
        return false
    }

    /// The server rejects a PUT whose provided keys are all null, so an all-null update must
    /// re-assert a value that survives the clear. Returns nil when nothing survives and the
    /// row should be deleted instead.
    public static func resolveAllNullUpdate(
        _ update: UserBookRatingUpdate,
        currentRating: Double?,
        currentReview: String?,
        currentDimensions: [String: Double]?,
    ) -> UserBookRatingUpdate? {
        var update = update
        if let currentRating {
            update.rating = .value(currentRating)
        } else if update.review == nil, let currentReview {
            update.review = .value(currentReview)
        } else if update.dimensions == nil, let currentDimensions, !currentDimensions.isEmpty {
            update.dimensions = .value(currentDimensions)
        } else {
            return nil
        }
        return update
    }
}
