package dev.smoores.storyteller.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.LiveSyncStatus
import dev.smoores.storyteller.model.StorytellerSettings

@Composable
internal fun SettingsScreen(
    settings: StorytellerSettings,
    settingsLoaded: Boolean,
    saving: Boolean,
    appSettings: AppSettings?,
    modifier: Modifier,
    save: (String, String, String) -> Unit,
    updateAppSettings: (Double?, Double?, Boolean?) -> Unit,
    updateLibrarySettings: (String?, Double?, String?) -> Unit,
    setLiveSyncEnabled: (Boolean) -> Unit = {},
    loadLiveSyncStatus: (suspend () -> LiveSyncStatus)? = null,
) {
    var serverURL by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loadedSourceID by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(settingsLoaded, settings.sourceID) {
        if (!settingsLoaded) return@LaunchedEffect
        val sourceKey = settings.sourceID ?: "new"
        if (loadedSourceID != sourceKey) {
            serverURL = settings.serverURL
            username = settings.username
            password = ""
            loadedSourceID = sourceKey
        }
    }

    val canSave = !saving && serverURL.isNotBlank() && username.isNotBlank() &&
        (settings.configured || password.isNotBlank())
    val submit = {
        val submittedPassword = password
        password = ""
        save(serverURL, username, submittedPassword)
    }
    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Add the Storyteller server used by this device. The source registry and " +
                "credentials are persisted through the Android platform providers.",
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = serverURL,
            onValueChange = { serverURL = it },
            label = { Text("Server URL") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username or email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            supportingText = {
                if (settings.configured) Text("Leave blank to keep the saved password")
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                if (canSave) submit()
            }),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = submit,
            enabled = canSave,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (saving) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    modifier = Modifier.width(18.dp).height(18.dp),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(if (saving) "Connecting" else "Save & Connect")
        }
        if (settings.configured) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Saved", style = MaterialTheme.typography.titleMedium)
            val connectionFailed = settings.connectionStatus == "error" ||
                settings.connected == false
            Text(
                connectionText(settings.connectionStatus, settings.connectionMessage),
                color = if (connectionFailed) {
                    MaterialTheme.colorScheme.error
                } else {
                    Color.Unspecified
                },
            )
        }
        if (appSettings != null) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Colorfulness", style = MaterialTheme.typography.titleMedium)
            ColorfulnessSettings(appSettings, updateLibrarySettings)
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Sync", style = MaterialTheme.typography.titleMedium)
            IntervalPicker(
                label = "Progress Sync Interval",
                selected = appSettings.progressSyncIntervalSeconds,
                onSelect = { updateAppSettings(it, null, null) },
            )
            IntervalPicker(
                label = "Metadata Refresh Interval",
                selected = appSettings.metadataRefreshIntervalSeconds,
                onSelect = { updateAppSettings(null, it, null) },
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Auto-navigate to server position",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        "When the server has a newer reading position from another " +
                            "device, jump to it automatically instead of asking.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = appSettings.autoSyncToNewerServerPosition,
                    onCheckedChange = { updateAppSettings(null, null, it) },
                )
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            LiveReadingSyncSection(
                appSettings = appSettings,
                setEnabled = setLiveSyncEnabled,
                loadStatus = loadLiveSyncStatus,
            )
        }
    }
}

private val colorModes = listOf(
    "full" to "Full",
    "medium" to "Medium",
    "minimal" to "Minimal",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ColorfulnessSettings(
    appSettings: AppSettings,
    updateLibrarySettings: (String?, Double?, String?) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Color Level", style = MaterialTheme.typography.bodyLarge)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            colorModes.forEachIndexed { index, (value, label) ->
                SegmentedButton(
                    selected = appSettings.colorMode == value,
                    onClick = {
                        if (appSettings.colorMode != value) {
                            updateLibrarySettings(value, null, null)
                        }
                    },
                    shape = SegmentedButtonDefaults.itemShape(
                        index = index,
                        count = colorModes.size,
                    ),
                ) { Text(label) }
            }
        }

        val intensityEnabled = appSettings.colorMode != "minimal"
        // The slider is local state while dragging; the setting persists on release.
        var intensity by remember(appSettings.colorIntensity) {
            mutableStateOf(appSettings.colorIntensity.toFloat())
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Color Intensity",
                style = MaterialTheme.typography.bodyLarge,
                color = if (intensityEnabled) {
                    Color.Unspecified
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.weight(1f),
            )
            Text(
                "${(intensity * 100).toInt()}%",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Slider(
            value = intensity,
            onValueChange = { intensity = (it * 20).toInt() / 20f },
            onValueChangeFinished = {
                updateLibrarySettings(null, intensity.toDouble(), null)
            },
            valueRange = 0f..1f,
            enabled = intensityEnabled,
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Tilt Covers When Not Synced",
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    "In the double-cover style, an ebook and audiobook pair without a " +
                        "readaloud alignment sits slightly askew until it is synced.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = appSettings.doubleCoverAlignment != "straight",
                onCheckedChange = { tilted ->
                    updateLibrarySettings(null, null, if (tilted) "auto" else "straight")
                },
            )
        }
    }
}

// Mirrors the interval steps offered on iOS/macOS; -1 disables the timer.
private val syncIntervalOptions = listOf(
    10.0, 30.0, 60.0, 120.0, 300.0, 600.0, 1800.0, 3600.0, 7200.0, 14400.0, -1.0,
)

internal fun formatSyncInterval(seconds: Double): String = when {
    seconds < 0 -> "Never"
    seconds < 60 -> "${seconds.toInt()} seconds"
    seconds < 3600 -> "${(seconds / 60).toInt()} minutes"
    seconds == 3600.0 -> "1 hour"
    else -> "${(seconds / 3600).toInt()} hours"
}

@Composable
private fun IntervalPicker(
    label: String,
    selected: Double,
    onSelect: (Double) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Box {
            TextButton(onClick = { expanded = true }) {
                Text(formatSyncInterval(selected))
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                syncIntervalOptions.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(formatSyncInterval(option)) },
                        trailingIcon = {
                            if (option == selected) {
                                Icon(Icons.Filled.Check, contentDescription = "Selected")
                            }
                        },
                        onClick = {
                            expanded = false
                            if (option != selected) onSelect(option)
                        },
                    )
                }
            }
        }
    }
}

internal fun connectionText(status: String, message: String?): String =
    message ?: when (status) {
        "connected" -> "Connected"
        "connecting" -> "Connecting"
        "disconnected" -> "Saved; not currently connected"
        "error" -> "Could not connect"
        else -> "Not configured"
    }
