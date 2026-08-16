#if os(macOS)
import SwiftUI

struct DebouncedSearchField: View {
    var placeholder: String = "Search"
    @Binding var searchText: String
    var focusRequest: Binding<Bool>? = nil
    var onFocusChange: ((Bool) -> Void)? = nil
    @State private var localText: String = ""
    @State private var debounceTask: Task<Void, Never>?
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .font(.system(size: 12))
            TextField(placeholder, text: $localText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .focused($isFocused)
                .onChange(of: localText) { _, newValue in
                    debounceTask?.cancel()
                    debounceTask = Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(250))
                        guard !Task.isCancelled else { return }
                        searchText = newValue
                    }
                }
            if !localText.isEmpty {
                Button {
                    localText = ""
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 11))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.secondary.opacity(0.12))
        )
        .onAppear {
            localText = searchText
            takeFocusIfRequested()
        }
        .onChange(of: searchText) { _, newValue in
            if newValue.isEmpty && !localText.isEmpty {
                localText = ""
            }
        }
        .onChange(of: isFocused) { _, focused in
            onFocusChange?(focused)
        }
        .onChange(of: focusRequest?.wrappedValue ?? false) { _, _ in
            takeFocusIfRequested()
        }
    }

    private func takeFocusIfRequested() {
        guard focusRequest?.wrappedValue == true else { return }
        focusRequest?.wrappedValue = false
        Task { @MainActor in
            isFocused = true
        }
    }
}
#endif
