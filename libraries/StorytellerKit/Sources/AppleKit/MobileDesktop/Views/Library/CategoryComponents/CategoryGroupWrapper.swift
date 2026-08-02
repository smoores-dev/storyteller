#if os(iOS) || os(macOS)
import SwiftUI

struct CategoryGroup: Identifiable {
    let id: String
    let name: String
    let books: [BookMetadata]
    let pinId: String?
}

#endif
