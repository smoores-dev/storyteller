#if os(tvOS)
import SwiftUI

struct TVContentView: View {
    @State private var selectedTab = 0
    @State private var homeNavigationPath = NavigationPath()
    @State private var libraryNavigationPath = NavigationPath()
    @State private var downloadsNavigationPath = NavigationPath()
    @State private var searchNavigationPath = NavigationPath()

    var body: some View {
        TabView(selection: $selectedTab) {
            TVHomeView(navigationPath: $homeNavigationPath)
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(0)

            TVLibraryView(navigationPath: $libraryNavigationPath)
                .tabItem {
                    Label("Library", systemImage: "books.vertical")
                }
                .tag(1)

            TVDownloadsView(navigationPath: $downloadsNavigationPath)
                .tabItem {
                    Label("Downloads", systemImage: "arrow.down.circle")
                }
                .tag(2)

            TVSearchView(navigationPath: $searchNavigationPath)
                .tabItem {
                    Image(systemName: "magnifyingglass")
                }
                .tag(3)

            TVSettingsView()
                .tabItem {
                    Image(systemName: "gear")
                }
                .tag(4)
        }
        .onChange(of: selectedTab) { _, _ in
            homeNavigationPath = NavigationPath()
            libraryNavigationPath = NavigationPath()
            downloadsNavigationPath = NavigationPath()
            searchNavigationPath = NavigationPath()
        }
    }
}
#endif
