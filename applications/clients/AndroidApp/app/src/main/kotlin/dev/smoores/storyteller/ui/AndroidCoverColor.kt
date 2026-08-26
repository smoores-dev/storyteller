package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.Book
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val SAMPLE_SIZE = 128

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
    val deepAccent: Color,
    val mutedAccent: Color,
    val accentBackground: Color,
    val contentBackground: Color,
    val cardBackground: Color,
    val cardBorder: Color,
    val ratingAccent: Color,
    val gradientTop: Color,
    val gradientBottom: Color,
    val controlTint: Color,
    val controlTintSecondary: Color,
    val controlTintTertiary: Color,
    val readerHighlight: Color,
    val isFinal: Boolean = true,
) {
    val accentTrack: Color get() = ratingAccent.copy(alpha = 0.3f)

    val playerGradient: Brush
        get() = Brush.verticalGradient(listOf(gradientTop, gradientBottom))
}

@Composable
internal fun rememberCoverBackgroundPalette(
    bitmap: Bitmap?,
    darkTheme: Boolean,
    book: Book? = null,
    audio: Boolean = false,
): CoverBackgroundPalette {
    val settingsKey = CoverColorSettings.key
    var palette by remember(bitmap, darkTheme, settingsKey, book?.id) {
        mutableStateOf(coverBackgroundPalette(bitmap, darkTheme, book, audio))
    }
    LaunchedEffect(bitmap, darkTheme, settingsKey, book?.id) {
        if (bitmap == null || book == null || palette.isFinal) return@LaunchedEffect
        repeat(100) {
            delay(3_000)
            val refreshed = try {
                withContext(Dispatchers.Default) {
                    coverBackgroundPalette(bitmap, darkTheme, book, audio)
                }
            } catch (error: Exception) {
                Log.w("CoverColors", "cover palette refresh failed", error)
                return@LaunchedEffect
            }
            if (refreshed.isFinal) {
                palette = refreshed
                return@LaunchedEffect
            }
        }
    }
    return palette
}

@Composable
internal fun rememberCoverBackgroundColor(
    bitmap: Bitmap?,
    darkTheme: Boolean,
    book: Book? = null,
    audio: Boolean = false,
): Color =
    rememberCoverBackgroundPalette(bitmap, darkTheme, book, audio).surface

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

internal fun coverBackgroundPalette(
    bitmap: Bitmap?,
    darkTheme: Boolean,
    book: Book? = null,
    audio: Boolean = false,
): CoverBackgroundPalette {
    val palette = JSONObject(
        StorytellerAndroidBridge.coverPaletteJSON(
            sampledRgbaBase64(bitmap),
            darkTheme,
            CoverColorSettings.colorMode,
            CoverColorSettings.colorIntensity,
            book?.id?.uuid ?: "",
            book?.id?.sourceID ?: "",
            audio,
        ),
    )
    return CoverBackgroundPalette(
        surface = palette.color("surface"),
        accent = palette.color("accent"),
        brightAccent = palette.color("brightAccent"),
        deepAccent = palette.color("deepAccent"),
        mutedAccent = palette.color("mutedAccent"),
        accentBackground = palette.color("accentBackground"),
        contentBackground = palette.color("contentBackground"),
        cardBackground = palette.color("cardBackground"),
        cardBorder = palette.color("cardBorder"),
        ratingAccent = palette.color("ratingAccent"),
        gradientTop = palette.color("gradientTop"),
        gradientBottom = palette.color("gradientBottom"),
        controlTint = palette.color("controlTint"),
        controlTintSecondary = palette.color("controlTintSecondary"),
        controlTintTertiary = palette.color("controlTintTertiary"),
        readerHighlight = palette.color("readerHighlight"),
        isFinal = palette.getBoolean("isFinal"),
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
