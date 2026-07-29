package dev.smoores.storyteller.ui

import android.content.ComponentName
import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import dev.smoores.storyteller.model.AudiobookPlayerState
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.platform.StorytellerMediaLibraryService

@Composable
internal fun MediaSessionAudiobookPlayerScreen(
    book: Book,
    state: AudiobookPlayerState?,
    loading: Boolean,
    modifier: Modifier,
    togglePlayPause: () -> Unit,
    skipBackward: () -> Unit,
    skipForward: () -> Unit,
    previousChapter: () -> Unit,
    nextChapter: () -> Unit,
    seekChapter: (Double) -> Unit,
    selectChapter: (String) -> Unit,
    setPlaybackRate: (Double) -> Unit,
    setVolume: (Double) -> Unit,
    startSleepTimer: (Double) -> Unit,
    startEndOfChapterSleepTimer: () -> Unit,
    cancelSleepTimer: () -> Unit,
    acceptServerPosition: () -> Unit,
    declineServerPosition: () -> Unit,
) {
    val connection = rememberStorytellerMediaController()
    val controller = connection.controller
    if (controller != null) {
        AudiobookPlayerScreen(
            book = book,
            state = state,
            loading = loading,
            player = controller,
            modifier = modifier,
            togglePlayPause = togglePlayPause,
            skipBackward = skipBackward,
            skipForward = skipForward,
            previousChapter = previousChapter,
            nextChapter = nextChapter,
            seekChapter = seekChapter,
            selectChapter = selectChapter,
            setPlaybackRate = setPlaybackRate,
            setVolume = setVolume,
            startSleepTimer = startSleepTimer,
            startEndOfChapterSleepTimer = startEndOfChapterSleepTimer,
            cancelSleepTimer = cancelSleepTimer,
            acceptServerPosition = acceptServerPosition,
            declineServerPosition = declineServerPosition,
        )
        return
    }

    Column(
        modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(book.title, style = MaterialTheme.typography.headlineMedium)
        if (connection.error == null) {
            CircularProgressIndicator(Modifier.padding(top = 32.dp))
            Text("Connecting to Android media controls…", modifier = Modifier.padding(top = 12.dp))
        } else {
            Text(
                "Could not connect to Android media controls.\n${connection.error}",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 24.dp),
            )
        }
    }
}

// Media3 only promotes StorytellerMediaLibraryService to a foreground service
// while a controller is connected when playback starts, so readaloud audio
// needs a standing connection even though the reader UI never uses the
// controller itself.
@Composable
internal fun KeepPlaybackServiceConnected(active: Boolean) {
    val context = LocalContext.current.applicationContext
    DisposableEffect(active) {
        if (!active) {
            return@DisposableEffect onDispose {}
        }
        val token = SessionToken(
            context,
            ComponentName(context, StorytellerMediaLibraryService::class.java),
        )
        val future = MediaController.Builder(context, token).buildAsync()
        onDispose { MediaController.releaseFuture(future) }
    }
}

private data class MediaControllerConnection(
    val controller: MediaController? = null,
    val error: String? = null,
)

@Composable
private fun rememberStorytellerMediaController(): MediaControllerConnection {
    val context = LocalContext.current.applicationContext
    var connection by remember(context) { mutableStateOf(MediaControllerConnection()) }

    DisposableEffect(context) {
        val token = SessionToken(
            context,
            ComponentName(context, StorytellerMediaLibraryService::class.java),
        )
        val future = MediaController.Builder(context, token).buildAsync()
        future.addListener(
            {
                runCatching { future.get() }
                    .onSuccess { connection = MediaControllerConnection(controller = it) }
                    .onFailure { error ->
                        Log.e(TAG, "Could not connect to the media library service", error)
                        connection = MediaControllerConnection(
                            error = error.cause?.message ?: error.message ?: error.toString(),
                        )
                    }
            },
            context.mainExecutor,
        )

        onDispose {
            connection = MediaControllerConnection()
            MediaController.releaseFuture(future)
        }
    }

    return connection
}

private const val TAG = "StorytellerMediaController"
