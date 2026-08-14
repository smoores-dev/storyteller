#if os(iOS) || os(macOS)
import SwiftUI

#if os(iOS)
import UIKit
#else
import AppKit
#endif

enum TimelinePeriod: String, CaseIterable {
    case session
    case week
    case month
    case year
    case all

    var pillLabel: String {
        switch self {
            case .session: return "Session"
            case .week: return "Week"
            case .month: return "Month"
            case .year: return "Year"
            case .all: return "All"
        }
    }

    var title: String {
        switch self {
            case .session: return "This session"
            case .week: return "This week"
            case .month: return "This month"
            case .year: return "This year"
            case .all: return "All time"
        }
    }
}

struct ReadingTimelineSheet: View {
    let bookId: BookID
    let bookTitle: String
    let currentFraction: Double?
    let currentDescription: String
    let onJump: (BookLocator, String) -> Void
    var sessionStart: Date? = nil
    var chapterTitle: ((BookLocator) -> String?)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var visits: [ReadingVisit] = []
    @State private var isLoading = true
    @State private var period: TimelinePeriod = .week
    @State private var selectedInterval: DateInterval? = nil
    @State private var showDebugHistory = false
    @State private var showClearConfirmation = false
    @State private var showClearShownConfirmation = false
    @State private var coverPalette = CoverDerivedPalette.fallback()
    @State private var expandedVisits: Set<UUID> = []

    var body: some View {
        ZStack(alignment: .top) {
            paper.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                        .padding(.horizontal, 24)
                        .padding(.top, 18)
                        .padding(.bottom, 22)
                        .background(surface.ignoresSafeArea(edges: .top))

                    Rectangle()
                        .fill(hairline)
                        .frame(height: 1)

                    if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 80)
                    } else if listVisits.isEmpty {
                        emptyState
                            .padding(.top, 60)
                            .padding(.horizontal, 40)
                    } else {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(dayGroups, id: \.day) { group in
                                daySection(group)
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 10)
                        .padding(.bottom, 40)
                    }
                }
            }
        }
        .task { await refresh() }
        .onChange(of: period) { _, _ in selectedInterval = nil }
        .sheet(isPresented: $showDebugHistory) {
            SyncHistorySheet(bookId: bookId, bookTitle: bookTitle)
        }
        .alert("Clear Reading Timeline?", isPresented: $showClearConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Clear", role: .destructive) {
                Task {
                    await ReadingTimelineActor.shared.clearVisits(for: bookId)
                    visits = []
                }
            }
        } message: {
            Text("This removes the reading history for this book from this device.")
        }
        .alert("Clear Shown Items?", isPresented: $showClearShownConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Clear", role: .destructive) {
                let ids = Set(listVisits.map(\.id))
                Task {
                    await ReadingTimelineActor.shared.removeVisits(ids: ids, for: bookId)
                    visits.removeAll { ids.contains($0.id) }
                }
            }
        } message: {
            Text("This removes only the sessions currently shown in the list.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    EditorialEyebrow("Where you've been")
                        .foregroundStyle(subtleInk)
                    Text(period.title)
                        .font(.editorialTitle(34))
                        .foregroundStyle(ink)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 14) {
                        Menu {
                            Button {
                                showDebugHistory = true
                            } label: {
                                Label("Sync History (Debug)", systemImage: "ladybug")
                            }
                            Button(role: .destructive) {
                                showClearShownConfirmation = true
                            } label: {
                                Label("Clear Shown Items", systemImage: "text.badge.minus")
                            }
                            Button(role: .destructive) {
                                showClearConfirmation = true
                            } label: {
                                Label("Clear Timeline", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(subtleInk)
                                .frame(width: 30, height: 30)
                                .background(Circle().strokeBorder(hairline, lineWidth: 1))
                        }
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ink)
                                .frame(width: 30, height: 30)
                                .background(Circle().strokeBorder(hairline, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 2)
                    Text(minutesTotalText)
                        .font(.editorialTitle(32))
                        .foregroundStyle(accent)
                    EditorialEyebrow("Minutes read")
                        .foregroundStyle(subtleInk)
                }
            }

            periodPills

            if period != .session {
                chart
                    .frame(height: 110)
                    .padding(.top, 4)
            }
        }
    }

    private var availablePeriods: [TimelinePeriod] {
        TimelinePeriod.allCases.filter { $0 != .session || sessionStart != nil }
    }

    private var periodPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availablePeriods, id: \.self) { candidate in
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) { period = candidate }
                    } label: {
                        Text(candidate.pillLabel)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(period == candidate ? paper : ink)
                            .padding(.horizontal, 17)
                            .padding(.vertical, 9)
                            .background(
                                Capsule().fill(period == candidate ? ink : .clear)
                            )
                            .overlay(
                                Capsule().strokeBorder(
                                    period == candidate ? .clear : hairline,
                                    lineWidth: 1,
                                )
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .scrollClipDisabled()
    }

    private var chart: some View {
        let buckets = chartBuckets
        let maxMinutes = max(buckets.map(\.minutes).max() ?? 0, 1)
        return HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(buckets.enumerated()), id: \.offset) { _, bucket in
                let isSelected = selectedInterval == bucket.interval
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        selectedInterval = isSelected ? nil : bucket.interval
                    }
                } label: {
                    VStack(spacing: 7) {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(
                                isSelected
                                    ? accent
                                    : (bucket.minutes > 0 ? barFill : hairline)
                            )
                            .frame(
                                height: bucket.minutes > 0
                                    ? max(CGFloat(bucket.minutes / maxMinutes) * 86, 6)
                                    : 2
                            )
                            .frame(maxHeight: 86, alignment: .bottom)
                        Text(bucket.label)
                            .font(.caption2.weight(isSelected ? .bold : .medium))
                            .kerning(1)
                            .foregroundStyle(isSelected ? accent : subtleInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func daySection(_ group: DayGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                EditorialEyebrow(dayLabel(group.day))
                    .foregroundStyle(subtleInk)
                Spacer()
                Text(dayMinutesText(group))
                    .font(.system(.callout, design: .serif))
                    .foregroundStyle(accent)
            }
            .padding(.top, 22)
            .padding(.bottom, 14)

            ForEach(Array(group.visits.enumerated()), id: \.element.id) { index, visit in
                visitRow(
                    visit,
                    isLast: index == group.visits.count - 1,
                )
            }
        }
    }

    private func visitRow(_ visit: ReadingVisit, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .trailing, spacing: 3) {
                Text(Self.railTime(visit.startDate))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(ink)
                if let duration = shortDurationText(visit) {
                    Text(duration)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(subtleInk)
                }
            }
            .frame(width: 52, alignment: .trailing)

            ZStack(alignment: .top) {
                Rectangle()
                    .fill(hairline)
                    .frame(width: 2)
                    .padding(.top, isLast ? 0 : 0)
                Circle()
                    .fill(sourceColor(visit.source))
                    .frame(width: 12, height: 12)
                    .overlay(Circle().strokeBorder(paper, lineWidth: 2))
                    .padding(.top, 4)
            }
            .frame(width: 36)

            visitCard(visit)
                .padding(.bottom, 18)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func visitCard(_ visit: ReadingVisit) -> some View {
        let quote = displayQuote(visit)
        let isExpanded = expandedVisits.contains(visit.id)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(sourceColor(visit.source))
                    .frame(width: 4, height: 46)

                VStack(alignment: .leading, spacing: 4) {
                    Text(cardTitle(visit))
                        .font(.editorialTitle(20))
                        .foregroundStyle(ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let subtitle = cardSubtitle(visit) {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(subtleInk)
                            .lineLimit(1)
                    }
                    HStack(spacing: 6) {
                        Text(stoppedLine(visit))
                            .font(.caption2.weight(.medium))
                            .kerning(1)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        if quote != nil, !isExpanded {
                            Image(systemName: "text.quote")
                                .font(.caption2)
                        }
                    }
                    .foregroundStyle(subtleInk)
                    .padding(.top, 2)
                }

                Spacer(minLength: 0)

                Button {
                    onJump(visit.endLocator, visit.endDescription)
                } label: {
                    Text("Resume")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(accent)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .overlay(
                            Capsule().strokeBorder(
                                accent.opacity(0.45),
                                lineWidth: 1,
                            )
                        )
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }

            if isExpanded, let quote {
                Text(quotedDisplay(quote))
                    .font(.system(.callout, design: .serif).italic())
                    .foregroundStyle(ink.opacity(0.75))
                    .lineSpacing(3)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(card)
                .shadow(color: .black.opacity(0.06), radius: 10, y: 3)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .onTapGesture {
            guard quote != nil else { return }
            withAnimation(.easeInOut(duration: 0.18)) {
                if isExpanded {
                    expandedVisits.remove(visit.id)
                } else {
                    expandedVisits.insert(visit.id)
                }
            }
        }
        .contextMenu {
            Button {
                onJump(visit.endLocator, visit.endDescription)
            } label: {
                Label("Go to Where This Ended", systemImage: "arrow.forward.to.line")
            }
            Button {
                onJump(visit.startLocator, visit.startDescription)
            } label: {
                Label("Go to Where This Started", systemImage: "arrow.backward.to.line")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            EditorialEyebrow(selectedInterval == nil ? "Nothing here yet" : "No reading here")
                .foregroundStyle(subtleInk)
            Text(
                selectedInterval == nil
                    ? "Your reading sessions will appear here as you read. "
                        + "Tap one to jump back to that spot."
                    : "No reading sessions in this stretch. Tap the bar again to see everything."
            )
            .font(.system(.body, design: .serif))
            .foregroundStyle(ink.opacity(0.8))
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private var listVisits: [ReadingVisit] {
        guard let selectedInterval else { return filteredVisits }
        return filteredVisits.filter { selectedInterval.contains($0.startDate) }
    }

    private struct DayGroup {
        let day: Date
        let visits: [ReadingVisit]
    }

    private struct ChartBucket {
        let label: String
        let minutes: Double
        let interval: DateInterval
    }

    private var filteredVisits: [ReadingVisit] {
        let calendar = Calendar.current
        let now = Date()
        return visits.filter { visit in
            switch period {
                case .session:
                    guard let sessionStart else { return false }
                    return visit.endDate >= sessionStart
                case .week:
                    return calendar.isDate(visit.startDate, equalTo: now, toGranularity: .weekOfYear)
                case .month:
                    return calendar.isDate(visit.startDate, equalTo: now, toGranularity: .month)
                case .year:
                    return calendar.isDate(visit.startDate, equalTo: now, toGranularity: .year)
                case .all:
                    return true
            }
        }
    }

    private var dayGroups: [DayGroup] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: listVisits) {
            calendar.startOfDay(for: $0.startDate)
        }
        return grouped
            .map { DayGroup(day: $0.key, visits: $0.value.sorted { $0.startedAt > $1.startedAt }) }
            .sorted { $0.day > $1.day }
    }

    private var chartBuckets: [ChartBucket] {
        let calendar = Calendar.current
        let now = Date()
        switch period {
            case .session:
                return []
            case .week:
                guard
                    let weekStart = calendar.dateInterval(of: .weekOfYear, for: now)?.start
                else { return [] }
                return (0..<7).compactMap { offset in
                    guard
                        let day = calendar.date(byAdding: .day, value: offset, to: weekStart),
                        let interval = calendar.dateInterval(of: .day, for: day)
                    else { return nil }
                    let symbol = day.formatted(.dateTime.weekday(.narrow)).uppercased()
                    return bucket(label: symbol, interval: interval)
                }
            case .month:
                let dayCount = calendar.range(of: .day, in: .month, for: now)?.count ?? 30
                guard
                    let monthStart = calendar.dateInterval(of: .month, for: now)?.start
                else { return [] }
                return (0..<dayCount).compactMap { offset in
                    guard
                        let day = calendar.date(byAdding: .day, value: offset, to: monthStart),
                        let interval = calendar.dateInterval(of: .day, for: day)
                    else { return nil }
                    let dayNumber = offset + 1
                    let label = dayNumber % 7 == 1 ? "\(dayNumber)" : ""
                    return bucket(label: label, interval: interval)
                }
            case .year:
                guard
                    let yearStart = calendar.dateInterval(of: .year, for: now)?.start
                else { return [] }
                return (0..<12).compactMap { offset in
                    guard
                        let month = calendar.date(byAdding: .month, value: offset, to: yearStart),
                        let interval = calendar.dateInterval(of: .month, for: month)
                    else { return nil }
                    let symbol = month.formatted(.dateTime.month(.narrow)).uppercased()
                    return bucket(label: symbol, interval: interval)
                }
            case .all:
                let years = Set(filteredVisits.map { calendar.component(.year, from: $0.startDate) })
                    .sorted()
                guard let firstYear = years.first else { return [] }
                let currentYear = calendar.component(.year, from: now)
                let span = Array(firstYear...max(currentYear, firstYear))
                return span.suffix(12).compactMap { year in
                    guard
                        let start = calendar.date(from: DateComponents(year: year)),
                        let interval = calendar.dateInterval(of: .year, for: start)
                    else { return nil }
                    return bucket(
                        label: "'\(String(format: "%02d", year % 100))",
                        interval: interval,
                    )
                }
        }
    }

    private func bucket(label: String, interval: DateInterval) -> ChartBucket {
        let total = filteredVisits
            .filter { interval.contains($0.startDate) }
            .reduce(0.0) { $0 + $1.durationSeconds / 60 }
        return ChartBucket(label: label, minutes: total, interval: interval)
    }

    private var minutesTotalText: String {
        let seconds = filteredVisits.reduce(0.0) { $0 + $1.durationSeconds }
        let total = Int(seconds / 60)
        if total < 1 { return seconds > 0 ? "<1m" : "0m" }
        return "\(total)m"
    }

    private func dayMinutesText(_ group: DayGroup) -> String {
        let total = Int(group.visits.reduce(0.0) { $0 + $1.durationSeconds } / 60)
        if total < 1 { return "under a min" }
        return "\(total) min"
    }

    private func dayLabel(_ day: Date) -> String {
        let calendar = Calendar.current
        let formatted = day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
            .uppercased()
        if calendar.isDateInToday(day) { return "TODAY \u{00B7} \(formatted)" }
        if calendar.isDateInYesterday(day) { return "YESTERDAY \u{00B7} \(formatted)" }
        return formatted
    }

    private func shortDurationText(_ visit: ReadingVisit) -> String? {
        let minutes = Int(visit.durationSeconds / 60)
        if minutes < 1 { return nil }
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h\(minutes % 60)m"
    }

    private func cardTitle(_ visit: ReadingVisit) -> String {
        let end = visit.endDescription
        if let (place, _) = Self.splitPlacePercent(end) { return place }
        if let resolved = chapterTitle?(visit.endLocator), !resolved.isEmpty {
            return resolved
        }
        if let progression = visit.endProgression {
            return "\(Int((progression * 100).rounded()))%"
        }
        if !end.isEmpty, end != "Unknown Chapter" { return end }
        return "Reading session"
    }

    private func cardSubtitle(_ visit: ReadingVisit) -> String? {
        var parts: [String] = []
        if let (startPlace, _) = Self.splitPlacePercent(visit.startDescription),
            startPlace != cardTitle(visit)
        {
            parts.append("From \(startPlace)")
        }
        if let start = visit.startProgression, let end = visit.endProgression {
            let startPct = Int((start * 100).rounded())
            let endPct = Int((end * 100).rounded())
            if startPct != endPct {
                parts.append("\(startPct)% \u{2192} \(endPct)%")
            }
        }
        switch visit.source {
            case .audiobook: parts.append("Listening")
            case .otherDevice: parts.append("Another device")
            default: break
        }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " \u{00B7} ")
    }

    private func stoppedLine(_ visit: ReadingVisit) -> String {
        let time = Self.railTime(visit.endDate)
        if let progression = visit.endProgression {
            let percentText = "\(Int((progression * 100).rounded()))%"
            if !cardTitle(visit).contains("%") {
                return "STOPPED \(time) \u{00B7} \(percentText)"
            }
        }
        return "STOPPED \(time)"
    }

    static func railTime(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }

    private func sourceColor(_ source: ReadingVisitSource) -> Color {
        switch source {
            case .ebook: return accent
            case .readaloud: return c("6B5B8E", "9A87C4")
            case .audiobook: return c("4E6E5D", "7FA98F")
            case .otherDevice: return c("8A8378", "878078")
        }
    }

    static func splitPlacePercent(_ description: String) -> (String, String)? {
        guard let commaRange = description.range(of: ", ", options: .backwards) else {
            return nil
        }
        let suffix = String(description[commaRange.upperBound...])
        guard suffix.hasSuffix("%"), suffix.dropLast().allSatisfy(\.isNumber) else {
            return nil
        }
        return (String(description[..<commaRange.lowerBound]), suffix)
    }

    private func refresh() async {
        isLoading = true
        await loadCoverPalette()
        visits = await ReadingTimelineActor.shared.getVisits(for: bookId)
        if let newest = visits.max(by: { $0.startedAt < $1.startedAt }) {
            expandedVisits.insert(newest.id)
        }
        isLoading = false
    }

    private func displayQuote(_ visit: ReadingVisit) -> String? {
        guard let raw = visit.endText else { return nil }
        let collapsed = raw.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return collapsed.isEmpty ? nil : collapsed
    }

    private func quotedDisplay(_ quote: String) -> String {
        let quoteMarks: Set<Character> = ["\u{201C}", "\u{201D}", "\"", "\u{2018}", "\u{2019}"]
        if let first = quote.first, quoteMarks.contains(first) {
            return quote
        }
        return "\u{201C}\(quote)\u{201D}"
    }

    static func fractionLocator(_ fraction: Double) -> BookLocator {
        BookLocator(
            href: "",
            type: "application/xhtml+xml",
            title: nil,
            locations: BookLocator.Locations(
                fragments: nil,
                progression: nil,
                position: nil,
                totalProgression: fraction,
                cssSelector: nil,
                partialCfi: nil,
                domRange: nil,
            ),
            text: nil,
        )
    }

    private func c(_ light: String, _ dark: String) -> Color {
        Color(hex: colorScheme == .dark ? dark : light) ?? .primary
    }

    private var resolvedPalette: CoverDerivedPalette {
        coverPalette.resolved(for: colorScheme)
    }

    private var paper: Color { resolvedPalette.contentBackground }
    private var surface: Color { resolvedPalette.surface }
    private var card: Color { resolvedPalette.cardBackground }
    private var ink: Color { .primary }
    private var subtleInk: Color { .secondary }
    private var accent: Color { coverPalette.ratingAccent(for: colorScheme) }
    private var accentBackground: Color { resolvedPalette.accentBackground }
    private var barFill: Color { resolvedPalette.accentTrack }
    private var hairline: Color { resolvedPalette.cardBorder }

    private func loadCoverPalette() async {
        if let palette = await CoverDerivedPalette.load(for: bookId) {
            coverPalette = palette
        }
    }
}
#endif
