package dev.smoores.storyteller

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import dev.smoores.storyteller.data.DisplayOptionsStore
import dev.smoores.storyteller.ui.StorytellerApp
import dev.smoores.storyteller.ui.StorytellerViewModel
import dev.smoores.storyteller.ui.UiScale
import java.io.File

class MainActivity : ComponentActivity() {
    companion object {
        private var didCleanDownloadTemps = false
    }

    private lateinit var viewModel: StorytellerViewModel
    private val displayOptionsStore by lazy { DisplayOptionsStore(applicationContext) }

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(UiScale.scaledContext(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!didCleanDownloadTemps) {
            cleanupAbandonedSwiftDownloads(cacheDir)
            didCleanDownloadTemps = true
        }
        enableEdgeToEdge()

        viewModel = ViewModelProvider(
            this,
            StorytellerViewModel.factory(applicationContext),
        )[StorytellerViewModel::class.java]

        setContent { StorytellerApp(viewModel) }
        handleBrowserLoginRedirect(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleBrowserLoginRedirect(intent)
    }

    private fun handleBrowserLoginRedirect(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "storyteller") return
        if (!::viewModel.isInitialized) return
        intent.data = null
        setIntent(intent)
        viewModel.completeBrowserLogin(uri.toString())
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (handleVolumePageTurn(event)) return true
        return super.dispatchKeyEvent(event)
    }

    private fun handleVolumePageTurn(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_VOLUME_UP &&
            event.keyCode != KeyEvent.KEYCODE_VOLUME_DOWN
        ) {
            return false
        }
        if (!::viewModel.isInitialized) return false
        val state = viewModel.state.value
        val readingEbook = state.readerOpen != null && state.readerModeName != "audio"
        if (!readingEbook) return false
        // While readaloud or an audiobook is playing, the rocker must keep
        // controlling volume.
        if (state.reader?.isPlaying == true || state.audiobook?.isPlaying == true) return false
        if (!displayOptionsStore.load().volumeKeyPageTurn) return false
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            val command = if (event.keyCode == KeyEvent.KEYCODE_VOLUME_UP) "goLeft" else "goRight"
            viewModel.readerControl(command)
        }
        return true
    }

    override fun onStart() {
        super.onStart()
        viewModel.appDidBecomeActive()
    }

    override fun onResume() {
        super.onResume()
        viewModel.appDidResume()
    }

    override fun onStop() {
        super.onStop()
        viewModel.appDidEnterBackground()
    }
}

private val swiftDownloadTempName =
    Regex("""^[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}(?:\.tmp)?$""")

private fun cleanupAbandonedSwiftDownloads(cacheDirectory: File) {
    // FoundationNetworking leaves UUID temp files after cancellation or process death.
    cacheDirectory.listFiles()?.forEach { file ->
        if (file.isFile && swiftDownloadTempName.matches(file.name)) {
            file.delete()
        }
    }
}
