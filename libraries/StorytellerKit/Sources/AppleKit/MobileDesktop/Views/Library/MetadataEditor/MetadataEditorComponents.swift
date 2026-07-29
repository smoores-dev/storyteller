#if os(iOS) || os(macOS)
import SwiftUI

func metadataEditorChangeColor(for colorScheme: ColorScheme) -> Color {
    colorScheme == .light ? Color(red: 0.78, green: 0.31, blue: 0.0) : .orange
}

extension View {
    func metadataEditorBoundary(cornerRadius: CGFloat = 6) -> some View {
        overlay {
            RoundedRectangle(cornerRadius: cornerRadius)
                .stroke(Color.secondary.opacity(0.28), lineWidth: 0.75)
        }
    }

    func metadataEditorFieldBoundary(cornerRadius: CGFloat = 6) -> some View {
        padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .metadataEditorBoundary(cornerRadius: cornerRadius)
    }
}

struct WordDiffView: View {
    let oldText: String
    let newText: String
    var baseColor: Color = .secondary

    var body: some View {
        let chunks = computeWordDiff(old: oldText, new: newText)
        let attributed = chunks.reduce(into: AttributedString()) { result, chunk in
            var part = AttributedString(chunk.text)
            switch chunk.kind {
                case .same:
                    part.foregroundColor = baseColor
                case .added:
                    part.foregroundColor = .green
                    part.backgroundColor = .green.opacity(0.15)
                case .removed:
                    part.foregroundColor = .red
                    part.strikethroughStyle = .single
                    part.backgroundColor = .red.opacity(0.15)
            }
            result.append(part)
        }
        Text(attributed)
            .font(.callout)
            .textSelection(.enabled)
    }

    enum ChunkKind { case same, added, removed }
    struct Chunk {
        let text: String
        let kind: ChunkKind
    }

    private func computeWordDiff(old: String, new: String) -> [Chunk] {
        let oldWords = tokenize(old)
        let newWords = tokenize(new)

        let lcs = longestCommonSubsequence(oldWords, newWords)
        var chunks: [Chunk] = []
        var oi = 0
        var ni = 0
        var li = 0

        while oi < oldWords.count || ni < newWords.count {
            if li < lcs.count {
                while oi < oldWords.count && oldWords[oi] != lcs[li] {
                    chunks.append(Chunk(text: oldWords[oi], kind: .removed))
                    oi += 1
                }
                while ni < newWords.count && newWords[ni] != lcs[li] {
                    chunks.append(Chunk(text: newWords[ni], kind: .added))
                    ni += 1
                }
                if li < lcs.count {
                    chunks.append(Chunk(text: lcs[li], kind: .same))
                    oi += 1
                    ni += 1
                    li += 1
                }
            } else {
                while oi < oldWords.count {
                    chunks.append(Chunk(text: oldWords[oi], kind: .removed))
                    oi += 1
                }
                while ni < newWords.count {
                    chunks.append(Chunk(text: newWords[ni], kind: .added))
                    ni += 1
                }
            }
        }

        return chunks
    }

    private func tokenize(_ text: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        for char in text {
            if char.isWhitespace {
                if !current.isEmpty {
                    tokens.append(current)
                    current = ""
                }
                tokens.append(String(char))
            } else {
                current.append(char)
            }
        }
        if !current.isEmpty { tokens.append(current) }
        return tokens
    }

    private func longestCommonSubsequence(_ a: [String], _ b: [String]) -> [String] {
        let m = a.count
        let n = b.count
        guard m > 0 && n > 0 else { return [] }
        var dp = Array(repeating: Array(repeating: 0, count: n + 1), count: m + 1)
        for i in 1...m {
            for j in 1...n {
                if a[i - 1] == b[j - 1] {
                    dp[i][j] = dp[i - 1][j - 1] + 1
                } else {
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
                }
            }
        }
        var result: [String] = []
        var i = m
        var j = n
        while i > 0 && j > 0 {
            if a[i - 1] == b[j - 1] {
                result.append(a[i - 1])
                i -= 1
                j -= 1
            } else if dp[i - 1][j] > dp[i][j - 1] {
                i -= 1
            } else {
                j -= 1
            }
        }
        return result.reversed()
    }
}

#endif
