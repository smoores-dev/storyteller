import Foundation

public enum InlineMetadataParsing {
    public static func nameList(from text: String) -> [String] {
        text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    public static func publicationDateWireValue(_ input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        let day: String
        if trimmed.wholeMatch(of: /\d{4}/) != nil {
            day = trimmed + "-01-01"
        } else if trimmed.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) != nil {
            day = trimmed
        } else {
            return nil
        }

        let validator = ISO8601DateFormatter()
        validator.formatOptions = [.withFullDate]
        validator.timeZone = TimeZone(secondsFromGMT: 0)
        // The formatter rolls impossible days over (Feb 29 -> Mar 1); a round trip catches that.
        guard let parsed = validator.date(from: day), validator.string(from: parsed) == day
        else { return nil }
        return day + "T00:00:00.000Z"
    }

    public static func positionString<T: BinaryFloatingPoint & LosslessStringConvertible>(
        _ value: T?
    ) -> String {
        guard let value else { return "" }
        return value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }
}
