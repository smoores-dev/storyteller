#if os(iOS) || os(macOS)
import SwiftUI

struct CategoryViewOptionsMenu: View {
    @Binding var layoutStyle: CategoryLayoutStyle
    @Binding var coverPreference: CoverPreference
    @Binding var showBookCountBadge: Bool

    var body: some View {
        Menu {
            Section("Layout") {
                ForEach(CategoryLayoutStyle.allCases) { style in
                    Button {
                        layoutStyle = style
                    } label: {
                        HStack {
                            Text(style.label)
                            Spacer()
                            if layoutStyle == style {
                                Image(systemName: "checkmark")
                                    .imageScale(.small)
                            }
                        }
                    }
                }
            }

            Divider()

            Section("Cover Style") {
                ForEach(CoverPreference.allCases) { preference in
                    Button {
                        coverPreference = preference
                    } label: {
                        HStack {
                            Text(preference.label)
                            Spacer()
                            if coverPreference == preference {
                                Image(systemName: "checkmark")
                                    .imageScale(.small)
                            }
                        }
                    }
                }
            }

            Divider()

            Button {
                showBookCountBadge.toggle()
            } label: {
                HStack {
                    Text("Show Book Count")
                    Spacer()
                    if showBookCountBadge {
                        Image(systemName: "checkmark")
                            .imageScale(.small)
                    }
                }
            }
        } label: {
            Label("View Options", systemImage: "ellipsis.circle")
        }
        #if os(macOS)
        .menuStyle(.borderlessButton)
        #endif
    }
}

#endif
