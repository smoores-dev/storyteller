#if os(iOS) || os(macOS)
import SwiftUI

struct PlaceholderDetailView: View {
    var title: String
    var body: some View {
        VStack(spacing: 12) {
            Text("Your Library Is Empty!").font(.title)
            Text(
                "Add a local folder or Storyteller server in Settings > Book Sources, then use Add Book to add files."
            )
            .foregroundStyle(
                .secondary
            )
            Text("(\(title))").font(.footnote)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#endif
