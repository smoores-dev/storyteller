#if os(iOS) || os(macOS)
import Foundation

public struct ProgressData {
    public let chapterId: String?
    public let chapterLabel: String?
    public let chapterCurrentPage: Int?
    public let chapterTotalPages: Int?
    public let chapterCurrentSecondsAudio: Double?
    public let chapterTotalSecondsAudio: Double?
    public let bookCurrentSecondsAudio: Double?
    public let bookTotalSecondsAudio: Double?
    public let bookCurrentFraction: Double?

    public init(
        chapterId: String? = nil,
        chapterLabel: String? = nil,
        chapterCurrentPage: Int? = nil,
        chapterTotalPages: Int? = nil,
        chapterCurrentSecondsAudio: Double? = nil,
        chapterTotalSecondsAudio: Double? = nil,
        bookCurrentSecondsAudio: Double? = nil,
        bookTotalSecondsAudio: Double? = nil,
        bookCurrentFraction: Double? = nil,
    ) {
        self.chapterId = chapterId
        self.chapterLabel = chapterLabel
        self.chapterCurrentPage = chapterCurrentPage
        self.chapterTotalPages = chapterTotalPages
        self.chapterCurrentSecondsAudio = chapterCurrentSecondsAudio
        self.chapterTotalSecondsAudio = chapterTotalSecondsAudio
        self.bookCurrentSecondsAudio = bookCurrentSecondsAudio
        self.bookTotalSecondsAudio = bookTotalSecondsAudio
        self.bookCurrentFraction = bookCurrentFraction
    }
}

func normalizedSeconds(_ value: Double?) -> TimeInterval? {
    guard let value, value.isFinite, value >= 0 else { return nil }
    return value
}

func normalizedFraction(_ value: Double?) -> Double? {
    guard let value, value.isFinite else { return nil }
    return min(max(value, 0), 1)
}

func normalizedCurrentPage(_ value: Int?) -> Int? {
    guard let value, value > 0 else { return nil }
    return value
}

func normalizedTotalPage(_ value: Int?) -> Int? {
    guard let value, value > 0 else { return nil }
    return value
}

func bookAudioFraction(current: Double?, total: Double?) -> Double? {
    guard let elapsed = normalizedSeconds(current),
        let total = normalizedSeconds(total), total > 0
    else {
        return nil
    }
    return min(max(elapsed / total, 0), 1)
}

func chapterAudioFraction(current: Double?, total: Double?) -> Double? {
    guard let elapsed = normalizedSeconds(current),
        let total = normalizedSeconds(total), total > 0
    else {
        return nil
    }
    return min(max(elapsed / total, 0), 1)
}

func chapterPagesFraction(current: Int?, total: Int?) -> Double? {
    guard let totalPage = normalizedTotalPage(total) else { return nil }
    let currentPage = max(min(normalizedCurrentPage(current) ?? 1, totalPage), 1)
    return min(max(Double(currentPage - 1) / Double(totalPage), 0), 1)
}

func formatPercent(_ value: Double?) -> String {
    guard let value, value.isFinite else { return "--%" }
    return String(format: "%.0f%%", max(min(value, 1), 0) * 100)
}

func formatTime(_ time: TimeInterval) -> String {
    guard time.isFinite else { return "--:--" }
    let seconds = max(Int(time.rounded()), 0)
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let remainingSeconds = seconds % 60
    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, remainingSeconds)
    } else {
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}

func formatOptionalTime(_ time: TimeInterval?) -> String {
    guard let time, time.isFinite else { return "—:—" }
    return formatTime(time)
}

func formatPlaybackRate(_ rate: Double) -> String {
    if rate == 1.0 {
        return "1.0×"
    } else {
        return String(format: "%.1f×", rate)
    }
}

func playbackRateDescription(for rate: Double) -> String {
    let formatted = String(format: "%.2fx", rate)
    if formatted.hasSuffix("0x") {
        return String(format: "%.1fx", rate)
    }
    return formatted
}

func timeRemaining(atRate playbackRate: Double, total: TimeInterval?, elapsed: TimeInterval?)
    -> TimeInterval?
{
    guard let total, total.isFinite,
        let elapsed, elapsed.isFinite,
        playbackRate > 0
    else {
        return nil
    }
    let remaining = max(total - elapsed, 0)
    return remaining / playbackRate
}

#endif
