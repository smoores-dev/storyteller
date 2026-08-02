import Foundation

/// The single place where Storyteller turns date strings into `Date`, `Date` into display strings,
/// and `Date` back into wire strings.
///
/// Every date the app receives over the wire is an opaque string. The upstream Storyteller server
/// populates the same column from several unrelated code paths, so a single field (notably
/// `alignedAt`) can arrive as ISO 8601 with or without fractional seconds, as a bare SQLite
/// `yyyy-MM-dd HH:mm:ss` timestamp, as a year, or even as a raw JavaScript `Date.toString()`.
/// Parse once here, work with `Date`, and never hand a raw date string to a sort comparator or a
/// view. A string that cannot be parsed becomes `nil`, which sorts to the end and renders empty;
/// it can never reorder or blank the UI.
public enum StorytellerDate {

    /// Identifies which logical field a date came from. Only used to attribute samples in the
    /// temporary inconsistency detector (see the DELETE-ME section at the bottom of this file).
    public enum Field: String, Sendable, CaseIterable {
        case publicationDate
        case alignedAt
        case createdAt
        case updatedAt
        case lastRead
        case releaseDate
        case coverVersion
        case generic
    }

    /// The concrete shape a parsed string turned out to be. Reported by the inconsistency detector.
    public enum Format: String, Sendable, CaseIterable {
        case iso8601Fractional
        case iso8601
        case iso8601DateOnly
        case sqlTimestamp
        case yearMonth
        case yearOnly
        case jsToString
        case epochMillis
        case unparseable
    }

    /// The one and only date parser. Defensively recognizes every format seen in real data.
    ///
    /// `context` is an optional human label (a book title) used only by the inconsistency
    /// detector to name the offending record in its report.
    public static func parse(
        _ string: String?,
        field: Field = .generic,
        context: String? = nil,
    ) -> Date? {
        guard let trimmed = string?.trimmingCharacters(in: .whitespacesAndNewlines),
            !trimmed.isEmpty
        else { return nil }

        let (date, format) = cachedInterpret(trimmed)
        if detectInconsistentDates {
            InconsistentDateDetector.shared.record(
                field: field,
                format: format,
                sample: trimmed,
                context: context,
            )
        }
        return date
    }

    // Parsing the same date string repeatedly is expensive (each miss runs several formatters
    // before one matches), and the sort comparator re-derives a book's key on every comparison:
    // O(n log n) parses of the same handful of strings. Memoize by the trimmed string; the result
    // is independent of the field/context, which only feed the diagnostic.
    private nonisolated(unsafe) static var parseCache: [String: (Date?, Format)] = [:]
    private static let parseCacheLock = NSLock()
    private static let parseCacheLimit = 20_000

    private static func cachedInterpret(_ raw: String) -> (Date?, Format) {
        parseCacheLock.lock()
        if let hit = parseCache[raw] {
            parseCacheLock.unlock()
            return hit
        }
        parseCacheLock.unlock()

        let result = interpret(raw)

        parseCacheLock.lock()
        if parseCache.count >= parseCacheLimit { parseCache.removeAll(keepingCapacity: true) }
        parseCache[raw] = result
        parseCacheLock.unlock()
        return result
    }

    private static func interpret(_ raw: String) -> (Date?, Format) {
        if let date = isoFractional.date(from: raw) { return (date, .iso8601Fractional) }
        if let date = isoStandard.date(from: raw) { return (date, .iso8601) }
        if let date = isoDateOnly.date(from: raw) { return (date, .iso8601DateOnly) }
        if let date = sqlTimestamp.date(from: raw) { return (date, .sqlTimestamp) }
        if let date = parseJS(raw) { return (date, .jsToString) }

        if raw.allSatisfy(\.isNumber) {
            if raw.count <= 4, let date = yearOnly.date(from: raw) { return (date, .yearOnly) }
            if raw.count >= 11, let millis = Double(raw) {
                return (Date(timeIntervalSince1970: millis / 1000), .epochMillis)
            }
        }

        if let date = yearMonth.date(from: raw) { return (date, .yearMonth) }
        if let date = yearOnly.date(from: raw) { return (date, .yearOnly) }
        return (nil, .unparseable)
    }

    private static func parseJS(_ raw: String) -> Date? {
        // "Sat Apr 11 2026 15:36:28 GMT+0000 (Coordinated Universal Time)": drop the trailing
        // " (zone name)" before parsing the "...GMT+0000" prefix.
        let stripped: String
        if let paren = raw.range(of: " (") {
            stripped = String(raw[..<paren.lowerBound])
        } else {
            stripped = raw
        }
        return jsToString.date(from: stripped)
    }

    /// A `Date` anchored at noon UTC on the same calendar day as `string`. Use this for date-only
    /// `DatePicker` bindings: a picker renders in the local time zone, and noon keeps the calendar
    /// day stable across zones (within ±12h) rather than slipping to the previous day at midnight
    /// UTC.
    public static func calendarDay(_ string: String?) -> Date? {
        guard let date = parse(string) else { return nil }
        var components = utcCalendar.dateComponents([.year, .month, .day], from: date)
        components.hour = 12
        return utcCalendar.date(from: components)
    }

    /// A lexicographically sortable, fixed-width key. `nil` sorts after every real date (it lands
    /// at the bottom of an ascending list, the top of a descending one).
    public static func sortKey(_ date: Date?) -> String {
        guard let date else { return "99999999999999" }
        let c = utcCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date,
        )
        return String(
            format: "%04d%02d%02d%02d%02d%02d",
            c.year ?? 0,
            c.month ?? 0,
            c.day ?? 0,
            c.hour ?? 0,
            c.minute ?? 0,
            c.second ?? 0,
        )
    }

    public static func sortKey(_ string: String?, field: Field = .generic) -> String {
        sortKey(parse(string, field: field))
    }

    /// Abbreviated calendar date, no time, e.g. "Apr 11, 2026". Empty for `nil`.
    public static func full(_ date: Date?) -> String {
        guard let date else { return "" }
        return displayFull.string(from: date)
    }

    /// "MMM yyyy", e.g. "Apr 2026". Empty for `nil`.
    public static func monthYear(_ date: Date?) -> String {
        guard let date else { return "" }
        return displayMonthYear.string(from: date)
    }

    /// "yyyy", e.g. "2026". Empty for `nil`.
    public static func year(_ date: Date?) -> String {
        guard let date else { return "" }
        return displayYear.string(from: date)
    }

    /// Short local date with medium time, e.g. "4/11/26, 8:36:28 AM". Used for internal
    /// diagnostic timestamps that originate from epoch values, not from wire strings.
    public static func shortDateTime(_ date: Date) -> String {
        displayShortDateTime.string(from: date)
    }

    /// Local-timezone date and time with an explicit zone abbreviation, e.g.
    /// "Apr 11, 2026 at 8:36:28 AM (PST)". Empty for `nil`.
    public static func dateTimeWithZone(_ date: Date?) -> String {
        guard let date else { return "" }
        let zone =
            TimeZone.current.localizedName(for: .shortStandard, locale: .current)
            ?? TimeZone.current.identifier
        return "\(displayDateTime.string(from: date)) (\(zone))"
    }

    /// "yyyy-MM-dd" in UTC.
    public static func isoDay(from date: Date) -> String {
        isoDayFormatter.string(from: date)
    }

    /// ISO 8601 internet date-time without fractional seconds, e.g. "2026-04-11T15:36:28Z".
    public static func isoTimestamp(from date: Date) -> String {
        isoStandard.string(from: date)
    }

    /// "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" in UTC (ISO 8601 with milliseconds).
    public static func isoFull(from date: Date) -> String {
        isoFullFormatter.string(from: date)
    }

    public static func epochMillisString(from date: Date) -> String {
        String(Int64(date.timeIntervalSince1970 * 1000))
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private nonisolated(unsafe) static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private nonisolated(unsafe) static let isoStandard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
    private nonisolated(unsafe) static let isoDateOnly: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter
    }()

    private static func utcFormatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = format
        return formatter
    }

    private nonisolated(unsafe) static let sqlTimestamp = utcFormatter("yyyy-MM-dd HH:mm:ss")
    private nonisolated(unsafe) static let yearMonth = utcFormatter("yyyy-MM")
    private nonisolated(unsafe) static let yearOnly = utcFormatter("yyyy")
    private nonisolated(unsafe) static let jsToString = utcFormatter(
        "EEE MMM dd yyyy HH:mm:ss 'GMT'xx"
    )
    private nonisolated(unsafe) static let isoDayFormatter = utcFormatter("yyyy-MM-dd")
    private nonisolated(unsafe) static let isoFullFormatter = utcFormatter(
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    )

    private nonisolated(unsafe) static let displayFull: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = utcCalendar
        formatter.timeZone = utcCalendar.timeZone
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()
    private nonisolated(unsafe) static let displayMonthYear = utcFormatter("MMM yyyy")
    private nonisolated(unsafe) static let displayYear = utcFormatter("yyyy")
    private nonisolated(unsafe) static let displayDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .medium
        return formatter
    }()
    private nonisolated(unsafe) static let displayShortDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .medium
        return formatter
    }()
}

//
// This whole section exists only to gather concrete proof that the upstream Storyteller server
// sends the same field in multiple date formats in real-world data. It records, per field, every
// distinct `Format` it has parsed (with a count and a representative sample) and logs an aggregate
// the moment a field is observed carrying more than one format. To remove: delete this section,
// the `detectInconsistentDates` flag, and the single `InconsistentDateDetector.shared.record(...)`
// call inside `parse(_:field:)`.

extension StorytellerDate {

    public nonisolated(unsafe) static var detectInconsistentDates = true

    /// A full snapshot of every field/format seen so far. Call from a debugger or a debug menu.
    public static func inconsistentDateReport() -> String {
        InconsistentDateDetector.shared.report()
    }

    public static func logInconsistentDateReport() {
        debugLog(InconsistentDateDetector.shared.report())
    }
}

final class InconsistentDateDetector: @unchecked Sendable {
    static let shared = InconsistentDateDetector()

    private struct Entry {
        var count = 0
        var sample = ""
        var context: String?
    }

    private let lock = NSLock()
    private var stats: [StorytellerDate.Field: [StorytellerDate.Format: Entry]] = [:]

    func record(
        field: StorytellerDate.Field,
        format: StorytellerDate.Format,
        sample: String,
        context: String?,
    ) {
        lock.lock()
        var byFormat = stats[field] ?? [:]
        let isNewFormat = byFormat[format] == nil
        var entry = byFormat[format] ?? Entry()
        entry.count += 1
        // Keep the first sample, but upgrade to one that carries a context (book title) so the
        // report can name the offending record regardless of which call site recorded first.
        if entry.sample.isEmpty || (entry.context == nil && context != nil) {
            entry.sample = sample
            entry.context = context
        }
        byFormat[format] = entry
        stats[field] = byFormat
        let distinctFormats = byFormat.count
        lock.unlock()

        if isNewFormat && distinctFormats > 1 {
            logField(field)
        }
    }

    func report() -> String {
        lock.lock()
        defer { lock.unlock() }
        guard !stats.isEmpty else { return "[StorytellerDate] No date samples recorded yet." }
        return stats.keys
            .sorted { $0.rawValue < $1.rawValue }
            .map(body(for:))
            .joined(separator: "\n")
    }

    private func logField(_ field: StorytellerDate.Field) {
        lock.lock()
        let text = body(for: field)
        lock.unlock()
        debugLog(text)
    }

    /// Caller must hold `lock`.
    private func body(for field: StorytellerDate.Field) -> String {
        let byFormat = stats[field] ?? [:]
        let header =
            "[StorytellerDate][InconsistentDates] field=\(field.rawValue) — \(byFormat.count) distinct format(s):"
        let lines =
            byFormat
            .sorted { $0.value.count > $1.value.count }
            .map { format, entry in
                let name = format.rawValue.padding(toLength: 18, withPad: " ", startingAt: 0)
                let book = entry.context.map { " — book: \"\($0)\"" } ?? ""
                return "    \(name) count=\(entry.count)  e.g. \"\(entry.sample)\"\(book)"
            }
        return ([header] + lines).joined(separator: "\n")
    }
}
