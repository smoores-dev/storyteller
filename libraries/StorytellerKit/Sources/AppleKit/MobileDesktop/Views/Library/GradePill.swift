#if os(iOS) || os(macOS)
import SwiftUI

extension AlignmentGradeScale {
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
