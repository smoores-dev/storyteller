package dev.smoores.storyteller.platform

import android.os.Build
import android.util.Log
import android.view.View
import java.lang.reflect.Method

// Onyx firmware adds hidden refresh methods to android.view.View
internal object EinkDisplay {
    private const val TAG = "EinkDisplay"

    const val WAVEFORM_UPDATE_FULL = 32
    const val WAVEFORM_UPDATE_PARTIAL = 0
    const val WAVEFORM_MODE_WAIT = 64
    const val WAVEFORM_MODE_DU = 1
    const val WAVEFORM_MODE_GC16 = 2
    const val WAVEFORM_MODE_REAGL = 6

    val isBoox: Boolean by lazy {
        Build.MANUFACTURER.equals("onyx", ignoreCase = true) ||
            Build.BRAND.equals("onyx", ignoreCase = true) ||
            debugOverride
    }

    // adb shell setprop debug.storyteller.eink 1 to exercise the eink UI on
    // non-Boox hardware.
    private val debugOverride: Boolean by lazy {
        runCatching {
            val get = Class.forName("android.os.SystemProperties")
                .getMethod("get", String::class.java, String::class.java)
            get.invoke(null, "debug.storyteller.eink", "") == "1"
        }.getOrDefault(false)
    }

    private val refreshScreen: Method? by lazy {
        runCatching {
            Class.forName("android.view.View").getMethod(
                "refreshScreen",
                Integer.TYPE,
                Integer.TYPE,
                Integer.TYPE,
                Integer.TYPE,
                Integer.TYPE,
            )
        }.getOrNull()
    }

    private val setWaveformAndScheme: Method? by lazy {
        runCatching {
            Class.forName("android.view.View").getMethod(
                "setWaveformAndScheme",
                Integer.TYPE,
                Integer.TYPE,
                Integer.TYPE,
            )
        }.getOrNull()
    }

    val supportsRefreshControl: Boolean
        get() = isBoox && refreshScreen != null

    // Sets the system update mode and scheme to None; without this the system
    // schedules its own refresh right after ours.
    private fun preventSystemRefresh() {
        runCatching { setWaveformAndScheme?.invoke(null, 5, 1, 0) }
            .onFailure { Log.e(TAG, it.toString()) }
    }

    fun requestRefresh(view: View, waveform: Int, delayMs: Long) {
        val method = refreshScreen ?: return
        preventSystemRefresh()
        Thread {
            try {
                Thread.sleep(delayMs)
                method.invoke(view, 0, 0, view.width, view.height, waveform)
                Log.i(TAG, "requested eink refresh, waveform: $waveform")
            } catch (e: Exception) {
                Log.e(TAG, e.toString())
            }
        }.start()
    }

    fun fullQualityRefresh(view: View, delayMs: Long = 250) {
        requestRefresh(
            view,
            WAVEFORM_UPDATE_FULL + WAVEFORM_MODE_WAIT + WAVEFORM_MODE_GC16,
            delayMs,
        )
    }

    fun uiRefresh(view: View, delayMs: Long = 100) {
        requestRefresh(view, WAVEFORM_UPDATE_FULL + WAVEFORM_MODE_REAGL, delayMs)
    }
}
