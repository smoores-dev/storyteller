package dev.smoores.storyteller.platform

import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
class AndroidNowPlayingSessionPlayerTest {
    @Test
    fun acceptsSessionPreparationWhileTheMirrorIsEmpty() {
        val player = AndroidNowPlayingSessionPlayer(Looper.getMainLooper()) { _, _, _, _ -> }

        assertTrue(player.isCommandAvailable(Player.COMMAND_SET_MEDIA_ITEM))
        assertTrue(player.isCommandAvailable(Player.COMMAND_PREPARE))

        player.setMediaItem(MediaItem.Builder().setMediaId("book").build())
        player.prepare()

        assertEquals(Player.STATE_IDLE, player.playbackState)
        assertEquals(0, player.mediaItemCount)
    }

    @Test
    fun publishesChapterStateAndForwardsCommands() {
        val commands = mutableListOf<ReceivedCommand>()
        val player = AndroidNowPlayingSessionPlayer(
            Looper.getMainLooper(),
        ) { token, command, value, text ->
            commands += ReceivedCommand(token, command, value, text)
        }
        player.configureCommands(commandConfiguration())
        player.update(snapshot())

        assertEquals(Player.STATE_READY, player.playbackState)
        assertEquals("The Book", player.currentMediaItem?.mediaMetadata?.title)
        assertEquals("Chapter 2", player.currentMediaItem?.mediaMetadata?.artist)
        assertEquals("The Author", player.currentMediaItem?.mediaMetadata?.albumTitle)
        assertEquals(120_000L, player.duration)
        assertEquals(12_500L, player.currentPosition)
        assertEquals(15_000L, player.seekForwardIncrement)
        assertEquals(10_000L, player.seekBackIncrement)
        assertEquals(1.25f, player.playbackParameters.speed)
        assertTrue(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE))
        assertTrue(player.isCommandAvailable(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM))
        assertTrue(player.isCommandAvailable(Player.COMMAND_SET_SPEED_AND_PITCH))
        assertFalse(player.isCommandAvailable(Player.COMMAND_SEEK_TO_NEXT))

        player.pause()
        assertFalse(player.playWhenReady)
        assertEquals(ReceivedCommand("commands", "pause", 0.0), commands.removeFirst())

        player.seekForward()
        assertEquals(ReceivedCommand("commands", "skipForward", 15.0), commands.removeFirst())

        player.seekTo(42_000L)
        assertEquals(
            ReceivedCommand("commands", "changePlaybackPosition", 42.0),
            commands.removeFirst(),
        )

        player.setPlaybackSpeed(1.5f)
        assertEquals(
            ReceivedCommand("commands", "changePlaybackRate", 1.5),
            commands.removeFirst(),
        )

        player.update(snapshot().copy(playbackRate = 1.5))
        assertEquals(1.5f, player.playbackParameters.speed)
        assertEquals(120_000L, player.duration)
    }

    @Test
    fun publishesChaptersAsASelectableQueue() {
        val commands = mutableListOf<ReceivedCommand>()
        val player = AndroidNowPlayingSessionPlayer(
            Looper.getMainLooper(),
        ) { token, command, value, text ->
            commands += ReceivedCommand(token, command, value, text)
        }
        player.configureCommands(commandConfiguration())
        player.update(snapshot())
        player.updateAudiobookState(
            AndroidNowPlayingAudiobookState(
                currentChapterID = "chapter-2",
                currentChapterIndex = 1,
                chapters = listOf(
                    AndroidNowPlayingChapter("chapter-1", "Chapter 1", 100.0),
                    AndroidNowPlayingChapter("chapter-2", "Chapter 2", 120.0),
                    AndroidNowPlayingChapter("chapter-3", "Chapter 3", 140.0),
                ),
            ),
        )

        assertEquals(3, player.mediaItemCount)
        assertEquals(1, player.currentMediaItemIndex)
        assertEquals("Chapter 1", player.getMediaItemAt(0).mediaMetadata.title)
        assertEquals("Chapter 2", player.getMediaItemAt(1).mediaMetadata.title)
        assertNull(player.getMediaItemAt(0).mediaMetadata.artworkData)
        assertNull(player.getMediaItemAt(1).mediaMetadata.artworkData)
        assertNull(player.getMediaItemAt(2).mediaMetadata.artworkData)
        assertTrue(player.mediaMetadata.artworkData.contentEquals(byteArrayOf(1, 2, 3)))
        assertEquals("The Book", player.mediaMetadata.title)
        assertEquals("Chapter 2", player.mediaMetadata.artist)
        assertTrue(player.isCommandAvailable(Player.COMMAND_SEEK_TO_MEDIA_ITEM))

        player.seekToDefaultPosition(2)
        assertEquals(
            ReceivedCommand(
                token = "commands",
                command = "selectChapter",
                value = 0.0,
                text = "chapter-3",
            ),
            commands.removeFirst(),
        )
    }

    @Test
    fun windowsTheQueueToStartOneChapterBeforeTheActiveOne() {
        val commands = mutableListOf<ReceivedCommand>()
        val player = AndroidNowPlayingSessionPlayer(
            Looper.getMainLooper(),
        ) { token, command, value, text ->
            commands += ReceivedCommand(token, command, value, text)
        }
        player.configureCommands(commandConfiguration())
        player.update(snapshot())
        player.updateAudiobookState(
            AndroidNowPlayingAudiobookState(
                currentChapterID = "chapter-4",
                currentChapterIndex = 3,
                chapters = listOf(
                    AndroidNowPlayingChapter("chapter-1", "Intro", 100.0),
                    AndroidNowPlayingChapter("chapter-2", "Rising", 120.0),
                    AndroidNowPlayingChapter("chapter-3", "Climax", 140.0),
                    AndroidNowPlayingChapter("chapter-4", "Falling", 160.0),
                    AndroidNowPlayingChapter("chapter-5", "Ending", 180.0),
                ),
            ),
        )

        assertEquals(5, player.mediaItemCount)
        assertEquals(1, player.currentMediaItemIndex)
        assertEquals("Climax", player.getMediaItemAt(0).mediaMetadata.title)
        assertEquals("Falling", player.getMediaItemAt(1).mediaMetadata.title)
        assertEquals("Ending", player.getMediaItemAt(2).mediaMetadata.title)
        assertEquals("Previous · Intro", player.getMediaItemAt(3).mediaMetadata.title)
        assertEquals("Previous · Rising", player.getMediaItemAt(4).mediaMetadata.title)

        player.seekToDefaultPosition(3)
        assertEquals(
            ReceivedCommand(
                token = "commands",
                command = "selectChapter",
                value = 0.0,
                text = "chapter-1",
            ),
            commands.removeFirst(),
        )
    }

    @Test
    fun teardownAndClearRemainIndependentAndRejectStaleTokens() {
        val player = AndroidNowPlayingSessionPlayer(Looper.getMainLooper()) { _, _, _, _ -> }
        player.configureCommands(commandConfiguration())
        player.update(snapshot())

        player.teardownCommands("stale")
        assertTrue(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE))

        player.teardownCommands("commands")
        assertFalse(player.isCommandAvailable(Player.COMMAND_PLAY_PAUSE))
        assertEquals(Player.STATE_READY, player.playbackState)
        assertEquals("The Book", player.currentMediaItem?.mediaMetadata?.title)

        player.clear()
        assertEquals(Player.STATE_IDLE, player.playbackState)
        assertEquals(0, player.mediaItemCount)
    }

    @Test
    fun positionSeekingFollowsTheCommandConfiguration() {
        val player = AndroidNowPlayingSessionPlayer(Looper.getMainLooper()) { _, _, _, _ -> }
        player.configureCommands(
            commandConfiguration().copy(supportsChangePlaybackPosition = false),
        )
        player.update(snapshot())

        assertFalse(player.isCurrentMediaItemSeekable)
        assertFalse(player.isCommandAvailable(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM))
        assertTrue(player.isCommandAvailable(Player.COMMAND_SEEK_FORWARD))
    }

    private fun snapshot() = AndroidNowPlayingSnapshot(
        title = "The Book",
        artist = "Chapter 2",
        albumTitle = "The Author",
        durationSeconds = 120.0,
        elapsedSeconds = 12.5,
        playbackRate = 1.25,
        isPlaying = true,
        artwork = byteArrayOf(1, 2, 3),
    )

    private fun commandConfiguration() = AndroidNowPlayingCommandConfiguration(
        token = "commands",
        skipForwardSeconds = 15.0,
        skipBackwardSeconds = 10.0,
        supportsChangePlaybackPosition = true,
        supportsChangePlaybackRate = true,
    )

    private data class ReceivedCommand(
        val token: String,
        val command: String,
        val value: Double,
        val text: String = "",
    )
}
