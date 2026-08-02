import DefaultBackend
import Foundation
import StorytellerKit
import SwiftCrossUI

@main
struct StorytellerReaderApp: App {
    init() {
        bootstrapLinuxPlatformDefaultsIfNeeded()
    }

    var body: some Scene {
        WindowGroup("Storyteller") {
            ContentView()
        }
        .defaultSize(width: 1180, height: 760)
    }
}

struct ContentView: View {
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Library")
                    .font(.system(size: 20, weight: .semibold))
                    .padding(16)
                LibraryView(books: DummyLibrary.books)
            }
            .frame(width: 470)
            ReaderPane()
        }
    }
}

struct ReaderPane: View {
    var body: some View {
        #if canImport(CWebKitGTK)
        ReaderWebView()
        #else
        VStack(spacing: 12) {
            Text("Reader")
                .font(.system(size: 24, weight: .semibold))
            Text("The reader webview runs on the Linux build (WebKitGTK).")
                .foregroundColor(Color(red: 0.64, green: 0.68, blue: 0.74))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        #endif
    }
}
