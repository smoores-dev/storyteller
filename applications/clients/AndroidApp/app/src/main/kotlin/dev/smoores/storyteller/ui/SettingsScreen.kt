package dev.smoores.storyteller.ui

import android.content.ClipData
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.smoores.storyteller.data.AUTO_UI_SCALE
import dev.smoores.storyteller.data.DisplayOptions
import dev.smoores.storyteller.data.EinkOptions
import dev.smoores.storyteller.model.AppSettings
import dev.smoores.storyteller.model.DebugLogState
import dev.smoores.storyteller.model.LiveSyncStatus
import dev.smoores.storyteller.model.StorytellerSettings
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

@Composable
internal fun SettingsScreen(
    settings: StorytellerSettings,
    settingsLoaded: Boolean,
    saving: Boolean,
    appSettings: AppSettings?,
    modifier: Modifier,
    startBrowserLogin: (String) -> Unit = {},
    signOutBrowserLogin: () -> Unit = {},
    updateAppSettings: (Double?, Double?, Boolean?) -> Unit,
    updateLibrarySettings: (String?, Double?, String?) -> Unit,
    updateExperimentalSettings: (Boolean) -> Unit = {},
    setLiveSyncEnabled: (Boolean) -> Unit = {},
    loadLiveSyncStatus: (suspend () -> LiveSyncStatus)? = null,
    loadDebugLog: (suspend () -> DebugLogState)? = null,
    clearDebugLog: (suspend () -> Unit)? = null,
    setVerboseLogging: (Boolean) -> Unit = {},
    einkOptions: EinkOptions? = null,
    updateEinkOptions: (EinkOptions) -> Unit = {},
    displayOptions: DisplayOptions = DisplayOptions(),
    automaticUiScale: Float = 1f,
    updateDisplayOptions: (DisplayOptions) -> Unit = {},
) {
    var serverURL by rememberSaveable { mutableStateOf("") }
    var loadedSourceID by rememberSaveable { mutableStateOf<String?>(null) }
    var showSignOutConfirmation by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(settingsLoaded, settings.sourceID) {
        if (!settingsLoaded) return@LaunchedEffect
        val sourceKey = settings.sourceID ?: "new"
        if (loadedSourceID != sourceKey) {
            serverURL = settings.serverURL
            loadedSourceID = sourceKey
        }
    }

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Add the Storyteller server used by this device. Sign in through your " +
                "server's web login, including any single sign-on providers.",
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
        Button(
            onClick = { startBrowserLogin(serverURL) },
            enabled = !saving && serverURL.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                if (settings.usesBrowserLogin) "Sign In Again with Browser" else "Sign In with Browser"
            )
        }
        if (settings.usesBrowserLogin) {
            Text(
                "Signed in as ${settings.username} through the browser.",
                style = MaterialTheme.typography.bodyMedium,
            )
            TextButton(
                onClick = { showSignOutConfirmation = true },
                enabled = !saving,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign Out")
            }
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
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Advanced", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Enable Experimental Settings",
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Text(
                        "Unlocks in-development options, like the readaloud highlight " +
                            "visibility modes.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = appSettings.experimentalSettings,
                    onCheckedChange = updateExperimentalSettings,
                )
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        Text("Display", style = MaterialTheme.typography.titleMedium)
        UiScaleSetting(
            options = displayOptions,
            automaticScale = automaticUiScale,
            update = updateDisplayOptions,
        )
        SettingToggleRow(
            title = "Volume keys turn pages",
            subtitle = "Flip pages with the volume rocker while reading. The rocker " +
                "controls volume as usual whenever audio is playing.",
            checked = displayOptions.volumeKeyPageTurn,
            onCheckedChange = { updateDisplayOptions(displayOptions.copy(volumeKeyPageTurn = it)) },
        )
        if (einkOptions != null) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("E-Ink", style = MaterialTheme.typography.titleMedium)
            SettingToggleRow(
                title = "Optimize screen refresh",
                subtitle = "Request a full-quality refresh on reader page turns and " +
                    "clear ghosting when leaving the reader.",
                checked = einkOptions.optimizeRefresh,
                onCheckedChange = { updateEinkOptions(einkOptions.copy(optimizeRefresh = it)) },
            )
            SettingToggleRow(
                title = "Book cover sleep screen",
                subtitle = "Set the device sleep screensaver to the cover of the book " +
                    "being read. Replaces any screensaver image configured in the " +
                    "device settings.",
                checked = einkOptions.coverScreensaver,
                onCheckedChange = { updateEinkOptions(einkOptions.copy(coverScreensaver = it)) },
            )
        }
        if (loadDebugLog != null) {
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("Debug", style = MaterialTheme.typography.titleMedium)
            DebugLogSection(
                loadDebugLog = loadDebugLog,
                clearDebugLog = clearDebugLog,
                setVerboseLogging = setVerboseLogging,
            )
        }
    }

    if (showSignOutConfirmation) {
        AlertDialog(
            onDismissRequest = { showSignOutConfirmation = false },
            title = { Text("Sign out of this server?") },
            text = {
                Text(
                    "The browser sign-in and any downloaded books for this server are " +
                        "removed from this device.",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showSignOutConfirmation = false
                    signOutBrowserLogin()
                }) { Text("Sign Out", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutConfirmation = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun UiScaleSetting(
    options: DisplayOptions,
    automaticScale: Float,
    update: (DisplayOptions) -> Unit,
) {
    val isAutomatic = options.uiScale == AUTO_UI_SCALE
    val effectiveScale = if (isAutomatic) automaticScale else options.uiScale
    var preview by remember(options.uiScale, automaticScale) {
        mutableStateOf(effectiveScale)
    }
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("UI scale", style = MaterialTheme.typography.bodyLarge)
                Text(
                    "Sizes the app's controls and text. Auto matches standard " +
                        "tablet sizing on large screens.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(
                onClick = { update(options.copy(uiScale = AUTO_UI_SCALE)) },
                enabled = !isAutomatic,
            ) {
                Text("Auto")
            }
        }
        SettingSlider(
            label = if (isAutomatic) "Automatic" else "Scale",
            value = preview.toDouble(),
            range = UiScale.MIN..UiScale.MAX,
            format = { "${(it * 100).roundToInt()}%" },
            onPreview = { preview = it },
            onCommit = { update(options.copy(uiScale = UiScale.quantize(it))) },
        )
    }
}

@Composable
private fun SettingToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun DebugLogSection(
    loadDebugLog: suspend () -> DebugLogState,
    clearDebugLog: (suspend () -> Unit)?,
    setVerboseLogging: (Boolean) -> Unit,
) {
    var dialogOpen by rememberSaveable { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Debug Log", style = MaterialTheme.typography.bodyLarge)
            Text(
                "Recent app activity, for bug reports.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        TextButton(onClick = { dialogOpen = true }) { Text("View") }
    }
    if (dialogOpen) {
        DebugLogDialog(
            onDismiss = { dialogOpen = false },
            loadDebugLog = loadDebugLog,
            clearDebugLog = clearDebugLog,
            setVerboseLogging = setVerboseLogging,
        )
    }
}

@Composable
private fun DebugLogDialog(
    onDismiss: () -> Unit,
    loadDebugLog: suspend () -> DebugLogState,
    clearDebugLog: (suspend () -> Unit)?,
    setVerboseLogging: (Boolean) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboard.current
    var verbose by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf(listOf<String>()) }
    val refresh: suspend () -> Unit = {
        runCatching { loadDebugLog() }.getOrNull()?.let {
            verbose = it.verbose
            messages = it.messages
        }
    }
    LaunchedEffect(Unit) { refresh() }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(Modifier.fillMaxSize()) {
            Column(
                Modifier.fillMaxSize().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Debug Log",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onDismiss) { Text("Close") }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("Verbose logging", style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "Includes high-volume performance diagnostics. Turn this on, " +
                                "reproduce the issue, then copy the log.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = verbose,
                        onCheckedChange = {
                            verbose = it
                            setVerboseLogging(it)
                        },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${messages.size} messages",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = {
                        scope.launch {
                            clipboard.setClipEntry(
                                ClipEntry(
                                    ClipData.newPlainText(
                                        "Debug Log",
                                        messages.joinToString("\n"),
                                    ),
                                ),
                            )
                        }
                    }) { Text("Copy") }
                    if (clearDebugLog != null) {
                        TextButton(onClick = {
                            scope.launch {
                                runCatching { clearDebugLog() }
                                refresh()
                            }
                        }) { Text("Clear") }
                    }
                    TextButton(onClick = { scope.launch { refresh() } }) { Text("Refresh") }
                }
                SelectionContainer(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                ) {
                    Text(
                        messages.joinToString("\n"),
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                    )
                }
            }
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
