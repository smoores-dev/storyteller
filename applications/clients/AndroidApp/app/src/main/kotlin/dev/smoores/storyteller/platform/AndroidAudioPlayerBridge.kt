package dev.smoores.storyteller.platform

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep
import dev.smoores.storyteller.bridge.StorytellerAndroidBridge
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Static JNI surface that owns and dispatches to the produced Exo audio players. */
@Keep
object AndroidAudioPlayerBridge {
    @Volatile
    private var applicationContext: Context? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private val players = mutableMapOf<String, ExoAudioPlayer>()

    fun initialize(context: Context) {
        if (applicationContext != null) return
        synchronized(this) {
            if (applicationContext == null) {
                applicationContext = context.applicationContext
            }
        }
    }

    @JvmStatic
    fun load(playerID: String, loadID: String, localPath: String) = onMain {
        player(playerID).load(loadID, localPath)
    }

    @JvmStatic
    fun play(playerID: String) = onMain { players[playerID]?.play() }

    @JvmStatic
    fun pause(playerID: String) = onMain { players[playerID]?.pause() }

    @JvmStatic
    fun stop(playerID: String) = onMain { players[playerID]?.stop() }

    @JvmStatic
    fun seek(playerID: String, seconds: Double) = onMain {
        players[playerID]?.seek(seconds)
    }

    @JvmStatic
    fun currentTime(playerID: String): Double = onMainSync {
        players[playerID]?.currentTimeSeconds() ?: 0.0
    }

    @JvmStatic
    fun duration(playerID: String): Double = onMainSync {
        players[playerID]?.durationSeconds() ?: 0.0
    }

    @JvmStatic
    fun setRate(playerID: String, rate: Double) = onMain {
        player(playerID).setRate(rate)
    }

    @JvmStatic
    fun setVolume(playerID: String, volume: Double) = onMain {
        player(playerID).setVolume(volume)
    }

    @JvmStatic
    fun release(playerID: String) = onMain {
        players.remove(playerID)?.release()
    }

    private fun player(playerID: String): ExoAudioPlayer = players.getOrPut(playerID) {
        ExoAudioPlayer(
            context = checkNotNull(applicationContext) {
                "AndroidAudioPlayerBridge.initialize(context) was not called"
            },
            callback = object : ExoAudioPlayer.Callback {
                override fun loadDidComplete(
                    loadID: String,
                    durationSeconds: Double,
                    error: String,
                ) {
                    StorytellerAndroidBridge.androidAudioPlayerLoadDidComplete(
                        playerID,
                        loadID,
                        durationSeconds,
                        error,
                    )
                }

                override fun playerEvent(loadID: String, event: String, flag: Boolean) {
                    StorytellerAndroidBridge.androidAudioPlayerEvent(
                        playerID,
                        loadID,
                        event,
                        flag,
                    )
                }
            },
        )
    }

    private fun onMain(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }

    private fun <T> onMainSync(action: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return action()

        var value: T? = null
        var failure: Throwable? = null
        val latch = CountDownLatch(1)
        mainHandler.post {
            try {
                value = action()
            } catch (error: Throwable) {
                failure = error
            } finally {
                latch.countDown()
            }
        }
        check(latch.await(PLAYER_QUERY_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            "Timed out waiting for the ExoPlayer application looper"
        }
        failure?.let { throw it }
        @Suppress("UNCHECKED_CAST")
        return value as T
    }

    private const val PLAYER_QUERY_TIMEOUT_SECONDS = 2L
}
