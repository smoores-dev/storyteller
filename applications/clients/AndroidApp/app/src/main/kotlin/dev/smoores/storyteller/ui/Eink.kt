package dev.smoores.storyteller.ui

import androidx.compose.runtime.staticCompositionLocalOf

internal data class EinkUiState(
    val optimizeRefresh: Boolean = false,
)

internal val LocalEink = staticCompositionLocalOf { EinkUiState() }
