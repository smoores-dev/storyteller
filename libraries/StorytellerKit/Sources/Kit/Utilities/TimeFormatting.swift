import Foundation

public func formatTimeHoursMinutes(_ time: TimeInterval?) -> String {
    guard let time, time.isFinite else { return "—h—m" }
    let totalSeconds = max(Int(time.rounded()), 0)
    let hours = totalSeconds / 3600
    let minutes = (totalSeconds % 3600) / 60
    return "\(hours)h\(minutes)m"
}

public func formatTimeMinutesSeconds(_ time: TimeInterval?) -> String {
    guard let time, time.isFinite else { return "—m—s" }
    let totalSeconds = max(Int(time.rounded()), 0)
    let minutes = totalSeconds / 60
    let seconds = totalSeconds % 60
    return "\(minutes)m\(seconds)s"
}

public func formatSpeedPickerLabel(_ speed: Double, includeNormalLabel: Bool = false) -> String {
    if speed == 1.0 {
        return includeNormalLabel ? "Normal (1x)" : "Normal"
    }
    if speed == floor(speed) {
        return "\(Int(speed))x"
    }
    let formatted = String(format: "%.2f", speed)
    let trimmed = formatted.replacingOccurrences(
        of: "\\.?0+$",
        with: "",
        options: .regularExpression,
    )
    return "\(trimmed)x"
}
