#if os(iOS)
import SwiftUI

struct ThemeCustomizeCard: View {
    @Bindable var settingsVM: SettingsViewModel

    var body: some View {
        CustomizeCardContainer(title: "Theme") {
            ManageThemesView(settingsVM: settingsVM)
        }
    }
}
#endif
