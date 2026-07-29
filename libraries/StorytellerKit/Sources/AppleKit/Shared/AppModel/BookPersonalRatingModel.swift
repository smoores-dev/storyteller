#if os(iOS) || os(macOS) || os(tvOS)
import Foundation
import Observation

enum PersonalRatingLogic {
    static func snapToHalf(_ value: Double) -> Double {
        let clamped = min(max(value, 0), 5)
        return (clamped * 2).rounded() / 2
    }

    static func seedScores(
        for dimensions: [RatingDimension],
        from rating: Double?,
    ) -> [String: Double] {
        let seed = snapToHalf(rating ?? 0)
        return Dictionary(uniqueKeysWithValues: dimensions.map { ($0.id, seed) })
    }

    /// Stored scores can carry ids the preferred list dropped; they are appended so no
    /// stored value becomes invisible and unclearable.
    static func displayDimensions(
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
    static func buildUpdate(
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

    static func reviewerDisplayName(_ login: String?) -> String? {
        guard let login = login?.trimmingCharacters(in: .whitespacesAndNewlines),
            !login.isEmpty
        else { return nil }
        guard let atIndex = login.firstIndex(of: "@"), atIndex != login.startIndex else {
            return login
        }
        return String(login[..<atIndex])
    }

    static func hasProvidedValue(_ update: UserBookRatingUpdate) -> Bool {
        if case .value? = update.rating { return true }
        if case .value? = update.review { return true }
        if case .value? = update.dimensions { return true }
        return false
    }

    /// The server rejects a PUT whose provided keys are all null, so an all-null update must
    /// re-assert a value that survives the clear. Returns nil when nothing survives and the
    /// row should be deleted instead.
    static func resolveAllNullUpdate(
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

@MainActor
@Observable
final class BookPersonalRatingModel {
    private(set) var bookID: BookID?
    private(set) var record: UserBookRating?
    private(set) var preferredDimensions: [RatingDimension]?
    private(set) var reviewerName: String?
    private(set) var isLoaded = false
    private(set) var isSaving = false
    private(set) var saveGeneration = 0
    var errorMessage: String?

    var starRating: Double? { record?.rating }

    var review: String? {
        guard let review = record?.review?.trimmingCharacters(in: .whitespacesAndNewlines),
            !review.isEmpty
        else { return nil }
        return review
    }

    var dimensions: [String: Double]? {
        guard let dimensions = record?.dimensions, !dimensions.isEmpty else { return nil }
        return dimensions
    }

    var dimensionAverage: Double? {
        UserBookRating.average(of: dimensions)
    }

    var isOverride: Bool {
        UserBookRating.isManualOverride(rating: starRating, average: dimensionAverage)
    }

    var displayDimensions: [RatingDimension] {
        PersonalRatingLogic.displayDimensions(
            preferred: preferredDimensions,
            existingScores: dimensions,
        )
    }

    func prepare(for bookID: BookID, isServerBook: Bool) async {
        guard self.bookID != bookID else { return }
        self.bookID = bookID
        record = nil
        preferredDimensions = nil
        reviewerName = nil
        errorMessage = nil
        isLoaded = false
        saveGeneration += 1
        guard isServerBook else { return }

        async let fetchedRating = BookServiceActor.shared.fetchBookRating(for: bookID)
        async let fetchedPreferences = BookServiceActor.shared.fetchUserPreferences(
            sourceID: bookID.sourceID
        )
        async let fetchedCredentials = BookServiceActor.shared.credentials(
            for: bookID.sourceID
        )
        let (rating, preferences, credentials) = await (
            fetchedRating, fetchedPreferences, fetchedCredentials,
        )
        guard self.bookID == bookID else { return }
        record = rating
        preferredDimensions = preferences?.ratingDimensions
        reviewerName = PersonalRatingLogic.reviewerDisplayName(credentials?.username)
        isLoaded = true
        saveGeneration += 1
    }

    func setStarRating(_ value: Double) async {
        await save(UserBookRatingUpdate(rating: .value(value)))
    }

    @discardableResult
    func save(_ update: UserBookRatingUpdate) async -> Bool {
        guard let bookID else { return false }
        isSaving = true
        defer {
            isSaving = false
            saveGeneration += 1
        }
        switch await BookServiceActor.shared.updateBookRating(for: bookID, update: update) {
            case .saved(let row):
                guard self.bookID == bookID else { return false }
                record = row
                errorMessage = nil
                return true
            case .cleared:
                guard self.bookID == bookID else { return false }
                record = nil
                errorMessage = nil
                return true
            case .failed(let message):
                errorMessage = message ?? "The rating could not be saved."
                return false
        }
    }

    @discardableResult
    func removeRating() async -> Bool {
        guard let bookID else { return false }
        isSaving = true
        defer {
            isSaving = false
            saveGeneration += 1
        }
        if await BookServiceActor.shared.deleteBookRating(for: bookID) {
            record = nil
            errorMessage = nil
            return true
        }
        errorMessage = "Could not remove the rating."
        return false
    }
}

#endif
