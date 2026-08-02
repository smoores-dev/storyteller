import Foundation

public enum AlignmentMatchOverlap {
    public struct TokenRun: Equatable, Sendable {
        public let aStart: Int
        public let bStart: Int
        public let length: Int
    }

    public static func tokenize(_ text: String) -> [String] {
        text.split(whereSeparator: \.isWhitespace).map(String.init)
    }

    static func normalize(_ token: String) -> String {
        String(token.lowercased().unicodeScalars.filter {
            CharacterSet.alphanumerics.contains($0)
        })
    }

    // Longest common contiguous run of normalized word tokens, matching the web's
    // highlighter. Runs shorter than two words are not worth pointing the eye at.
    public static func longestCommonRun(_ a: [String], _ b: [String]) -> TokenRun? {
        let na = a.map(normalize)
        let nb = b.map(normalize)
        guard !na.isEmpty, !nb.isEmpty else { return nil }
        var best = TokenRun(aStart: 0, bStart: 0, length: 0)
        var prevRow = [Int](repeating: 0, count: nb.count + 1)
        for i in 1...na.count {
            var curRow = [Int](repeating: 0, count: nb.count + 1)
            for j in 1...nb.count {
                if !na[i - 1].isEmpty, na[i - 1] == nb[j - 1] {
                    let run = prevRow[j - 1] + 1
                    curRow[j] = run
                    if run > best.length {
                        best = TokenRun(aStart: i - run, bStart: j - run, length: run)
                    }
                }
            }
            prevRow = curRow
        }
        return best.length >= 2 ? best : nil
    }
}
