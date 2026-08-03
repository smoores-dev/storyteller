package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.util.Base64
import androidx.compose.ui.graphics.Color
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge
import dev.smoores.storyteller.model.AppSettings
import org.json.JSONObject

private const val SAMPLE_SIZE = 8

// Process-wide colorfulness config, mirrored from the shared settings so palette
// derivation sites do not have to thread it through every composable.
internal object CoverColorSettings {
    @Volatile var colorMode: String = "full"
        private set

    @Volatile var colorIntensity: Double = 0.65
        private set

    @Volatile var doubleCoverAlignment: String = "auto"
        private set

    fun update(settings: AppSettings) {
        colorMode = settings.colorMode
        colorIntensity = settings.colorIntensity
        doubleCoverAlignment = settings.doubleCoverAlignment
    }

    val key: String get() = "$colorMode-$colorIntensity"
}

internal data class CoverBackgroundPalette(
    val surface: Color,
    val accent: Color,
    val brightAccent: Color,
    val mutedAccent: Color,
    val accentBackground: Color,
    val contentBackground: Color,
    val cardBackground: Color,
    val cardBorder: Color,
)

internal fun coverBackgroundColor(bitmap: Bitmap?, darkTheme: Boolean): Color {
    return Color(
        StorytellerAndroidBridge.coverSurfaceColorARGB(
            sampledRgbaBase64(bitmap),
            darkTheme,
            CoverColorSettings.colorMode,
            CoverColorSettings.colorIntensity,
        ),
    )
}

internal fun coverBackgroundPalette(bitmap: Bitmap?, darkTheme: Boolean): CoverBackgroundPalette {
    val palette = JSONObject(
        StorytellerAndroidBridge.coverPaletteJSON(
            sampledRgbaBase64(bitmap),
            darkTheme,
            CoverColorSettings.colorMode,
            CoverColorSettings.colorIntensity,
        ),
    )
    return CoverBackgroundPalette(
        surface = palette.color("surface"),
        accent = palette.color("accent"),
        brightAccent = palette.color("brightAccent"),
        mutedAccent = palette.color("mutedAccent"),
        accentBackground = palette.color("accentBackground"),
        contentBackground = palette.color("contentBackground"),
        cardBackground = palette.color("cardBackground"),
        cardBorder = palette.color("cardBorder"),
    )
}

private fun JSONObject.color(name: String): Color = Color(getLong(name).toInt())

private fun sampledRgbaBase64(bitmap: Bitmap?): String {
    val pixels = bitmap?.let(::sampleRgba) ?: ByteArray(0)
    return Base64.encodeToString(pixels, Base64.NO_WRAP)
}

private fun sampleRgba(bitmap: Bitmap): ByteArray {
    val sample = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
    val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
    try {
        sample.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    } finally {
        if (sample !== bitmap) sample.recycle()
    }

    val rgba = ByteArray(pixels.size * 4)
    for ((index, pixel) in pixels.withIndex()) {
        val offset = index * 4
        rgba[offset] = AndroidColor.red(pixel).toByte()
        rgba[offset + 1] = AndroidColor.green(pixel).toByte()
        rgba[offset + 2] = AndroidColor.blue(pixel).toByte()
        rgba[offset + 3] = AndroidColor.alpha(pixel).toByte()
    }
    return rgba
}
