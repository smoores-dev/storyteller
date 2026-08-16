#if os(macOS)
import SwiftUI

struct CollapsibleSearchField: View {
    var placeholder: String = "Search"
    @Binding var searchText: String
    var focusRequest: Binding<Bool>? = nil
    var expandedWidth: CGFloat = 220

    @State private var isExpanded = false
    @State private var focusTrigger = false

    private var isShowingField: Bool {
        isExpanded || !searchText.isEmpty
    }

    var body: some View {
        Group {
            if isShowingField {
                DebouncedSearchField(
                    placeholder: placeholder,
                    searchText: $searchText,
                    focusRequest: $focusTrigger,
                    onFocusChange: { focused in
                        guard !focused, searchText.isEmpty else { return }
                        collapse()
                    },
                )
                .frame(width: expandedWidth)
                .onExitCommand { collapse() }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                Button {
                    expand()
                } label: {
                    Image(systemName: "magnifyingglass")
                }
                .libraryBarButton()
                .help(placeholder)
            }
        }
        .onChange(of: focusRequest?.wrappedValue ?? false) { _, requested in
            guard requested else { return }
            focusRequest?.wrappedValue = false
            expand()
        }
    }

    private func expand() {
        withAnimation(.easeOut(duration: 0.18)) {
            isExpanded = true
        }
        focusTrigger = true
    }

    private func collapse() {
        searchText = ""
        withAnimation(.easeOut(duration: 0.18)) {
            isExpanded = false
        }
    }
}
#endif
