#if os(macOS)
import SwiftUI

struct CategoryGroupMetadataContextMenuContent: View {
    let group: CategoryGroup
    let onEditMetadata: ([BookID]) -> Void

    private var bookIds: [BookID] {
        group.books.map(\.id)
    }

    private var labelText: String {
        "Edit Metadata for \(bookIds.count) Book\(bookIds.count == 1 ? "" : "s")..."
    }

    var body: some View {
        Button {
            onEditMetadata(bookIds)
        } label: {
            Label(labelText, systemImage: "pencil")
        }
        .disabled(bookIds.isEmpty)
    }
}
#endif
