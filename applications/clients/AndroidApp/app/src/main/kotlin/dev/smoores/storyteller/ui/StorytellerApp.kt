package dev.smoores.storyteller.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.activity.compose.LocalActivity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import dev.smoores.storyteller.data.AUTO_UI_SCALE
import dev.smoores.storyteller.data.DisplayOptions
import dev.smoores.storyteller.data.DisplayOptionsStore
import dev.smoores.storyteller.data.EinkOptionsStore
import dev.smoores.storyteller.data.ViewOptionsStore
import dev.smoores.storyteller.platform.BooxScreensaver
import dev.smoores.storyteller.platform.EinkDisplay
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookDetails
import dev.smoores.storyteller.model.BookID
import dev.smoores.storyteller.model.SessionKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class Screen {
    Library,
    Category,
    Settings,
    Details,
    Reader,
    BookReports,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StorytellerApp(viewModel: StorytellerViewModel) {
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var screenName by rememberSaveable { mutableStateOf(Screen.Library.name) }
    var selectedBookID by rememberSaveable { mutableStateOf<BookID?>(null) }
    var readerMode by rememberSaveable { mutableStateOf("ebook") }
    var libraryTabName by rememberSaveable { mutableStateOf(LibraryTab.Home.name) }
    var librarySearchText by rememberSaveable { mutableStateOf("") }
    var librarySortFieldName by rememberSaveable { mutableStateOf(LibrarySortField.Title.name) }
    var librarySortAscending by rememberSaveable { mutableStateOf(true) }
    var libraryFiltersJson by rememberSaveable { mutableStateOf("") }
    var categoryKindName by rememberSaveable { mutableStateOf("") }
    var categoryGroup by rememberSaveable { mutableStateOf("") }
    var restoreAttempted by rememberSaveable { mutableStateOf(false) }
    val appContext = LocalContext.current.applicationContext
    val activityContext = LocalContext.current
    val browserLauncher: (String) -> Unit = remember(activityContext) {
        { url ->
            val tab = CustomTabsIntent.Builder().setShowTitle(true).build()
            tab.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { tab.launchUrl(activityContext, Uri.parse(url)) }.onFailure {
                appContext.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
    }
    val viewOptionsStore = remember { ViewOptionsStore(appContext) }
    var viewOptionsByKey by remember {
        mutableStateOf(
            LibraryTab.entries.associate { tab ->
                tab.name to viewOptionsStore.load(tab.name)
            },
        )
    }
    var showViewOptions by remember { mutableStateOf(false) }
    val einkStore = remember { EinkOptionsStore(appContext) }
    var einkOptions by remember { mutableStateOf(einkStore.load()) }
    val einkUiState = remember(einkOptions) {
        EinkUiState(
            optimizeRefresh = EinkDisplay.supportsRefreshControl && einkOptions.optimizeRefresh,
            reduceAnimations = EinkDisplay.isBoox && einkOptions.reduceAnimations,
        )
    }
    val displayStore = remember { DisplayOptionsStore(appContext) }
    var displayOptions by remember { mutableStateOf(displayStore.load()) }
    val automaticUiScale = remember { UiScale.automatic(appContext) }
    val activity = LocalActivity.current
    val rootView = LocalView.current
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()
    val screen = Screen.valueOf(screenName)
    val libraryTab = LibraryTab.valueOf(libraryTabName)
    val librarySortField = LibrarySortField.entries
        .firstOrNull { it.name == librarySortFieldName } ?: LibrarySortField.Title
    val libraryFilters = remember(libraryFiltersJson) {
        LibraryFilterState.decode(libraryFiltersJson)
    }
    val categoryKind = LibraryCategoryKind.entries
        .firstOrNull { it.name == categoryKindName }
    val selectedBookSummary = state.books.firstOrNull { it.id == selectedBookID }
    val selectedBook = selectedBookSummary?.let { book ->
        state.bookDetails[book.id]
            ?.takeIf { it.version == book.coverVersion }
            ?.let(book::withDetails)
            ?: book
    }
    val canNavigateBack = screen == Screen.Details || screen == Screen.Reader ||
        screen == Screen.Category || screen == Screen.BookReports ||
        (screen == Screen.Settings && state.settings.configured)
    val navigateBack = {
        if (screen == Screen.Reader) {
            if (readerMode == "audio") {
                if (state.audiobook?.isPlaying != true) {
                    viewModel.closeAudiobook()
                    viewModel.forgetLastOpenBook()
                }
            } else {
                val keepsPlaying = state.reader?.isPlaying == true &&
                    state.reader?.hasAudioNarration == true
                if (!keepsPlaying) {
                    viewModel.closeReader()
                    viewModel.forgetLastOpenBook()
                }
            }
        }
        if (screen == Screen.Category && categoryGroup.isNotEmpty()) {
            categoryGroup = ""
        } else {
            screenName = when (screen) {
                Screen.Reader -> Screen.Details.name
                Screen.Details ->
                    if (categoryKindName.isNotEmpty()) Screen.Category.name else Screen.Library.name
                else -> Screen.Library.name
            }
            if (screen == Screen.Category) {
                categoryKindName = ""
            }
        }
    }

    LaunchedEffect(state.settingsLoaded, state.settings.configured) {
        if (state.settingsLoaded && !state.settings.configured) {
            screenName = Screen.Settings.name
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbar.showSnackbar(it)
            viewModel.clearError()
        }
    }
    LaunchedEffect(screen, selectedBook, state.libraryLoaded) {
        if (state.libraryLoaded &&
            (screen == Screen.Details || screen == Screen.Reader) &&
            selectedBook == null
        ) {
            if (screen == Screen.Reader) {
                if (readerMode == "audio") {
                    viewModel.closeAudiobook()
                } else {
                    viewModel.closeReader()
                }
            }
            screenName = Screen.Library.name
        }
    }
    LaunchedEffect(screen, readerMode, selectedBook?.id) {
        if (screen == Screen.Reader && readerMode == "audio") {
            selectedBook?.let(viewModel::openAudiobook)
        } else if (screen == Screen.Reader) {
            selectedBook?.let { viewModel.openReader(it, readerMode) }
        }
        if (screen == Screen.Reader) {
            selectedBook?.let { viewModel.rememberLastOpenBook(it.id, readerMode) }
        }
    }
    // rememberSaveable survives process death but not a cold launch, so the
    // open book is restored from its own persisted route instead.
    LaunchedEffect(state.libraryLoaded) {
        if (!state.libraryLoaded || restoreAttempted) return@LaunchedEffect
        restoreAttempted = true
        if (screen != Screen.Library) return@LaunchedEffect
        val route = viewModel.lastOpenBook() ?: return@LaunchedEffect
        if (state.books.none { it.id == route.bookID }) return@LaunchedEffect
        selectedBookID = route.bookID
        readerMode = route.mode
        screenName = Screen.Reader.name
    }
    LaunchedEffect(screen, selectedBookSummary?.id, selectedBookSummary?.coverVersion) {
        if (screen == Screen.Details) selectedBookSummary?.let(viewModel::loadBookDetails)
    }
    var handledSettingsSaves by rememberSaveable { mutableIntStateOf(state.successfulSettingsSaves) }
    LaunchedEffect(state.successfulSettingsSaves) {
        if (state.successfulSettingsSaves == handledSettingsSaves) return@LaunchedEffect
        handledSettingsSaves = state.successfulSettingsSaves
        if (screen == Screen.Settings) screenName = Screen.Library.name
    }
    LaunchedEffect(
        screen,
        readerMode,
        selectedBookSummary?.id,
        selectedBookSummary?.coverVersion,
        einkOptions.coverScreensaver,
    ) {
        if (screen != Screen.Reader || !einkOptions.coverScreensaver || !EinkDisplay.isBoox) {
            return@LaunchedEffect
        }
        val book = selectedBook ?: return@LaunchedEffect
        val size = BooxScreensaver.displaySize(appContext)
        val audio = readerMode == "audio"
        val cover = viewModel.cover(book, audio, size.width, size.height)
            ?: return@LaunchedEffect
        val key = "${book.id}:${book.coverVersion}:$audio"
        withContext(Dispatchers.IO) { BooxScreensaver.setToCover(appContext, cover, key) }
    }
    // Leaving the reader drops its per-refresh eink control, so clear the
    // ghosting it leaves behind with one quality refresh of the new screen.
    var einkWasReader by remember { mutableStateOf(false) }
    LaunchedEffect(screen) {
        val isReader = screen == Screen.Reader
        if (einkWasReader && !isReader && einkUiState.optimizeRefresh) {
            EinkDisplay.fullQualityRefresh(rootView)
        }
        einkWasReader = isReader
    }
    BackHandler(enabled = canNavigateBack, onBack = navigateBack)

    KeepPlaybackServiceConnected(active = state.session != null)

    CompositionLocalProvider(LocalEink provides einkUiState) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme(),
    ) {
        ModalNavigationDrawer(
            drawerState = drawerState,
            gesturesEnabled = screen == Screen.Library && drawerState.isOpen,
            drawerContent = {
                LibraryDrawer(
                    refreshEnabled = !state.libraryBusy && state.settings.configured,
                    onSelectTab = { tab ->
                        libraryTabName = tab.name
                        screenName = Screen.Library.name
                        drawerScope.launch { drawerState.close() }
                    },
                    onSelectCategory = { kind ->
                        categoryKindName = kind.name
                        categoryGroup = ""
                        screenName = Screen.Category.name
                        drawerScope.launch { drawerState.close() }
                    },
                    onRefresh = {
                        viewModel.refreshLibrary()
                        drawerScope.launch { drawerState.close() }
                    },
                    onOpenBookReports = {
                        screenName = Screen.BookReports.name
                        drawerScope.launch { drawerState.close() }
                    },
                )
            },
        ) {
        Scaffold(
            snackbarHost = { SnackbarHost(snackbar) },
            topBar = {
                if (screen == Screen.Library) {
                    LibraryHeader(
                        selectedTab = libraryTab,
                        searchText = librarySearchText,
                        refreshing = state.refreshingLibrary,
                        selectTab = { libraryTabName = it.name },
                        updateSearch = { librarySearchText = it },
                        openMenu = { drawerScope.launch { drawerState.open() } },
                        openSettings = { screenName = Screen.Settings.name },
                        openViewOptions = { showViewOptions = true },
                    )
                } else if (screen != Screen.Details &&
                    !(screen == Screen.Reader && readerMode != "audio")
                ) {
                    TopAppBar(
                        title = {
                            Text(
                                when (screen) {
                                    Screen.Library -> "Library"
                                    Screen.Category ->
                                        categoryGroup.ifEmpty { categoryKind?.label ?: "" }
                                    Screen.Settings -> "Server settings"
                                    Screen.Details -> ""
                                    Screen.Reader -> if (readerMode == "audio") "Player" else "Reader"
                                    Screen.BookReports -> "Book Reports"
                                },
                                maxLines = 1,
                            )
                        },
                        navigationIcon = {
                            if (canNavigateBack) {
                                IconButton(onClick = navigateBack) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                        contentDescription = "Back",
                                    )
                                }
                            }
                        },
                    )
                }
            },
        ) { padding ->
            Box(modifier = Modifier.fillMaxSize()) {
            when (screen) {
                Screen.Library -> LibraryScreen(
                    state = state,
                    tab = libraryTab,
                    searchText = librarySearchText,
                    sortField = librarySortField,
                    sortAscending = librarySortAscending,
                    filters = libraryFilters,
                    selectSort = { field, ascending ->
                        librarySortFieldName = field.name
                        librarySortAscending = ascending
                    },
                    updateFilters = { updated ->
                        libraryFiltersJson = updated.encode()
                    },
                    modifier = Modifier.padding(padding),
                    configure = { screenName = Screen.Settings.name },
                    select = { book ->
                        selectedBookID = book.id
                        screenName = Screen.Details.name
                    },
                    coverRevision = state.coverRevision,
                    cover = viewModel::cover,
                    cachedCover = viewModel::cachedCover,
                    viewOptions = viewOptionsByKey[libraryTab.name] ?: LibraryViewOptions(),
                    bulkOptions = viewModel::bulkActionOptions,
                    bulkAction = { request ->
                        viewModel.bulkAction(
                            action = request.action,
                            books = request.books,
                            sourceID = request.sourceID,
                            names = request.names,
                            uuids = request.uuids,
                            role = request.role,
                            statusUUID = request.statusUUID,
                            statusName = request.statusName,
                            preventReImport = request.preventReImport,
                        )
                    },
                )
                Screen.Category -> categoryKind?.let { kind ->
                    CategoryBrowserScreen(
                        kind = kind,
                        group = categoryGroup.ifEmpty { null },
                        books = state.books,
                        select = { book ->
                            selectedBookID = book.id
                            screenName = Screen.Details.name
                        },
                        selectGroup = { categoryGroup = it },
                        coverRevision = state.coverRevision,
                        cover = viewModel::cover,
                        cachedCover = viewModel::cachedCover,
                        modifier = Modifier.padding(padding),
                        viewOptions = viewOptionsByKey[LibraryTab.Library.name]
                            ?: LibraryViewOptions(),
                    )
                }
                Screen.Settings -> SettingsScreen(
                    settings = state.settings,
                    settingsLoaded = state.settingsLoaded,
                    saving = state.savingSettings,
                    appSettings = state.appSettings,
                    modifier = Modifier.padding(padding),
                    save = { serverURL, username, password ->
                        viewModel.saveSettings(serverURL, username, password)
                    },
                    startBrowserLogin = { serverURL ->
                        drawerScope.launch {
                            runCatching { viewModel.browserLoginURL(serverURL) }
                                .onSuccess { url -> browserLauncher(url) }
                                .onFailure { viewModel.cancelBrowserLogin() }
                        }
                    },
                    signOutBrowserLogin = viewModel::signOutBrowserLogin,
                    updateAppSettings = { progress, metadata, autoNavigate ->
                        viewModel.updateAppSettings(
                            progressSyncIntervalSeconds = progress,
                            metadataRefreshIntervalSeconds = metadata,
                            autoSyncToNewerServerPosition = autoNavigate,
                        )
                    },
                    updateLibrarySettings = { colorMode, colorIntensity, doubleCoverAlignment ->
                        viewModel.updateAppSettings(
                            colorMode = colorMode,
                            colorIntensity = colorIntensity,
                            doubleCoverAlignment = doubleCoverAlignment,
                        )
                    },
                    updateExperimentalSettings = { enabled ->
                        viewModel.updateAppSettings(experimentalSettings = enabled)
                    },
                    setLiveSyncEnabled = { enabled ->
                        viewModel.updateAppSettings(liveReadingSyncEnabled = enabled)
                    },
                    loadLiveSyncStatus = viewModel::liveSyncStatus,
                    loadDebugLog = viewModel::debugLog,
                    clearDebugLog = viewModel::clearDebugLog,
                    setVerboseLogging = viewModel::setVerboseLogging,
                    einkOptions = if (EinkDisplay.isBoox) einkOptions else null,
                    updateEinkOptions = { updated ->
                        val turningOff =
                            einkOptions.coverScreensaver && !updated.coverScreensaver
                        einkOptions = updated
                        einkStore.save(updated)
                        if (turningOff) {
                            drawerScope.launch(Dispatchers.IO) {
                                BooxScreensaver.clear(appContext)
                            }
                        }
                    },
                    displayOptions = displayOptions,
                    automaticUiScale = automaticUiScale,
                    updateDisplayOptions = { updated ->
                        fun resolved(options: DisplayOptions): Float =
                            if (options.uiScale == AUTO_UI_SCALE) automaticUiScale
                            else options.uiScale
                        val changed = resolved(updated) != resolved(displayOptions)
                        displayOptions = updated
                        displayStore.save(updated)
                        // The density override lives on the activity's base
                        // context, so a new scale needs the activity rebuilt.
                        if (changed) activity?.recreate()
                    },
                )
                Screen.BookReports -> BookReportsScreen(
                    books = state.books,
                    coverRevision = state.coverRevision,
                    cover = viewModel::cover,
                    cachedCover = viewModel::cachedCover,
                    loadReport = viewModel::alignmentReport,
                    saveOverrides = viewModel::saveAlignmentOverrides,
                    modifier = Modifier.padding(padding),
                )
                Screen.Details -> selectedBook?.let { book ->
                    BookDetailsScreen(
                        book = book,
                        library = state.books,
                        pendingDownloads = state.pendingDownloads,
                        coverRevision = state.coverRevision,
                        modifier = Modifier.padding(bottom = padding.calculateBottomPadding()),
                        navigateBack = navigateBack,
                        openSettings = { screenName = Screen.Settings.name },
                        cover = viewModel::cover,
                        cachedCover = viewModel::cachedCover,
                        download = { category -> viewModel.download(book, category) },
                        cancelDownload = { category ->
                            viewModel.cancelDownload(book, category)
                        },
                        deleteDownload = { category ->
                            viewModel.deleteDownload(book, category)
                        },
                        open = { mode ->
                            readerMode = mode
                            screenName = Screen.Reader.name
                        },
                        selectRelated = { related -> selectedBookID = related.id },
                        webURL = state.settings.serverURL
                            .trim()
                            .trimEnd('/')
                            .takeIf {
                                it.isNotEmpty() && book.id.sourceID == state.settings.sourceID
                            }
                            ?.let { "$it/books/${book.id.uuid}" },
                        loadRatingContext = viewModel::ratingContext,
                        saveRating = viewModel::saveRating,
                        removeRating = viewModel::removeRating,
                        openCategory = { kind, group ->
                            categoryKindName = kind.name
                            categoryGroup = group
                            screenName = Screen.Category.name
                        },
                        loadIdentifierContext = viewModel::identifierContext,
                        saveIdentifiers = viewModel::saveIdentifiers,
                        createIdentifierType = viewModel::createIdentifierType,
                        loadQuickEditContext = viewModel::quickEditContext,
                        updateMetadata = viewModel::updateBookMetadata,
                        loadAlignmentReport = viewModel::alignmentReport,
                        saveAlignmentOverrides = viewModel::saveAlignmentOverrides,
                    )
                }
                Screen.Reader -> selectedBook?.let { book ->
                    if (readerMode == "audio") {
                        MediaSessionAudiobookPlayerScreen(
                            book = book,
                            state = state.audiobook?.takeIf { it.bookID == book.id },
                            loading = state.audiobookLoading,
                            modifier = Modifier.padding(padding),
                            togglePlayPause = viewModel::toggleAudiobookPlayback,
                            skipBackward = viewModel::skipAudiobookBackward,
                            skipForward = viewModel::skipAudiobookForward,
                            previousChapter = viewModel::previousAudiobookChapter,
                            nextChapter = viewModel::nextAudiobookChapter,
                            seekChapter = viewModel::seekAudiobookChapter,
                            selectChapter = viewModel::selectAudiobookChapter,
                            setPlaybackRate = viewModel::setAudiobookPlaybackRate,
                            setVolume = viewModel::setAudiobookVolume,
                            startSleepTimer = viewModel::startAudiobookSleepTimer,
                            startEndOfChapterSleepTimer =
                                viewModel::startAudiobookEndOfChapterSleepTimer,
                            cancelSleepTimer = viewModel::cancelAudiobookSleepTimer,
                            acceptServerPosition = viewModel::acceptAudiobookServerPosition,
                            declineServerPosition = viewModel::declineAudiobookServerPosition,
                        )
                    } else {
                        ReaderScreen(
                            book = book,
                            mode = readerMode,
                            openResult = state.readerOpen,
                            readerState = state.reader,
                            navigateBack = navigateBack,
                            readerControl = viewModel::readerControl,
                            readerMessageFromJS = viewModel::readerMessageFromJS,
                            registerWebView = viewModel::registerReaderWebView,
                            unregisterWebView = viewModel::unregisterReaderWebView,
                            coverRevision = state.coverRevision,
                            cover = viewModel::cover,
                            cachedCover = viewModel::cachedCover,
                            loadReadingTimeline = viewModel::readingTimeline,
                            clearReadingTimeline = viewModel::clearReadingTimeline,
                            modifier = Modifier,
                        )
                    }
                }
            }
            val session = state.session
            if (screen != Screen.Reader && session != null) {
                GlobalMiniPlayerBar(
                    book = state.books.firstOrNull { it.id == session.bookID },
                    title = session.title,
                    subtitle = session.author,
                    isPlaying = session.isPlaying,
                    onTogglePlay = viewModel::toggleSession,
                    onOpen = {
                        selectedBookID = session.bookID
                        readerMode = if (session.kind == SessionKind.Audiobook) {
                            "audio"
                        } else {
                            state.readerModeName ?: "synced"
                        }
                        screenName = Screen.Reader.name
                    },
                    onClose = viewModel::closeSession,
                    coverRevision = state.coverRevision,
                    cover = viewModel::cover,
                    cachedCover = viewModel::cachedCover,
                    modifier = Modifier.align(Alignment.BottomCenter),
                )
            }
            if (showViewOptions) {
                val viewKey = libraryTab.name
                ViewOptionsSheet(
                    options = viewOptionsByKey[viewKey] ?: LibraryViewOptions(),
                    showsShowOnItem = true,
                    onChange = { updated ->
                        viewOptionsByKey = viewOptionsByKey + (viewKey to updated)
                        viewOptionsStore.save(viewKey, updated)
                    },
                    onDismiss = { showViewOptions = false },
                )
            }
            }
        }
        }
    }
    }
}

@Composable
private fun LibraryDrawer(
    refreshEnabled: Boolean,
    onSelectTab: (LibraryTab) -> Unit,
    onSelectCategory: (LibraryCategoryKind) -> Unit,
    onRefresh: () -> Unit,
    onOpenBookReports: () -> Unit,
) {
    ModalDrawerSheet {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(vertical = 12.dp),
        ) {
            Text(
                "Browse",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 28.dp, vertical = 12.dp),
            )
            NavigationDrawerItem(
                label = { Text("Books") },
                icon = { Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null) },
                selected = false,
                onClick = { onSelectTab(LibraryTab.Library) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            NavigationDrawerItem(
                label = { Text("Downloaded") },
                icon = { Icon(Icons.Filled.Download, contentDescription = null) },
                selected = false,
                onClick = { onSelectTab(LibraryTab.Downloaded) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            LibraryCategoryKind.entries.forEach { kind ->
                NavigationDrawerItem(
                    label = { Text(kind.label) },
                    icon = { Icon(kind.icon, contentDescription = null) },
                    selected = false,
                    onClick = { onSelectCategory(kind) },
                    modifier = Modifier.padding(horizontal = 12.dp),
                )
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
            NavigationDrawerItem(
                label = { Text("Refresh Library") },
                icon = { Icon(Icons.Filled.Refresh, contentDescription = null) },
                selected = false,
                onClick = { if (refreshEnabled) onRefresh() },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            NavigationDrawerItem(
                label = { Text("Book Reports") },
                icon = { Icon(Icons.Filled.Verified, contentDescription = null) },
                selected = false,
                onClick = onOpenBookReports,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
            Spacer(modifier = Modifier.height(12.dp))
        }
    }
}

private fun Book.withDetails(details: BookDetails) = copy(
    description = details.description,
    publicationDateDisplay = details.publicationDateDisplay,
    createdAtDisplay = details.createdAtDisplay,
    updatedAtDisplay = details.updatedAtDisplay,
)
