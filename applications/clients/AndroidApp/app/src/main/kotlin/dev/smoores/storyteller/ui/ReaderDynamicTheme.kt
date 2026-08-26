package dev.smoores.storyteller.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb

internal val LocalCoverHue = compositionLocalOf<Float?> { null }

@Composable
internal fun ReaderDynamicTheme(
    palette: CoverBackgroundPalette,
    content: @Composable () -> Unit,
) {
    val dark = palette.contentBackground.luminance() < 0.5f
    val ink = if (dark) Color(0xFFF2F2F2) else Color(0xFF1B1B1B)
    val subtleInk = ink.copy(alpha = 0.72f)
    val coverHue = FloatArray(3)
        .also { android.graphics.Color.colorToHSV(palette.surface.toArgb(), it) }[0]
    CompositionLocalProvider(LocalCoverHue provides coverHue) {
        MaterialTheme(
            colorScheme = MaterialTheme.colorScheme.copy(
                primary = palette.ratingAccent,
                onPrimary = palette.contentBackground,
                primaryContainer = palette.accentBackground,
                onPrimaryContainer = ink,
                secondary = palette.mutedAccent,
                onSecondary = palette.contentBackground,
                secondaryContainer = palette.accentBackground,
                onSecondaryContainer = ink,
                background = palette.contentBackground,
                onBackground = ink,
                surface = palette.contentBackground,
                onSurface = ink,
                surfaceVariant = palette.cardBackground,
                onSurfaceVariant = subtleInk,
                surfaceTint = palette.ratingAccent,
                surfaceContainerLowest = palette.contentBackground,
                surfaceContainerLow = palette.surface,
                surfaceContainer = palette.surface,
                surfaceContainerHigh = palette.cardBackground,
                surfaceContainerHighest = palette.cardBackground,
                outline = palette.cardBorder,
                outlineVariant = palette.cardBorder,
            ),
            content = content,
        )
    }
}
