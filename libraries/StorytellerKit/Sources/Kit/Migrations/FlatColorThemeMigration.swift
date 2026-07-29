import Foundation

extension FilesystemActor {
    private static let flatColorThemeMigrationID = "flat-color-theme-v1"

    func runFlatColorThemeMigrationIfNeeded() async throws {
        guard !migrationSentinelExists(Self.flatColorThemeMigrationID) else { return }

        if try storedConfigPredatesThemes() {
            await migrateFlatColorsToCustomTheme()
        }
        try writeMigrationSentinel(Self.flatColorThemeMigrationID)
    }

    private func storedConfigPredatesThemes() throws -> Bool {
        let url = getConfigDirectory()
            .appendingPathComponent("StorytellerGlobalConfig.json", isDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else { return false }
        let data = try Data(contentsOf: url)
        let rawKeys = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return rawKeys?["themes"] == nil
    }

    private func migrateFlatColorsToCustomTheme() async {
        let reading = await SettingsActor.shared.config.reading
        let defaults = StorytellerGlobalConfig.Reading()
        let hasCustomColors =
            reading.backgroundColor != defaults.backgroundColor
            || reading.foregroundColor != defaults.foregroundColor
            || reading.highlightColor != defaults.highlightColor
            || reading.highlightThickness != defaults.highlightThickness
            || reading.readaloudHighlightMode != defaults.readaloudHighlightMode
            || reading.userHighlightColor1 != defaults.userHighlightColor1
            || reading.userHighlightColor2 != defaults.userHighlightColor2
            || reading.userHighlightColor3 != defaults.userHighlightColor3
            || reading.userHighlightColor4 != defaults.userHighlightColor4
            || reading.userHighlightColor5 != defaults.userHighlightColor5
            || reading.userHighlightColor6 != defaults.userHighlightColor6
            || reading.userHighlightLabel1 != defaults.userHighlightLabel1
            || reading.userHighlightLabel2 != defaults.userHighlightLabel2
            || reading.userHighlightLabel3 != defaults.userHighlightLabel3
            || reading.userHighlightLabel4 != defaults.userHighlightLabel4
            || reading.userHighlightLabel5 != defaults.userHighlightLabel5
            || reading.userHighlightLabel6 != defaults.userHighlightLabel6
            || reading.userHighlightMode != defaults.userHighlightMode
            || reading.customCSS != defaults.customCSS

        guard hasCustomColors else { return }

        let customTheme = ReaderTheme(
            name: "My Custom Theme",
            isBuiltIn: false,
            backgroundColor: reading.backgroundColor ?? kDefaultBackgroundColorLight,
            foregroundColor: reading.foregroundColor ?? kDefaultForegroundColorLight,
            highlightColor: reading.highlightColor ?? "#CCCCCC",
            highlightThickness: reading.highlightThickness,
            readaloudHighlightMode: reading.readaloudHighlightMode,
            userHighlightColor1: reading.userHighlightColor1,
            userHighlightColor2: reading.userHighlightColor2,
            userHighlightColor3: reading.userHighlightColor3,
            userHighlightColor4: reading.userHighlightColor4,
            userHighlightColor5: reading.userHighlightColor5,
            userHighlightColor6: reading.userHighlightColor6,
            userHighlightLabel1: reading.userHighlightLabel1,
            userHighlightLabel2: reading.userHighlightLabel2,
            userHighlightLabel3: reading.userHighlightLabel3,
            userHighlightLabel4: reading.userHighlightLabel4,
            userHighlightLabel5: reading.userHighlightLabel5,
            userHighlightLabel6: reading.userHighlightLabel6,
            userHighlightMode: reading.userHighlightMode,
            customCSS: reading.customCSS,
        )

        do {
            try await SettingsActor.shared.updateConfig(
                selectedLightThemeId: customTheme.id,
                selectedDarkThemeId: customTheme.id,
                customThemes: [customTheme],
            )
            debugLog(
                "[StorytellerMigrations] Migrated flat color settings to custom theme "
                    + "'\(customTheme.name)'"
            )
        } catch {
            debugLog("[StorytellerMigrations] Flat color theme migration failed to save: \(error)")
        }
    }
}
