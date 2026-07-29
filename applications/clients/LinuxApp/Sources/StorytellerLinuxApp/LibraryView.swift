import Foundation
import StorytellerKit
import SwiftCrossUI

struct LibraryView: View {
    let books: [BookMetadata]

    private static let coverColors: [Color] = [
        Color(red: 0.36, green: 0.42, blue: 0.60),
        Color(red: 0.52, green: 0.36, blue: 0.44),
        Color(red: 0.34, green: 0.50, blue: 0.42),
        Color(red: 0.58, green: 0.48, blue: 0.32),
        Color(red: 0.42, green: 0.38, blue: 0.56),
        Color(red: 0.32, green: 0.48, blue: 0.56),
    ]

    private var rows: [[(offset: Int, element: BookMetadata)]] {
        let indexed = Array(books.enumerated())
        return stride(from: 0, to: indexed.count, by: 3).map {
            Array(indexed[$0..<min($0 + 3, indexed.count)])
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(rows, id: \.first!.offset) { row in
                    HStack(spacing: 18) {
                        ForEach(row, id: \.offset) { entry in
                            coverCell(entry.element, index: entry.offset)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private func coverCell(_ book: BookMetadata, index: Int) -> some View {
        VStack(spacing: 6) {
            Text(book.title)
                .font(.system(size: 13, weight: .semibold))
                .padding(10)
                .frame(width: 120, height: 160)
                .background(Self.coverColors[index % Self.coverColors.count])
                .cornerRadius(8)
            Text(book.authors?.first?.name ?? "Unknown")
                .font(.system(size: 11))
                .foregroundColor(Color(red: 0.64, green: 0.68, blue: 0.74))
        }
    }
}
