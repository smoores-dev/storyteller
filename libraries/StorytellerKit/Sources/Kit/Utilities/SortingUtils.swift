import Foundation

extension String {
    public var articleStripped: String {
        let prefixes = ["the ", "a ", "an "]
        let lowered = self.lowercased()
        for prefix in prefixes {
            if lowered.hasPrefix(prefix) && self.count > prefix.count {
                return String(self.dropFirst(prefix.count))
            }
        }
        return self
    }

    public func articleStrippedCompare(_ other: String) -> ComparisonResult {
        self.articleStripped.localizedCaseInsensitiveCompare(other.articleStripped)
    }
}
