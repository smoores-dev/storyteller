package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.smoores.storyteller.model.ReaderTheme

// Port of Customize/ThemeCustomizeCard.swift; no Reset, the theme list owns that.
@Composable
internal fun ThemeCustomizeCard(
    themes: List<ReaderTheme>,
    selectedLightThemeId: String?,
    selectedDarkThemeId: String?,
    onSelectLightTheme: (String) -> Unit,
    onSelectDarkTheme: (String) -> Unit,
    onSaveTheme: (String) -> Unit,
    onDeleteTheme: (String) -> Unit,
    onResetTheme: (String) -> Unit,
    onDone: () -> Unit,
) {
    CustomizeCardContainer(title = "Theme", onDone = onDone, onReset = null) {
        ManageThemesContent(
            themes = themes,
            selectedLightThemeId = selectedLightThemeId,
            selectedDarkThemeId = selectedDarkThemeId,
            onSelectLightTheme = onSelectLightTheme,
            onSelectDarkTheme = onSelectDarkTheme,
            onSaveTheme = onSaveTheme,
            onDeleteTheme = onDeleteTheme,
            onResetTheme = onResetTheme,
            listModifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding(),
        )
    }
}
