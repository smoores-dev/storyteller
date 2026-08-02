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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.AppSettings
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
            Text(if (saving) "Saving" else "Save server")
        }
        if (settings.configured) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Saved", style = MaterialTheme.typography.titleMedium)
            Text(connectionText(settings.connectionStatus, settings.connectionMessage))
        }
        if (appSettings != null) {
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
