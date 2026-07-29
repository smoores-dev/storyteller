#if os(iOS) || os(macOS)
import SwiftUI

enum AlignmentGradeScale {
    static let orderedGrades = ["A+", "A", "A-", "B", "B-", "C", "D", "F"]

    // Unknown grades rank 0 so worst-first ordering surfaces them instead of hiding
    // them past F.
    static func rank(for grade: String) -> Int {
        guard let index = orderedGrades.firstIndex(of: grade) else { return 0 }
        return orderedGrades.count - index
    }

    static func orderedFacets(from grades: [String: Int]) -> [(grade: String, count: Int)] {
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

    static func booksWorstFirst(_ books: [BookMetadata]) -> [BookMetadata] {
        books
            .filter { $0.alignmentSummary != nil }
            .sorted { lhs, rhs in
                let lhsRank = rank(for: lhs.alignmentSummary?.grade ?? "")
                let rhsRank = rank(for: rhs.alignmentSummary?.grade ?? "")
                if lhsRank != rhsRank { return lhsRank < rhsRank }
                return lhs.title.articleStrippedCompare(rhs.title) == .orderedAscending
            }
    }

    static func color(for grade: String) -> Color {
        switch grade.first {
            case "A": .green
            case "B": .yellow
            case "C", "D": .orange
            case "F": .red
            default: .secondary
        }
    }
}

struct GradePill: View {
    let grade: String

    var body: some View {
        Text(grade)
            .font(.caption.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(AlignmentGradeScale.color(for: grade))
            .background(AlignmentGradeScale.color(for: grade).opacity(0.16), in: Capsule())
    }
}

#endif
