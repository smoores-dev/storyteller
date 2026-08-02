package dev.smoores.storyteller

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import dev.smoores.storyteller.ui.StorytellerApp
import dev.smoores.storyteller.ui.StorytellerViewModel
import java.io.File

class MainActivity : ComponentActivity() {
    companion object {
        private var didCleanDownloadTemps = false
    }

    private lateinit var viewModel: StorytellerViewModel

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
    }

    override fun onStart() {
        super.onStart()
        viewModel.appDidBecomeActive()
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
