package dev.smoores.storyteller.bridge

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.annotation.Keep
import dev.smoores.storyteller.platform.AndroidNowPlayingBridge
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred

@Keep
object AndroidBridgeCallbacks {
    private class Registration<T>(val owner: Any, val callback: T)

    // The library snapshot has more than one in-process consumer (the app's
    // ViewModel and the Android Auto MediaLibraryService), so this fans out to
    // all registered owners rather than holding a single slot.
    private val libraryListeners = ConcurrentHashMap<Any, () -> Unit>()
    @Volatile
    private var audiobookListener: Registration<(String) -> Unit>? = null
    @Volatile
    private var downloadListener: Registration<(String) -> Unit>? = null
    @Volatile
    private var sourceStatusListener: Registration<(String) -> Unit>? = null
    @Volatile
    private var readerStateListener: Registration<(String) -> Unit>? = null
    @Volatile
    private var sessionListener: Registration<(String) -> Unit>? = null
    @Volatile
    private var readerWebView: Registration<WebView>? = null
    private val payloadRequests = ConcurrentHashMap<String, CompletableDeferred<String>>()
    private val coverRequests = ConcurrentHashMap<String, CompletableDeferred<CoverPayload>>()
    private val mainHandler = Handler(Looper.getMainLooper())

    fun observe(owner: Any, onChange: () -> Unit) {
        libraryListeners[owner] = onChange
    }

    // A stale owner (an already-replaced ViewModel's client) must not tear down
    // registrations that a newer owner has since installed.
    fun clearObserver(owner: Any) {
        libraryListeners.remove(owner)
        if (audiobookListener?.owner === owner) audiobookListener = null
        if (downloadListener?.owner === owner) downloadListener = null
        if (sourceStatusListener?.owner === owner) sourceStatusListener = null
        if (readerStateListener?.owner === owner) readerStateListener = null
        if (sessionListener?.owner === owner) sessionListener = null
    }

    fun observeReaderState(owner: Any, onChange: (String) -> Unit) {
        readerStateListener = Registration(owner, onChange)
    }

    fun registerReaderWebView(owner: Any, webView: WebView) {
        readerWebView = Registration(owner, webView)
    }

    fun unregisterReaderWebView(owner: Any) {
        if (readerWebView?.owner === owner) readerWebView = null
    }

    fun observeAudiobook(owner: Any, onChange: (String) -> Unit) {
        audiobookListener = Registration(owner, onChange)
    }

    fun observeSession(owner: Any, onChange: (String) -> Unit) {
        sessionListener = Registration(owner, onChange)
    }

    fun observeDownloads(owner: Any, onChange: (String) -> Unit) {
        downloadListener = Registration(owner, onChange)
    }

    fun observeSourceStatus(owner: Any, onChange: (String) -> Unit) {
        sourceStatusListener = Registration(owner, onChange)
    }

    @JvmStatic
    fun librarySnapshotDidChange() {
        libraryListeners.values.forEach { it.invoke() }
    }

    @JvmStatic
    fun audiobookStateDidChange(payload: String) {
        audiobookListener?.callback?.invoke(payload)
    }

    @JvmStatic
    fun downloadStateDidChange(payload: String) {
        downloadListener?.callback?.invoke(payload)
    }

    @JvmStatic
    fun sourceStatusDidChange(payload: String) {
        sourceStatusListener?.callback?.invoke(payload)
    }

    @JvmStatic
    fun readerStateDidChange(payload: String) {
        android.util.Log.d("StorytellerReaderState", payload)
        readerStateListener?.callback?.invoke(payload)
    }

    @JvmStatic
    fun sessionStateDidChange(payload: String) {
        sessionListener?.callback?.invoke(payload)
    }

    @JvmStatic
    fun evaluateReaderJS(requestID: String, script: String) {
        mainHandler.post {
            val webView = readerWebView?.callback
            if (webView == null) {
                StorytellerAndroidBridge.readerJSResult(requestID, "", "No reader WebView registered")
            } else {
                webView.evaluateJavascript(script) { value ->
                    StorytellerAndroidBridge.readerJSResult(requestID, value ?: "null", "")
                }
            }
        }
    }

    suspend fun requestPayload(start: (String) -> CompletableFuture<Void>): String {
        val requestID = UUID.randomUUID().toString()
        val result = CompletableDeferred<String>()
        check(payloadRequests.putIfAbsent(requestID, result) == null)
        return try {
            start(requestID).awaitResult()
            result.await()
        } finally {
            payloadRequests.remove(requestID, result)
        }
    }

    internal suspend fun requestCover(start: (String) -> CompletableFuture<Void>): CoverPayload {
        val requestID = UUID.randomUUID().toString()
        val result = CompletableDeferred<CoverPayload>()
        check(coverRequests.putIfAbsent(requestID, result) == null)
        return try {
            start(requestID).awaitResult()
            result.await()
        } finally {
            coverRequests.remove(requestID, result)
        }
    }

    @JvmStatic
    fun bridgeRequestDidComplete(requestID: String, payload: String, error: String) {
        val request = payloadRequests.remove(requestID) ?: return
        if (error.isEmpty()) {
            request.complete(payload)
        } else {
            request.completeExceptionally(IllegalStateException(error))
        }
    }

    @JvmStatic
    fun coverRequestDidComplete(
        requestID: String,
        data: ByteArray,
        shouldPersist: Boolean,
        error: String,
    ) {
        val request = coverRequests.remove(requestID) ?: return
        if (error.isEmpty()) {
            request.complete(CoverPayload(data, shouldPersist))
        } else {
            request.completeExceptionally(IllegalStateException(error))
        }
    }
}

internal data class CoverPayload(
    val data: ByteArray,
    val shouldPersist: Boolean,
)
