package dev.smoores.storyteller.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.filled.WifiTethering
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.BookDetails
import dev.smoores.storyteller.model.BookID
import dev.smoores.storyteller.model.SessionKind
import kotlinx.coroutines.launch

private enum class Screen {
    Library,
    Category,
    Settings,
    Details,
    Reader,
    LiveReadingSync,
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
    var settingsSavePending by remember { mutableStateOf(false) }
    var restoreAttempted by rememberSaveable { mutableStateOf(false) }
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
        screen == Screen.Category || screen == Screen.LiveReadingSync ||
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
    LaunchedEffect(state.successfulSettingsSaves) {
        if (settingsSavePending) {
            settingsSavePending = false
            screenName = Screen.Library.name
        }
    }
    BackHandler(enabled = canNavigateBack, onBack = navigateBack)

    KeepPlaybackServiceConnected(active = state.session != null)

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
                    onOpenLiveReadingSync = {
                        screenName = Screen.LiveReadingSync.name
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
                                    Screen.LiveReadingSync -> "Live Reading Sync"
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
                    )
                }
                Screen.Settings -> SettingsScreen(
                    settings = state.settings,
                    settingsLoaded = state.settingsLoaded,
                    saving = state.savingSettings,
                    appSettings = state.appSettings,
                    modifier = Modifier.padding(padding),
                    save = { serverURL, username, password ->
                        settingsSavePending = true
                        viewModel.saveSettings(serverURL, username, password)
                    },
                    updateAppSettings = { progress, metadata, autoNavigate ->
                        viewModel.updateAppSettings(
                            progressSyncIntervalSeconds = progress,
                            metadataRefreshIntervalSeconds = metadata,
                            autoSyncToNewerServerPosition = autoNavigate,
                        )
                    },
                )
                Screen.LiveReadingSync -> LiveReadingSyncScreen(
                    appSettings = state.appSettings,
                    modifier = Modifier.padding(padding),
                    setEnabled = { enabled ->
                        viewModel.updateAppSettings(liveReadingSyncEnabled = enabled)
                    },
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
    onOpenLiveReadingSync: () -> Unit,
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
                label = { Text("Live Reading Sync") },
                icon = { Icon(Icons.Filled.WifiTethering, contentDescription = null) },
                selected = false,
                onClick = onOpenLiveReadingSync,
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
