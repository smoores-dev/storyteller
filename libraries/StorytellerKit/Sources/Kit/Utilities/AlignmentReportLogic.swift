import Foundation

public enum AlignmentGradeScale {
    public static let orderedGrades = ["A+", "A", "A-", "B", "B-", "C", "D", "F"]

    // Unknown grades rank 0 so worst-first ordering surfaces them instead of hiding
    // them past F.
    public static func rank(for grade: String) -> Int {
        guard let index = orderedGrades.firstIndex(of: grade) else { return 0 }
        return orderedGrades.count - index
    }

    public static func orderedFacets(from grades: [String: Int]) -> [(grade: String, count: Int)] {
        var facets: [(grade: String, count: Int)] = orderedGrades.compactMap { grade in
            guard let count = grades[grade], count > 0 else { return nil }
            return (grade, count)
        }
        let known = Set(orderedGrades)
        let extras = grades
            .filter { !known.contains($0.key) && $0.value > 0 }
            .sorted { $0.key < $1.key }
        facets.append(contentsOf: extras.map { ($0.key, $0.value) })
        return facets
    }

    public static func booksWorstFirst(_ books: [BookMetadata]) -> [BookMetadata] {
        books
            .filter { $0.alignmentSummary != nil }
            .sorted { lhs, rhs in
                let lhsRank = rank(for: lhs.alignmentSummary?.grade ?? "")
                let rhsRank = rank(for: rhs.alignmentSummary?.grade ?? "")
                if lhsRank != rhsRank { return lhsRank < rhsRank }
                return lhs.title.articleStrippedCompare(rhs.title) == .orderedAscending
            }
    }
}

public enum AlignmentOverridesAssembly {
    // PATCH replaces stored overrides wholesale, so every save sends the full state;
    // the top-level maps stay present even when empty so clearing the last toggle
    // still wipes what the server has.
    public static func assemble(
        markedOkChapters: [String: Bool],
        excludedChapters: [String: Bool],
        intendedUnalignedChapters: [String: Bool],
        excludedAudioFiles: [String: Bool],
    ) -> AlignmentOverrides {
        var chapters: [String: AlignmentOverrides.ChapterOverride] = [:]
        for (href, isOn) in markedOkChapters where isOn {
            chapters[href, default: AlignmentOverrides.ChapterOverride()].markedOk = true
        }
        for (href, isOn) in excludedChapters where isOn {
            chapters[href, default: AlignmentOverrides.ChapterOverride()].excludeFromScore = true
        }
        let unalignedChapters = intendedUnalignedChapters
            .filter(\.value)
            .mapValues { _ in AlignmentOverrides.UnalignedChapterOverride(intended: true) }
        let audioFiles = excludedAudioFiles
            .filter(\.value)
            .mapValues { _ in AlignmentOverrides.AudioFileOverride(excluded: true) }
        return AlignmentOverrides(
            chapters: chapters,
            unalignedChapters: unalignedChapters,
            audioFiles: audioFiles,
        )
    }
}
