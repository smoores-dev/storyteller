#if os(macOS)
import SwiftUI

struct SidebarHistoryList: View {
    let viewModel: EbookPlayerViewModel
    let sidebarModel: EbookSidebarModel
    let theme: EbookSidebarTheme

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter
    }()

    private var visits: [ReadingVisit] {
        sidebarModel.recentVisits
    }

    var body: some View {
        let visits = self.visits
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("RECENT PLACES")
                        .font(.caption.weight(.semibold))
                        .kerning(0.8)
                        .foregroundStyle(theme.tertiary)
                    Spacer()
                    if !sidebarModel.recentVisits.isEmpty {
                        Button("Clear") {
                            sidebarModel.clearVisits()
                        }
                        .buttonStyle(.plain)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(theme.foreground.opacity(0.08)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)

                if visits.isEmpty {
                    ContentUnavailableView(
                        "No Recent Places",
                        systemImage: "clock",
                        description: Text("Positions you visit will show up here."),
                    )
                    .padding(.top, 30)
                } else {
                    ForEach(Array(visits.enumerated()), id: \.element.id) { index, visit in
                        visitRow(
                            visit,
                            isCurrent: index == 0,
                            cameFrom: index > 0 && visits[index - 1].openedByJump,
                        )
                    }

                    Button {
                        viewModel.showReadingTimeline = true
                    } label: {
                        Text("Full timeline")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(theme.accent)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.bottom, 8)
        }
    }

    private func visitRow(_ visit: ReadingVisit, isCurrent: Bool, cameFrom: Bool) -> some View {
        Button {
            guard !isCurrent else { return }
            Task {
                await viewModel.jumpFromTimeline(
                    to: visit.endLocator,
                    description: visit.endDescription,
                )
            }
        } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 0) {
                    Circle()
                        .strokeBorder(
                            isCurrent ? theme.accent : theme.tertiary,
                            lineWidth: isCurrent ? 5 : 2,
                        )
                        .frame(width: 12, height: 12)
                        .padding(.top, 3)
                    Rectangle()
                        .fill(theme.tertiary.opacity(0.5))
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
                .frame(width: 12)

                VStack(alignment: .leading, spacing: 2) {
                    if isCurrent || cameFrom {
                        Text(isCurrent ? "YOU ARE HERE" : "YOU CAME FROM")
                            .font(.caption2.weight(.semibold))
                            .kerning(0.6)
                            .foregroundStyle(isCurrent ? theme.accent : theme.tertiary)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(positionLabel(for: visit))
                            .font(.body.weight(.semibold).monospacedDigit())
                            .foregroundStyle(theme.foreground)
                        Spacer()
                        Text(relativeTime(for: visit))
                            .font(.caption)
                            .foregroundStyle(theme.secondary)
                    }
                    Text(visit.endDescription)
                        .font(.callout)
                        .foregroundStyle(theme.secondary)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .background(isCurrent ? theme.foreground.opacity(0.05) : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private func positionLabel(for visit: ReadingVisit) -> String {
        guard let progression = visit.endProgression else { return "--" }
        if viewModel.hasAudioNarration,
            let total = viewModel.session?.audioState?.bookTotal, total > 0
        {
            return formatTime(progression * total)
        }
        return formatPercent(progression)
    }

    private func relativeTime(for visit: ReadingVisit) -> String {
        let interval = Date().timeIntervalSince(visit.endDate)
        if interval < 60 {
            return "just now"
        }
        return Self.relativeFormatter.localizedString(for: visit.endDate, relativeTo: Date())
    }
}
#endif
