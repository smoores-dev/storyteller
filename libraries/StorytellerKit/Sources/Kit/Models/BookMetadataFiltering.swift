import Foundation

extension BookMetadata {
    public static let noSeriesSentinel = "__no_series__"
    public static let unknownNarratorSentinel = "Unknown Narrator"
    public static let unknownTranslatorSentinel = "Unknown Translator"
    public static let unknownYearSentinel = "Unknown"
    public static let unratedSentinel = "Unrated"
    public static let unknownStatusSentinel = "Unknown"

    public func matchesSeries(_ filter: String) -> Bool {
        if filter == Self.noSeriesSentinel {
            return series == nil || series?.isEmpty == true
        }
        let lowered = filter.lowercased()
        return series?.contains(where: { $0.name.lowercased() == lowered }) ?? false
    }

    public func matchesAuthor(_ filter: String) -> Bool {
        let lowered = filter.lowercased()
        return authors?.contains(where: { $0.name?.lowercased() == lowered }) ?? false
    }

    public func matchesNarrator(_ filter: String) -> Bool {
        if filter == Self.unknownNarratorSentinel {
            guard let narrators, !narrators.isEmpty else { return true }
            return narrators.allSatisfy { n in
                guard let name = n.name?.trimmingCharacters(in: .whitespacesAndNewlines) else {
                    return true
                }
                return name.isEmpty
            }
        }
        let lowered = filter.lowercased()
        return narrators?.contains(where: { $0.name?.lowercased() == lowered }) ?? false
    }

    public func matchesTranslator(_ filter: String) -> Bool {
        let translators = (creators ?? []).filter { $0.role == "trl" }
        if filter == Self.unknownTranslatorSentinel {
            return translators.isEmpty
        }
        let lowered = filter.lowercased()
        return translators.contains(where: { $0.name?.lowercased() == lowered })
    }

    public func matchesCollection(_ filter: String) -> Bool {
        guard let collections else { return false }
        return collections.contains(where: { $0.uuid == filter || $0.name == filter })
    }

    public func matchesPublicationYear(_ filter: String) -> Bool {
        if filter == Self.unknownYearSentinel {
            return Self.publicationYear(from: publicationDate) == nil
        }
        return Self.publicationYear(from: publicationDate) == filter
    }

    public func matchesRating(_ filter: String) -> Bool {
        if filter == Self.unratedSentinel {
            return rating == nil || rating == 0
        }
        guard let r = rating, r > 0 else { return false }
        return "\(Int(r.rounded()))" == filter
    }

    public func matchesTag(_ filter: String) -> Bool {
        let lowered = filter.lowercased()
        return tagNames.contains(where: { $0.lowercased() == lowered })
    }

    public func matchesStatus(_ filter: String) -> Bool {
        if filter == Self.unknownStatusSentinel {
            guard let statusName = status?.name else { return true }
            return statusName.isEmpty
        }
        guard let itemStatus = status?.name else { return false }
        return itemStatus.caseInsensitiveCompare(filter) == .orderedSame
    }
}
