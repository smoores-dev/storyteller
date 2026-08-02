#if os(watchOS)
import SwiftUI

struct TransferProgressView: View {
    @Environment(WatchViewModel.self) private var viewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 40))
                    .foregroundStyle(.blue)
                    .symbolEffect(.pulse)

                Text("Receiving Book")
                    .font(.headline)

                if let title = viewModel.receivingTitle {
                    Text(title)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }

                ProgressView(value: viewModel.transferProgress)
                    .progressViewStyle(.linear)

                Text("\(Int(viewModel.transferProgress * 100))%")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
#endif
