#if os(iOS) || os(macOS) || os(tvOS)
import Foundation
import Observation

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
