package dev.smoores.storyteller.ui

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.browser.customtabs.CustomTabsSession
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.smoores.storyteller.model.Book
import dev.smoores.storyteller.model.ReaderDisplaySettings
import dev.smoores.storyteller.model.ReaderOpenResult
import dev.smoores.storyteller.model.ReaderOverlayOptions
import dev.smoores.storyteller.model.ReaderSearchState
import dev.smoores.storyteller.model.ReaderState
import java.io.File
import kotlin.math.roundToInt
import org.json.JSONObject

private const val READER_ORIGIN = "https://appassets.androidplatform.net"
private const val READER_PAGE_URL = "$READER_ORIGIN/reader/foliate_wrap.html"

@Composable
internal fun ReaderScreen(
    book: Book,
    mode: String,
    openResult: ReaderOpenResult?,
    readerState: ReaderState?,
    navigateBack: () -> Unit,
    readerControl: (String, Double, String) -> Unit,
    readerMessageFromJS: (String, String) -> Unit,
    registerWebView: (Any, WebView) -> Unit,
    unregisterWebView: (Any) -> Unit,
    coverRevision: Int,
    cover: suspend (Book, Boolean, Int, Int) -> android.graphics.Bitmap?,
    cachedCover: (Book, Boolean) -> android.graphics.Bitmap?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val view = LocalView.current
    val isDark = isSystemInDarkTheme()

    val webView = remember(book.id, mode) {
        createReaderWebView(context, readerMessageFromJS)
    }

    var displaySettings by remember(book.id, mode) { mutableStateOf(ReaderDisplaySettings()) }
    var settingsInitialized by remember(book.id, mode) { mutableStateOf(false) }
    var chromeVisible by remember(book.id, mode) { mutableStateOf(true) }
    var lastToggleCount by remember(book.id, mode) { mutableIntStateOf(0) }
    var showToc by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showManageThemes by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var showBookmarks by remember { mutableStateOf(false) }
    var showDisplayOptions by remember { mutableStateOf(false) }

    DisposableEffect(webView) {
        registerWebView(webView, webView)
        onDispose {
            unregisterWebView(webView)
            webView.destroy()
        }
    }

    LaunchedEffect(webView, openResult, isDark) {
        if (openResult != null) {
            readerControl("setDarkMode", if (isDark) 1.0 else 0.0, "")
        }
    }

    LaunchedEffect(openResult) {
        if (openResult != null) {
            val available = hasTranslateHandler(context)
            readerControl("setTranslateAvailable", if (available) 1.0 else 0.0, "")
            WebSheetSession.warmUp(context)
        }
    }

    // The Swift side loads persisted settings on open; adopt them as the
    // sheet's starting values, then treat local edits as authoritative.
    LaunchedEffect(readerState?.settings) {
        val persisted = readerState?.settings ?: return@LaunchedEffect
        if (!settingsInitialized) {
            displaySettings = persisted
            settingsInitialized = true
        }
    }

    LaunchedEffect(webView, openResult?.readerPath) {
        val open = openResult ?: return@LaunchedEffect
        val bookUrl = readerContentUrl(context.filesDir, open.readerPath) ?: return@LaunchedEffect
        installReaderStartScripts(webView, bookUrl)
        webView.loadUrl(READER_PAGE_URL)
    }

    LaunchedEffect(readerState?.keepScreenOn) {
        view.keepScreenOn = readerState?.keepScreenOn == true
    }

    val toggleCount = readerState?.overlayToggleCount ?: 0
    LaunchedEffect(toggleCount) {
        if (toggleCount > lastToggleCount) {
            chromeVisible = !chromeVisible
        }
        lastToggleCount = toggleCount
    }

    SystemBarsVisibility(visible = chromeVisible)

    val (fallbackBg, fallbackFg) = readerChromeColors(isDark)
    val chromeBg = parseHexColor(readerState?.backgroundColor) ?: fallbackBg
    val chromeFg = parseHexColor(readerState?.foregroundColor) ?: fallbackFg

    // WKWebView shrinks its layout viewport by the safe area, so on iOS the
    // page's top margin starts below the status bar. Android's WebView gets
    // the raw window; without this inset the toolbar lands on the first line
    // of text. Sticky maximum so hiding the bars doesn't re-paginate.
    val density = LocalDensity.current
    val statusBarTop = WindowInsets.statusBars.getTop(density)
    var webViewTopInset by remember(book.id, mode) { mutableIntStateOf(0) }
    LaunchedEffect(statusBarTop) {
        if (statusBarTop > webViewTopInset) webViewTopInset = statusBarTop
    }

    val overlayOptions = readerState?.overlay ?: ReaderOverlayOptions()
    val hasAudioNarration = readerState?.hasAudioNarration == true
    // An always-visible mini player owns the bottom, so the stats move up.
    val statsAtTop = hasAudioNarration && overlayOptions.alwaysShowMiniPlayer
    val miniPlayerVisible = hasAudioNarration &&
        (chromeVisible || overlayOptions.alwaysShowMiniPlayer)
    val overlayItemsEnabled = overlayOptions.showProgress || overlayOptions.showPageNumber ||
        (
            hasAudioNarration && (
                overlayOptions.showTimeRemainingInBook ||
                    overlayOptions.showTimeRemainingInChapter ||
                    overlayOptions.showSkipBackward ||
                    overlayOptions.showPlayPause ||
                    overlayOptions.showSkipForward
                )
            )
    val overlayControlsEnabled = hasAudioNarration && (
        overlayOptions.showSkipBackward ||
            overlayOptions.showPlayPause ||
            overlayOptions.showSkipForward
        )
    val reservedBottomInset = when {
        statsAtTop -> readerAudioCardCompactHeight(
            showStats = overlayOptions.showMiniPlayerStats,
            navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding(),
        )
        overlayItemsEnabled -> readerOverlayReservedInset(
            withPlaybackControls = overlayControlsEnabled,
        )
        else -> 0.dp
    }

    Box(modifier = modifier.fillMaxSize().background(chromeBg)) {
        AndroidView(
            factory = { webView },
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    top = with(density) { webViewTopInset.toDp() },
                    bottom = reservedBottomInset,
                ),
        )
        if (openResult == null) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }

        if (overlayItemsEnabled) {
            ReaderBottomOverlay(
                statsVisible = !chromeVisible,
                hasAudioNarration = hasAudioNarration,
                isPlaying = readerState?.isPlaying == true,
                options = overlayOptions,
                positionAtTop = statsAtTop,
                miniPlayerVisible = miniPlayerVisible,
                bookFraction = readerState?.bookFraction,
                currentPage = readerState?.chapterCurrentPage,
                totalPages = readerState?.chapterTotalPages,
                bookTimeRemaining = readerState?.bookTimeRemaining,
                chapterTimeRemaining = readerState?.chapterTimeRemaining,
                backgroundColor = chromeBg,
                readerControl = readerControl,
                modifier = Modifier.align(
                    if (statsAtTop) Alignment.TopCenter else Alignment.BottomCenter
                ),
            )
        }

        ReaderProgressHairline(
            fraction = readerState?.chapterFraction ?: 0.0,
            isDark = isDark,
            modifier = Modifier.align(Alignment.BottomCenter),
        )

        AnimatedVisibility(
            visible = chromeVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter),
        ) {
            ReaderTopBar(
                backgroundColor = chromeBg,
                contentColor = chromeFg,
                onBack = navigateBack,
                onShowSearch = { showSearch = true },
                onShowBookmarks = { showBookmarks = true },
                onShowToc = { showToc = true },
                onShowSettings = { showSettings = true },
                onShowDisplayOptions = { showDisplayOptions = true },
            )
        }

        val tocIndex = selectedTocIndex(
            readerState?.toc.orEmpty(),
            readerState?.selectedChapterId,
        )
        ReaderAudioCard(
            visible = hasAudioNarration &&
                (chromeVisible || overlayOptions.alwaysShowMiniPlayer),
            book = book,
            readerState = readerState,
            chapterLabel = tocIndex?.let { readerState?.toc?.getOrNull(it)?.label },
            showStats = overlayOptions.showMiniPlayerStats,
            backgroundColor = chromeBg,
            contentColor = chromeFg,
            readerControl = readerControl,
            onShowChapters = { showToc = true },
            coverRevision = coverRevision,
            cover = cover,
            cachedCover = cachedCover,
            modifier = Modifier.fillMaxSize(),
        )
    }

    readerState?.pendingServerPosition?.let { position ->
        AlertDialog(
            onDismissRequest = { readerControl("declineServerPosition", 0.0, "") },
            title = { Text("Server Has Newer Position") },
            text = {
                val location = listOfNotNull(
                    position.title,
                    position.totalProgression?.let { "${(it * 100).roundToInt()}%" },
                ).joinToString(", ")
                Text(
                    "Another device has synced a more recent reading position" +
                        if (location.isBlank()) "." else " ($location).",
                )
            },
            confirmButton = {
                TextButton(onClick = { readerControl("acceptServerPosition", 0.0, "") }) {
                    Text("Go to New Position")
                }
            },
            dismissButton = {
                TextButton(onClick = { readerControl("declineServerPosition", 0.0, "") }) {
                    Text("Stay Here")
                }
            },
        )
    }

    if (showBookmarks) {
        ReaderBookmarksSheet(
            highlights = readerState?.highlights.orEmpty(),
            palette = readerState?.highlightPalette.orEmpty(),
            onSelect = { highlight ->
                readerControl("goToHighlight", 0.0, highlight.id)
                showBookmarks = false
            },
            onDelete = { highlight ->
                readerControl("deleteHighlight", 0.0, highlight.id)
            },
            onDismiss = { showBookmarks = false },
        )
    }

    val highlightPalette = readerState?.highlightPalette.orEmpty()
    readerState?.pendingSelectionText?.let { selectionText ->
        HighlightEditorDialog(
            title = "Add Highlight",
            selectedText = selectionText,
            palette = highlightPalette,
            initialColorId = null,
            initialNote = "",
            isEditing = false,
            onSave = { colorId, note ->
                val payload = JSONObject().apply {
                    colorId?.let { put("colorId", it) }
                    put("note", note)
                }.toString()
                readerControl("saveHighlight", 0.0, payload)
            },
            onDelete = null,
            onDismiss = { readerControl("cancelSelection", 0.0, "") },
        )
    }

    readerState?.pendingEdit?.let { edit ->
        HighlightEditorDialog(
            title = "Edit Highlight",
            selectedText = edit.text,
            palette = highlightPalette,
            initialColorId = edit.colorId,
            initialNote = edit.note.orEmpty(),
            isEditing = true,
            onSave = { colorId, note ->
                val payload = JSONObject().apply {
                    put("id", edit.id)
                    colorId?.let { put("colorId", it) }
                    put("note", note)
                }.toString()
                readerControl("saveHighlight", 0.0, payload)
            },
            onDelete = {
                readerControl("deleteHighlight", 0.0, edit.id)
                readerControl("cancelSelection", 0.0, "")
            },
            onDismiss = { readerControl("cancelSelection", 0.0, "") },
        )
    }

    if (showSearch) {
        ReaderSearchSheet(
            search = readerState?.search ?: ReaderSearchState(),
            onSearch = { query, matchCase, matchWholeWords ->
                val request = JSONObject().apply {
                    put("query", query)
                    put("matchCase", matchCase)
                    put("matchWholeWords", matchWholeWords)
                }.toString()
                readerControl("startSearch", 0.0, request)
            },
            onClear = { readerControl("clearSearch", 0.0, "") },
            onSelect = { cfi ->
                readerControl("goToSearchResult", 0.0, cfi)
                showSearch = false
            },
            onDismiss = { showSearch = false },
        )
    }

    if (showToc) {
        ReaderTocSheet(
            toc = readerState?.toc.orEmpty(),
            selectedIndex = selectedTocIndex(
                readerState?.toc.orEmpty(),
                readerState?.selectedChapterId,
            ),
            onSelect = { index ->
                readerControl("selectTocEntry", index.toDouble(), "")
                showToc = false
            },
            onDismiss = { showToc = false },
        )
    }

    if (showSettings) {
        ReaderSettingsSheet(
            settings = displaySettings,
            themes = readerState?.themes.orEmpty(),
            selectedLightThemeId = readerState?.selectedLightThemeId,
            selectedDarkThemeId = readerState?.selectedDarkThemeId,
            onChange = { updated, commit ->
                displaySettings = updated
                if (commit) {
                    readerControl("updateReaderSettings", 0.0, updated.toUpdateJson())
                }
            },
            onReset = {
                readerControl("resetReaderSettings", 0.0, "")
                settingsInitialized = false
            },
            onSelectLightTheme = { readerControl("selectLightTheme", 0.0, it) },
            onSelectDarkTheme = { readerControl("selectDarkTheme", 0.0, it) },
            onShowManageThemes = { showManageThemes = true },
            onDismiss = { showSettings = false },
        )
    }

    if (showDisplayOptions) {
        ReaderDisplayOptionsSheet(
            options = readerState?.overlay ?: ReaderOverlayOptions(),
            lockViewToAudio = displaySettings.lockViewToAudio,
            hasAudioNarration = readerState?.hasAudioNarration == true,
            onChangeOptions = {
                readerControl("updateOverlayOptions", 0.0, it.toUpdateJson())
            },
            onChangeLockViewToAudio = { locked ->
                displaySettings = displaySettings.copy(lockViewToAudio = locked)
                readerControl("updateReaderSettings", 0.0, displaySettings.toUpdateJson())
            },
            onDismiss = { showDisplayOptions = false },
        )
    }

    if (showManageThemes) {
        ManageThemesSheet(
            themes = readerState?.themes.orEmpty(),
            selectedLightThemeId = readerState?.selectedLightThemeId,
            selectedDarkThemeId = readerState?.selectedDarkThemeId,
            onSelectLightTheme = { readerControl("selectLightTheme", 0.0, it) },
            onSelectDarkTheme = { readerControl("selectDarkTheme", 0.0, it) },
            onSaveTheme = { readerControl("saveTheme", 0.0, it) },
            onDeleteTheme = { readerControl("deleteTheme", 0.0, it) },
            onResetTheme = { readerControl("resetTheme", 0.0, it) },
            onDismiss = { showManageThemes = false },
        )
    }
}

@Composable
private fun SystemBarsVisibility(visible: Boolean) {
    val view = LocalView.current
    LaunchedEffect(visible) {
        val window = view.context.findActivity()?.window ?: return@LaunchedEffect
        val controller = WindowCompat.getInsetsController(window, view)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (visible) {
            controller.show(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        }
    }
    DisposableEffect(view) {
        onDispose {
            val window = view.context.findActivity()?.window ?: return@onDispose
            WindowCompat.getInsetsController(window, view)
                .show(WindowInsetsCompat.Type.systemBars())
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private val selectionActionMessages =
    setOf("SelectionDefine", "SelectionShare", "SelectionCopy", "SelectionTranslate")

private fun handleSelectionActionMessage(context: Context, name: String, body: String): Boolean {
    if (name !in selectionActionMessages) return false
    val text = runCatching { JSONObject(body).optString("text") }.getOrDefault("")
    if (text.isBlank()) return true
    Handler(Looper.getMainLooper()).post {
        try {
            when (name) {
                "SelectionShare" -> shareSelection(context, text)
                "SelectionDefine" -> defineSelection(context, text)
                "SelectionTranslate" -> translateSelection(context, text)
                "SelectionCopy" -> copySelection(context, text)
            }
        } catch (e: ActivityNotFoundException) {
            Log.w("Storyteller", "No activity to handle $name", e)
        }
    }
    return true
}

private fun shareSelection(context: Context, text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(send, null))
}

private fun processTextIntent(text: String) = Intent(Intent.ACTION_PROCESS_TEXT).apply {
    type = "text/plain"
    putExtra(Intent.EXTRA_PROCESS_TEXT, text)
    putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true)
}

private fun defineSelection(context: Context, text: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val define = Intent(Intent.ACTION_DEFINE).putExtra(Intent.EXTRA_TEXT, text)
        val handler = define.resolveActivity(context.packageManager)
        if (handler != null && handler.packageName != "com.google.android.googlequicksearchbox") {
            context.startActivity(define)
            return
        }
    }
    openWebSheet(
        context,
        "https://en.wiktionary.org/w/index.php?go=Go&search=" + Uri.encode(text.trim()),
    )
}

private fun translateSelection(context: Context, text: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val translate = Intent(Intent.ACTION_TRANSLATE).putExtra(Intent.EXTRA_TEXT, text)
        if (translate.resolveActivity(context.packageManager) != null) {
            context.startActivity(translate)
            return
        }
    }
    val process = processTextIntent(text)
    if (process.resolveActivity(context.packageManager) != null) {
        context.startActivity(Intent.createChooser(process, null))
        return
    }
    openWebSheet(context, "https://translate.google.com/?sl=auto&text=" + Uri.encode(text))
}

private object WebSheetSession {
    private var binding = false

    @Volatile var session: CustomTabsSession? = null

    fun warmUp(context: Context) {
        if (binding || session != null) return
        val pkg = CustomTabsClient.getPackageName(context, null) ?: return
        binding = true
        val bound = CustomTabsClient.bindCustomTabsService(
            context.applicationContext,
            pkg,
            object : CustomTabsServiceConnection() {
                override fun onCustomTabsServiceConnected(
                    name: ComponentName,
                    client: CustomTabsClient,
                ) {
                    client.warmup(0)
                    session = client.newSession(null)
                }

                override fun onServiceDisconnected(name: ComponentName) {
                    session = null
                    binding = false
                }
            },
        )
        if (!bound) binding = false
    }
}

private fun openWebSheet(context: Context, url: String) {
    WebSheetSession.warmUp(context)
    val heightPx = (context.resources.displayMetrics.heightPixels * 0.6).toInt()
    val builder = WebSheetSession.session
        ?.let { CustomTabsIntent.Builder(it) }
        ?: CustomTabsIntent.Builder()
    val tab = builder
        .setInitialActivityHeightPx(heightPx, CustomTabsIntent.ACTIVITY_HEIGHT_FIXED)
        .setToolbarCornerRadiusDp(16)
        .setShowTitle(true)
        .build()
    tab.launchUrl(context, Uri.parse(url))
}

private fun copySelection(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Selection", text))
}

private fun hasTranslateHandler(context: Context): Boolean {
    val pm = context.packageManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
        Intent(Intent.ACTION_TRANSLATE).resolveActivity(pm) != null
    ) {
        return true
    }
    return processTextIntent("").resolveActivity(pm) != null
}

@SuppressLint("SetJavaScriptEnabled")
private fun createReaderWebView(
    context: Context,
    readerMessageFromJS: (String, String) -> Unit,
): WebView {
    val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler(
            "/reader/",
            MimeFixingPathHandler(WebViewAssetLoader.AssetsPathHandler(context)) { "reader/$it" },
        )
        .addPathHandler(
            "/appdata/",
            MimeFixingPathHandler(
                WebViewAssetLoader.InternalStoragePathHandler(context, context.filesDir)
            ),
        )
        .build()

    if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
        WebView.setWebContentsDebuggingEnabled(true)
    }
    return WebView(context).apply {
        // Compose's AndroidView leaves child LayoutParams at WRAP_CONTENT, and a
        // wrap-content WebView switches Chromium into grow-to-content layout
        // where percentage and vh heights resolve to 0 (blank reader).
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        setBackgroundColor(Color.TRANSPARENT)
        webViewClient = ReaderWebViewClient(assetLoader)
        addJavascriptInterface(
            object {
                @JavascriptInterface
                fun postMessage(name: String, body: String) {
                    // Swift's debugLog goes to stdout, which Android drops;
                    // mirror the JS console into logcat.
                    if (name == "ConsoleLog") Log.d("StorytellerJS", body)
                    if (handleSelectionActionMessage(context, name, body)) return
                    readerMessageFromJS(name, body)
                }
            },
            "StorytellerNative",
        )
    }
}

private class ReaderWebViewClient(
    private val assetLoader: WebViewAssetLoader,
) : WebViewClientCompat() {
    // Fallback for WebViews without DOCUMENT_START_SCRIPT support.
    var fallbackStartScripts: List<String> = emptyList()

    override fun shouldInterceptRequest(
        view: WebView,
        request: WebResourceRequest,
    ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        fallbackStartScripts.forEach { view.evaluateJavascript(it, null) }
    }
}

// The shared web stack posts through window.webkit.messageHandlers (WKWebView's
// channel); a Proxy forwards every named handler to the StorytellerNative
// JavascriptInterface so the same JS runs unmodified on Android.
private const val MESSAGE_HANDLER_POLYFILL = """
    (function() {
        if (window.webkit) { return; }
        window.webkit = {
            messageHandlers: new Proxy({}, {
                get: function(target, name) {
                    return {
                        postMessage: function(body) {
                            window.StorytellerNative.postMessage(
                                String(name),
                                JSON.stringify(body === undefined ? {} : body)
                            );
                        }
                    };
                }
            })
        };
    })();
"""

private const val CONSOLE_OVERRIDE = """
    (function() {
        function format(args) {
            return args.map(function(arg) {
                if (arg instanceof Error) {
                    return 'Error: ' + arg.message + '\n' + (arg.stack || '');
                }
                if (typeof arg === 'object') {
                    try { return JSON.stringify(arg); }
                    catch (e) { return String(arg); }
                }
                return String(arg);
            }).join(' ');
        }
        console.log = function() {
            window.webkit.messageHandlers.ConsoleLog.postMessage(
                {level: 'log', message: format(Array.from(arguments))});
        };
        console.warn = function() {
            window.webkit.messageHandlers.ConsoleLog.postMessage(
                {level: 'warn', message: format(Array.from(arguments))});
        };
        console.error = function() {
            window.webkit.messageHandlers.ConsoleLog.postMessage(
                {level: 'error', message: format(Array.from(arguments))});
        };
        window.addEventListener('error', function(e) {
            console.error('Global error:', e.error || e.message, 'at', e.filename, e.lineno, e.colno);
        });
        window.addEventListener('unhandledrejection', function(e) {
            console.error('Unhandled promise rejection:', e.reason);
        });
    })();
"""

private fun bookOpenScript(bookUrl: String): String {
    val urlLiteral = JSONObject.quote(bookUrl)
    return """
        (function() {
            window.storytellerBookPath = $urlLiteral;
            window.nativeReady = true;
            window.jsReady = window.jsReady || false;
            window.storytellerOpenedBookPath = window.storytellerOpenedBookPath || null;
            window.storytellerOpeningBookPath = window.storytellerOpeningBookPath || null;

            window.tryOpenStorytellerBook = function(reason) {
                if (!window.nativeReady || !window.jsReady || !window.storytellerBookPath) {
                    return false;
                }

                const loader = window.bookLoader;
                if (!loader) {
                    window.jsReady = false;
                    return false;
                }

                if (window.storytellerOpenedBookPath === window.storytellerBookPath ||
                    window.storytellerOpeningBookPath === window.storytellerBookPath) {
                    return true;
                }

                window.storytellerOpeningBookPath = window.storytellerBookPath;
                console.log('[StorytellerBookOpen] opening book', reason, window.storytellerBookPath);

                const openPromise = loader.openBookFromDirectory(window.storytellerBookPath);

                Promise.resolve(openPromise).then(function() {
                    window.storytellerOpenedBookPath = window.storytellerBookPath;
                    window.storytellerOpeningBookPath = null;
                }).catch(function(error) {
                    window.storytellerOpeningBookPath = null;
                    console.error('[StorytellerBookOpen] failed to open book', error);
                });

                return true;
            };

            window.tryOpenStorytellerBook('nativeReady');
        })();
    """
}

private fun installReaderStartScripts(webView: WebView, bookUrl: String) {
    val scripts = listOf(MESSAGE_HANDLER_POLYFILL, CONSOLE_OVERRIDE, bookOpenScript(bookUrl))
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
        scripts.forEach { script ->
            WebViewCompat.addDocumentStartJavaScript(webView, script, setOf(READER_ORIGIN))
        }
    } else {
        (webView.webViewClient as? ReaderWebViewClient)?.fallbackStartScripts = scripts
    }
}

private fun readerContentUrl(filesDir: File, readerPath: String): String? {
    val base = filesDir.canonicalFile
    val target = File(readerPath).canonicalFile
    val relative = target.relativeToOrNull(base) ?: return null
    if (relative.path.isEmpty() || relative.path.startsWith("..")) return null
    val encoded = relative.invariantSeparatorsPath
        .split("/")
        .joinToString("/") { android.net.Uri.encode(it) }
    return "$READER_ORIGIN/appdata/$encoded/"
}

private class MimeFixingPathHandler(
    private val delegate: WebViewAssetLoader.PathHandler,
    private val transform: (String) -> String = { it },
) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        val response = delegate.handle(transform(path)) ?: return null
        val mime = readerMimeType(path) ?: return response
        return WebResourceResponse(mime, null, response.data)
    }
}

// Chromium guesses MIME from the extension and misses the EPUB-specific ones;
// module scripts and XHTML refuse to load with a wrong type.
private fun readerMimeType(path: String): String? =
    when (path.substringAfterLast('.', "").lowercase()) {
        "xhtml", "xht" -> "application/xhtml+xml"
        "opf", "ncx" -> "application/xml"
        "smil" -> "application/smil+xml"
        "json" -> "application/json"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "svg" -> "image/svg+xml"
        else -> null
    }
