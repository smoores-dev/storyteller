package dev.smoores.storyteller.ui

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.util.DisplayMetrics
import android.view.WindowManager
import dev.smoores.storyteller.data.AUTO_UI_SCALE
import dev.smoores.storyteller.data.DisplayOptionsStore
import kotlin.math.hypot
import kotlin.math.roundToInt

// Android renders 1dp as densityDpi/160 px, so densityDpi/realDpi sets the
// physical size of the whole UI. Tablet vendors ship that ratio well above
// parity (Pixel Tablet and Galaxy Tab S9: densityDpi 320 on ~276dpi panels);
// Boox ships parity (300 on a 304dpi panel), which is phone-sized dp on a
// 10in screen. Auto normalizes large screens to the Pixel Tablet ratio.
internal object UiScale {
    const val MIN = 0.7f
    const val MAX = 2.0f

    private const val TABLET_DENSITY_TO_DPI = 320f / 276f
    private const val TABLET_MIN_DIAGONAL_INCHES = 8f
    private const val AUTO_MAX = 1.6f
    private const val DEADBAND = 1.1f

    fun automatic(context: Context): Float {
        val metrics = context.applicationContext.resources.displayMetrics
        val densityDpi = metrics.densityDpi.toFloat()
        if (densityDpi <= 0f) return 1f
        val xdpi = plausibleDpi(metrics.xdpi, densityDpi)
        val ydpi = plausibleDpi(metrics.ydpi, densityDpi)
        val (widthPixels, heightPixels) =
            displaySizePixels(context.applicationContext, metrics)
        val diagonalInches = hypot(widthPixels / xdpi, heightPixels / ydpi)
        if (diagonalInches < TABLET_MIN_DIAGONAL_INCHES) return 1f
        val densityToDpi = densityDpi / ((xdpi + ydpi) / 2f)
        val scale = (TABLET_DENSITY_TO_DPI / densityToDpi).coerceIn(1f, AUTO_MAX)
        return if (scale < DEADBAND) 1f else quantize(scale)
    }

    fun quantize(scale: Float): Float = (scale * 20f).roundToInt() / 20f

    fun effective(context: Context): Float {
        val stored = DisplayOptionsStore(context).load().uiScale
        return if (stored == AUTO_UI_SCALE) automatic(context) else stored.coerceIn(MIN, MAX)
    }

    // Applied to the activity base context: popup and dialog windows re-derive
    // LocalDensity from the host context, so a composition-level density
    // override would leave menus and sheets unscaled.
    fun scaledContext(base: Context): Context {
        val scale = effective(base)
        if (scale == 1f) return base
        val config = Configuration(base.resources.configuration)
        config.densityDpi = (config.densityDpi * scale).roundToInt()
        if (config.screenWidthDp > 0) {
            config.screenWidthDp = (config.screenWidthDp / scale).roundToInt()
        }
        if (config.screenHeightDp > 0) {
            config.screenHeightDp = (config.screenHeightDp / scale).roundToInt()
        }
        if (config.smallestScreenWidthDp > 0) {
            config.smallestScreenWidthDp = (config.smallestScreenWidthDp / scale).roundToInt()
        }
        return base.createConfigurationContext(config)
    }

    fun unscaledContext(context: Context): Context {
        val deviceDensity = context.applicationContext.resources.configuration.densityDpi
        if (context.resources.configuration.densityDpi == deviceDensity) return context
        val config = Configuration(context.resources.configuration)
        config.densityDpi = deviceDensity
        return context.createConfigurationContext(config)
    }

    private fun plausibleDpi(reported: Float, densityDpi: Float): Float =
        if (reported in 40f..1000f) reported else densityDpi

    private fun displaySizePixels(
        context: Context,
        metrics: DisplayMetrics,
    ): Pair<Float, Float> {
        val windowManager = context.getSystemService(WindowManager::class.java)
            ?: return metrics.widthPixels.toFloat() to metrics.heightPixels.toFloat()
        // Maximum, not current, so split-screen does not shrink the scale.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = windowManager.maximumWindowMetrics.bounds
            return bounds.width().toFloat() to bounds.height().toFloat()
        }
        @Suppress("DEPRECATION")
        val real = DisplayMetrics().also { windowManager.defaultDisplay.getRealMetrics(it) }
        return real.widthPixels.toFloat() to real.heightPixels.toFloat()
    }
}
