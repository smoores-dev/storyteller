package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.LiveSyncStatus
import kotlinx.coroutines.delay

// Settings section for Live Reading Sync; the status poll runs while visible.
@Composable
internal fun LiveReadingSyncSection(
    appSettings: AppSettings,
    setEnabled: (Boolean) -> Unit,
    loadStatus: (suspend () -> LiveSyncStatus)? = null,
) {
    var status by remember { mutableStateOf<LiveSyncStatus?>(null) }
    LaunchedEffect(loadStatus, appSettings.liveReadingSyncEnabled) {
        loadStatus ?: return@LaunchedEffect
        while (true) {
            status = runCatching { loadStatus() }.getOrNull()
            delay(1000)
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Live Reading Sync",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    "Follow readaloud playback from other devices on your local " +
                        "network. While enabled, this device broadcasts its readaloud " +
                        "position as it plays, and follows along when another opted-in " +
                        "device is narrating the same book.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = appSettings.liveReadingSyncEnabled,
                onCheckedChange = setEnabled,
            )
        }
        status?.let { current ->
            StatusRow("Listening", if (current.isActive) "Active" else "Inactive")
            StatusRow("Peers on network", current.peerCount.toString())
            StatusRow("Positions sent", current.packetsSent.toString())
            StatusRow("Positions received", current.packetsReceived.toString())
            current.lastError?.let { StatusRow("Last error", it) }
        }
    }
}

@Composable
private fun StatusRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
