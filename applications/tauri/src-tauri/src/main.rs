#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, mpsc},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, Result, anyhow};
use tauri::{Emitter, Manager, RunEvent, path::BaseDirectory};

enum BootChoice {
    Fresh,
    Restore(PathBuf),
}

struct ServerState {
    child: Mutex<Option<Child>>,
    shutting_down: Mutex<bool>,
    server_url: Mutex<Option<String>>,
    log_path: Mutex<Option<PathBuf>>,
    boot_choice: Mutex<Option<mpsc::Sender<BootChoice>>>,
    splash_url: Mutex<Option<tauri::Url>>,
}

const HEALTH_TIMEOUT: Duration = Duration::from_secs(120);
const UA_TOKEN: &str = "StorytellerTauri";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerState {
            child: Mutex::new(None),
            shutting_down: Mutex::new(false),
            server_url: Mutex::new(None),
            log_path: Mutex::new(None),
            boot_choice: Mutex::new(None),
            splash_url: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            set_titlebar_color,
            report_user_agent,
            read_server_log,
            show_server_log,
            choose_database,
            choose_assets_dir,
            get_tauri_config,
            set_update_channel,
            check_for_updates_now
        ])
        .setup(|app| {
            setup_menu(app.handle())?;

            // match the splash background until the web app takes over
            if let Some(window) = app.get_webview_window("main") {
                set_window_background(&window, 0.078, 0.063, 0.051);
                prefer_zoom_over_fullscreen(&window);

                // remember the splash so a database restore can show boot
                // progress again
                if let Ok(url) = window.url() {
                    *app.state::<ServerState>().splash_url.lock().unwrap() = Some(url);
                }
            }

            // in `tauri dev` the window points straight at the next dev
            // server (build.devUrl), so nothing to boot; bundled builds —
            // including `tauri build --debug` — run the full boot flow.
            // set STORYTELLER_TAURI_BOOT=1 to force booting in dev
            let dev_skip = tauri::is_dev() && std::env::var("STORYTELLER_TAURI_BOOT").is_err();
            if !dev_skip {
                let handle = app.handle().clone();
                std::thread::spawn(move || boot(handle));
            }

            // let win_builder =
            //     tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
            //         .hidden_title(true)
            //         .title_bar_style(tauri::TitleBarStyle::Overlay)
            //         .decorations(true);
            // .inner_size(800.0, 600.0);

            // // set transparent title bar only when building for macOS
            // #[cfg(target_os = "macos")]
            // let win_builder = win_builder.title_bar_style(tauri::TitleBarStyle::Transparent);

            // let window =
            // win_builder.build().unwrap();

            // // set background color only when building for macOS
            // #[cfg(target_os = "macos")]
            // {
            //     use objc2_app_kit::{NSColor, NSWindow};

            //     let ns_window_ptr = window.ns_window().unwrap() as *mut NSWindow;
            //     let ns_window = unsafe { &*ns_window_ptr };
            //     let bg_color = NSColor::colorWithRed_green_blue_alpha(
            //         50.0 / 255.0,
            //         158.0 / 255.0,
            //         163.5 / 255.0,
            //         1.0,
            //     );
            //     ns_window.setBackgroundColor(Some(&bg_color));
            // }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_server(app.state::<ServerState>().inner());
            }
        });
}

/// the webview has no browser chrome, so back/forward/reload live in the
/// native menu (with the usual browser accelerators); appended to the default
/// menu so Edit/copy-paste etc. stay intact
fn setup_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let menu = Menu::default(app)?;
    let history = Submenu::with_items(
        app,
        "History",
        true,
        &[
            &MenuItem::with_id(app, "nav-back", "Back", true, Some("CmdOrCtrl+BracketLeft"))?,
            &MenuItem::with_id(
                app,
                "nav-forward",
                "Forward",
                true,
                Some("CmdOrCtrl+BracketRight"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "nav-reload", "Reload Page", true, Some("CmdOrCtrl+R"))?,
            &MenuItem::with_id(
                app,
                "nav-home",
                "Go to Library",
                true,
                Some("CmdOrCtrl+Shift+H"),
            )?,
        ],
    )?;
    menu.append(&history)?;
    let server = Submenu::with_items(
        app,
        "Server",
        true,
        &[
            &MenuItem::with_id(
                app,
                "show-logs",
                "Show Server Logs",
                true,
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "restore-db", "Restore Database…", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                "change-assets-dir",
                "Change Media Folder…",
                true,
                None::<&str>,
            )?,
        ],
    )?;
    menu.append(&server)?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        match event.id().as_ref() {
            "nav-back" => {
                let _ = window.eval("history.back()");
            }
            "nav-forward" => {
                let _ = window.eval("history.forward()");
            }
            "nav-reload" => {
                let _ = window.eval("location.reload()");
            }
            "nav-home" => {
                let url = app
                    .state::<ServerState>()
                    .server_url
                    .lock()
                    .unwrap()
                    .clone();
                if let Some(url) = url {
                    let _ = navigate(app, &url);
                }
            }
            "show-logs" => {
                open_server_log(app);
            }
            "restore-db" => {
                // blocking native dialogs must stay off the main thread
                let handle = app.clone();
                std::thread::spawn(move || restore_database_flow(handle));
            }
            "change-assets-dir" => {
                let handle = app.clone();
                std::thread::spawn(move || change_assets_dir_flow(handle));
            }
            _ => {}
        }
    });
    Ok(())
}

/// the web app calls this (via @tauri-apps/api invoke) with the resolved
/// sidebar color so the transparent native title bar always matches the ui,
/// including theme switches
#[tauri::command]
fn set_titlebar_color(window: tauri::WebviewWindow, red: f64, green: f64, blue: f64) {
    set_window_background(&window, red, green, blue);
}

/// the splash reports the webview's default user agent on load; we append an
/// identification token and keep the browser part intact — the web reader
/// sniffs AppleWebKit, so replacing the whole string would break it
#[tauri::command]
fn report_user_agent(app: tauri::AppHandle, user_agent: String) {
    if user_agent.contains(UA_TOKEN) {
        return;
    }
    let version = app.package_info().version.to_string();
    let tagged = format!("{user_agent} {UA_TOKEN}/{version}");
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(target_os = "macos")]
    {
        let _ = window.with_webview(move |webview| unsafe {
            use objc2_foundation::NSString;
            use objc2_web_kit::WKWebView;
            let wk: *mut WKWebView = webview.inner().cast();
            (*wk).setCustomUserAgent(Some(&NSString::from_str(&tagged)));
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        // windows/linux keep the default ua for now; the web app can still
        // detect the shell via window.__TAURI__
        let _ = (window, tagged);
    }
}

/// last `lines` lines of the server log, for the splash's live log view
#[tauri::command]
fn read_server_log(app: tauri::AppHandle, lines: Option<usize>) -> String {
    let log_path = app.state::<ServerState>().log_path.lock().unwrap().clone();
    let Some(log_path) = log_path else {
        return String::new();
    };
    tail_log(&log_path, lines.unwrap_or(200))
}

#[tauri::command]
fn show_server_log(app: tauri::AppHandle) {
    open_server_log(&app);
}

/// splash "start fresh" / "use an existing database" buttons on first boot
#[tauri::command]
fn choose_database(app: tauri::AppHandle, mode: String) {
    let sender = app
        .state::<ServerState>()
        .boot_choice
        .lock()
        .unwrap()
        .clone();
    let Some(sender) = sender else {
        return;
    };

    if mode == "fresh" {
        let _ = sender.send(BootChoice::Fresh);
        return;
    }

    use tauri_plugin_dialog::DialogExt;
    let handle = app.clone();
    app.dialog()
        .file()
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .pick_file(move |picked| {
            let Some(path) = picked.and_then(|file| file.into_path().ok()) else {
                return;
            };
            if !is_sqlite_file(&path) {
                emit_boot(
                    &handle,
                    "choice",
                    "That file doesn't look like a SQLite database — pick a Storyteller database (.db) file.",
                    None,
                    None,
                );
                return;
            }
            let _ = sender.send(BootChoice::Restore(path));
        });
}

fn tauri_config_path(app_data: &Path) -> PathBuf {
    app_data.join("tauri.json")
}

fn read_tauri_config(app_data: &Path) -> serde_json::Value {
    fs::read_to_string(tauri_config_path(app_data))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_tauri_config(app_data: &Path, config: &serde_json::Value) -> Result<()> {
    fs::create_dir_all(app_data)?;
    fs::write(
        tauri_config_path(app_data),
        serde_json::to_string_pretty(config)?,
    )?;
    Ok(())
}

fn configured_assets_dir(app_data: &Path) -> Option<PathBuf> {
    read_tauri_config(app_data)
        .get("assetsDir")
        .and_then(|value| value.as_str())
        .map(PathBuf::from)
}

/// splash "choose folder" button for where library-managed media files live;
/// stored in tauri.json so it survives restarts, cleared with reset
#[tauri::command]
async fn choose_assets_dir(app: tauri::AppHandle, reset: bool) -> Result<Option<String>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("no app data directory: {err}"))?;

    if reset {
        let mut config = read_tauri_config(&app_data);
        if let Some(object) = config.as_object_mut() {
            object.remove("assetsDir");
        }
        write_tauri_config(&app_data, &config).map_err(|err| format!("{err:#}"))?;
        return Ok(None);
    }

    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_folder();
    let Some(path) = picked.and_then(|folder| folder.into_path().ok()) else {
        return Ok(configured_assets_dir(&app_data).map(|path| path.display().to_string()));
    };

    fs::create_dir_all(&path).map_err(|err| format!("that folder isn't writable: {err}"))?;

    let mut config = read_tauri_config(&app_data);
    if let Some(object) = config.as_object_mut() {
        object.insert(
            "assetsDir".to_string(),
            serde_json::json!(path.display().to_string()),
        );
    }
    write_tauri_config(&app_data, &config).map_err(|err| format!("{err:#}"))?;

    Ok(Some(path.display().to_string()))
}

/// menu flow for moving the library's media folder after first boot: pick a
/// folder, store it in tauri.json, restart the server against it. files are
/// not moved — the dialog tells the user to move them and rewrite paths
fn change_assets_dir_flow(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

    let current = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|app_data| configured_assets_dir(&app_data))
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "inside the app data folder (default)".to_string());
    let confirmed = app
        .dialog()
        .message(format!(
            "Choose a new folder for library-managed media files (synced books, audio, covers). \
             The server restarts to apply it.\n\nCurrent location: {current}\n\nExisting files \
             are not moved automatically — move the current folder's contents into the new one \
             yourself, then use Settings → Data & backups → Rewrite paths if books stop resolving.",
        ))
        .title("Change Media Folder")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Choose Folder…".to_string(),
            "Cancel".to_string(),
        ))
        .blocking_show();
    if !confirmed {
        return;
    }

    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return;
    };
    let Ok(path) = picked.into_path() else {
        return;
    };

    if let Err(err) = change_assets_dir(&app, &path) {
        emit_status(&app, "error", &format!("{err:#}"));
    }
}

fn change_assets_dir(app: &tauri::AppHandle, path: &Path) -> Result<()> {
    let app_data = app.path().app_data_dir().context("no app data directory")?;
    fs::create_dir_all(path).with_context(|| format!("{} isn't writable", path.display()))?;

    let mut config = read_tauri_config(&app_data);
    if let Some(object) = config.as_object_mut() {
        object.insert(
            "assetsDir".to_string(),
            serde_json::json!(path.display().to_string()),
        );
    }
    write_tauri_config(&app_data, &config)?;

    // back to the splash so the user sees restart progress
    let splash = app
        .state::<ServerState>()
        .splash_url
        .lock()
        .unwrap()
        .clone();
    if let (Some(window), Some(url)) = (app.get_webview_window("main"), splash) {
        let _ = window.navigate(url);
    }

    emit_status(app, "starting", "Stopping the server…");
    let state = app.state::<ServerState>();
    stop_server(state.inner());
    *state.shutting_down.lock().unwrap() = false;
    *state.server_url.lock().unwrap() = None;

    let handle = app.clone();
    std::thread::spawn(move || boot(handle));
    Ok(())
}

/// lets the splash show the current tauri.json settings (assets folder)
#[tauri::command]
fn get_tauri_config(app: tauri::AppHandle) -> serde_json::Value {
    match app.path().app_data_dir() {
        Ok(app_data) => read_tauri_config(&app_data),
        Err(_) => serde_json::json!({}),
    }
}

/// the native green traffic light enters fullscreen by default; removing
/// fullscreen from the window's collection behavior makes it zoom (maximize)
/// instead. tradeoff: native fullscreen (Ctrl+Cmd+F) is unavailable
fn prefer_zoom_over_fullscreen(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let Ok(ns_window_ptr) = window.ns_window() else {
            return;
        };
        let ns_window_ptr = ns_window_ptr as usize;
        let _ = window.run_on_main_thread(move || {
            use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
            unsafe {
                let ns_window = &*(ns_window_ptr as *const NSWindow);
                ns_window.setCollectionBehavior(NSWindowCollectionBehavior::FullScreenNone);
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}

/// with titleBarStyle Transparent the macOS title bar shows the NSWindow
/// background color; other platforms keep their native chrome for now
fn set_window_background(window: &tauri::WebviewWindow, red: f64, green: f64, blue: f64) {
    #[cfg(target_os = "macos")]
    {
        let Ok(ns_window_ptr) = window.ns_window() else {
            return;
        };
        let ns_window_ptr = ns_window_ptr as usize;
        let _ = window.run_on_main_thread(move || {
            use objc2_app_kit::{NSColor, NSWindow};
            unsafe {
                let ns_window = &*(ns_window_ptr as *const NSWindow);
                let color = NSColor::colorWithSRGBRed_green_blue_alpha(red, green, blue, 1.0);
                ns_window.setBackgroundColor(Some(&color));
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, red, green, blue);
    }
}

fn boot(app: tauri::AppHandle) {
    if let Err(err) = boot_inner(&app) {
        emit_status(&app, "error", &format!("{err:#}"));
    }
}

fn boot_inner(app: &tauri::AppHandle) -> Result<()> {
    // attach to an externally managed server instead of spawning one
    if let Ok(url) = std::env::var("STORYTELLER_TAURI_SERVER_URL") {
        *app.state::<ServerState>().server_url.lock().unwrap() = Some(url.clone());
        return navigate(app, &url);
    }

    let app_data = app.path().app_data_dir().context("no app data directory")?;
    let data_dir = app_data.join("data");
    fs::create_dir_all(&data_dir)?;

    let log_path = app_data.join("server.log");
    *app.state::<ServerState>().log_path.lock().unwrap() = Some(log_path.clone());

    emit_status(app, "extracting", "Preparing application files…");
    let runtime_dir = ensure_runtime(app, &app_data)?;

    let secret_file = ensure_secret(&app_data)?;

    // fresh library: let the user drop in an existing database before the
    // server (and its migrations) ever touch one
    if !data_dir.join("storyteller.db").exists() {
        let (sender, receiver) = mpsc::channel();
        *app.state::<ServerState>().boot_choice.lock().unwrap() = Some(sender);
        emit_status(app, "choice", "Set up your library");
        let choice = receiver
            .recv()
            .context("setup choice channel closed unexpectedly")?;
        *app.state::<ServerState>().boot_choice.lock().unwrap() = None;
        match choice {
            BootChoice::Fresh => {}
            BootChoice::Restore(path) => {
                install_database(&data_dir, &path)?;
            }
        }
    }

    let port = resolve_port(&app_data)?;
    let readium_port = pick_port(8757);

    let assets_dir = configured_assets_dir(&app_data);
    if let Some(dir) = &assets_dir {
        fs::create_dir_all(dir)
            .with_context(|| format!("cannot create the media folder {}", dir.display()))?;
    }

    emit_status(app, "starting", "Starting Storyteller Server…");
    spawn_server(
        app,
        &runtime_dir,
        &data_dir,
        assets_dir.as_deref(),
        &secret_file,
        &log_path,
        port,
        readium_port,
    )?;

    let deadline = Instant::now() + HEALTH_TIMEOUT;
    let mut last_detail = String::new();
    loop {
        if http_ok(port, "/api/health") {
            break;
        }
        if let Some(status) = server_exit_status(app) {
            return Err(anyhow!(
                "the server exited unexpectedly ({status})\n\n{}",
                tail_log(&log_path, 30)
            ));
        }
        if Instant::now() >= deadline {
            stop_server(app.state::<ServerState>().inner());
            return Err(anyhow!(
                "the server did not become healthy within {}s\n\n{}",
                HEALTH_TIMEOUT.as_secs(),
                tail_log(&log_path, 30)
            ));
        }
        // surface what the server is doing (first boot runs migrations that
        // can take a while) instead of a silent spinner
        if let Some(line) = last_log_line(&log_path) {
            if line != last_detail {
                emit_boot(
                    app,
                    "starting",
                    "Starting Storyteller Server…",
                    None,
                    Some(&line),
                );
                last_detail = line;
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    let url = format!("http://127.0.0.1:{port}");
    *app.state::<ServerState>().server_url.lock().unwrap() = Some(url.clone());
    navigate(app, &url)?;

    // quiet update check once the app is usable; release builds only so dev
    // runs never fetch or prompt
    if !cfg!(debug_assertions) {
        let handle = app.clone();
        std::thread::spawn(move || check_for_updates(handle, false));
    }
    Ok(())
}

const UPDATE_FEED_BASE: &str =
    "https://gitlab.com/api/v4/projects/67994333/packages/generic/storyteller-tauri";
const UPDATE_CHANNELS: [&str; 3] = ["stable", "beta", "edge"];

/// which update feed this install follows; stored in tauri.json by the web
/// settings UI, unknown values fall back to stable
fn update_channel(app_data: &Path) -> String {
    let channel = read_tauri_config(app_data)
        .get("updateChannel")
        .and_then(|value| value.as_str())
        .unwrap_or("stable")
        .to_string();
    if UPDATE_CHANNELS.contains(&channel.as_str()) {
        channel
    } else {
        "stable".to_string()
    }
}

fn update_feed_slot(channel: &str) -> &'static str {
    match channel {
        "beta" => "latest-beta",
        "edge" => "latest-edge",
        _ => "latest",
    }
}

#[tauri::command]
fn set_update_channel(app: tauri::AppHandle, channel: String) -> Result<(), String> {
    if !UPDATE_CHANNELS.contains(&channel.as_str()) {
        return Err(format!("unknown update channel \"{channel}\""));
    }
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("no app data directory: {err}"))?;
    let mut config = read_tauri_config(&app_data);
    if let Some(object) = config.as_object_mut() {
        object.insert("updateChannel".to_string(), serde_json::json!(channel));
    }
    write_tauri_config(&app_data, &config).map_err(|err| format!("{err:#}"))?;
    Ok(())
}

/// settings UI "check for updates" button; progress and results stay in
/// native dialogs
#[tauri::command]
fn check_for_updates_now(app: tauri::AppHandle) {
    std::thread::spawn(move || check_for_updates(app, true));
}

/// checks the channel's updater feed; when `interactive` (settings button) it
/// also reports "up to date" and errors, the startup check stays silent
/// unless an update exists. blocking dialogs, so must run off the main thread
fn check_for_updates(app: tauri::AppHandle, interactive: bool) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    let updater = (|| {
        let app_data = app.path().app_data_dir().ok()?;
        let slot = update_feed_slot(&update_channel(&app_data));
        let endpoint = tauri::Url::parse(&format!("{UPDATE_FEED_BASE}/{slot}/latest.json")).ok()?;
        app.updater_builder()
            .endpoints(vec![endpoint])
            .ok()?
            .build()
            .ok()
    })();
    let Some(updater) = updater else {
        if interactive {
            app.dialog()
                .message("Could not check for updates: the updater is unavailable.")
                .title("Update Check Failed")
                .blocking_show();
        }
        return;
    };
    let update = match tauri::async_runtime::block_on(updater.check()) {
        Ok(Some(update)) => update,
        Ok(None) => {
            if interactive {
                app.dialog()
                    .message(format!(
                        "Storyteller Server {} is up to date.",
                        app.package_info().version
                    ))
                    .title("No Updates Available")
                    .blocking_show();
            }
            return;
        }
        Err(err) => {
            if interactive {
                app.dialog()
                    .message(format!("Could not check for updates: {err}"))
                    .title("Update Check Failed")
                    .blocking_show();
            }
            return;
        }
    };

    let install = app
        .dialog()
        .message(format!(
            "Storyteller Server {} is available (you have {}).\n\nThe download happens in the background; the app restarts once it is ready.",
            update.version, update.current_version
        ))
        .title("Update Available")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Restart".to_string(),
            "Later".to_string(),
        ))
        .blocking_show();
    if !install {
        return;
    }

    match tauri::async_runtime::block_on(update.download_and_install(|_, _| {}, || {})) {
        Ok(()) => {
            // the running server would hold the port on relaunch otherwise
            stop_server(app.state::<ServerState>().inner());
            app.restart();
        }
        Err(err) => {
            app.dialog()
                .message(format!("The update could not be installed: {err}"))
                .title("Update Failed")
                .blocking_show();
        }
    }
}

/// port preference order: STORYTELLER_TAURI_PORT env, then "port" in
/// app_data/tauri.json, then 8756 with an ephemeral fallback. a pinned port
/// that is already taken is a hard error rather than a silent fallback.
fn resolve_port(app_data: &Path) -> Result<u16> {
    let config_path = app_data.join("tauri.json");
    let pinned = match std::env::var("STORYTELLER_TAURI_PORT") {
        Ok(value) => Some((
            value
                .parse::<u16>()
                .context("STORYTELLER_TAURI_PORT is not a valid port")?,
            "STORYTELLER_TAURI_PORT".to_string(),
        )),
        Err(_) => match fs::read_to_string(&config_path) {
            Ok(raw) => {
                let config: serde_json::Value = serde_json::from_str(&raw)
                    .with_context(|| format!("invalid json in {}", config_path.display()))?;
                match config.get("port") {
                    Some(value) => {
                        let port = value
                            .as_u64()
                            .and_then(|p| u16::try_from(p).ok())
                            .with_context(|| {
                                format!("invalid \"port\" in {}", config_path.display())
                            })?;
                        Some((port, format!("\"port\" in {}", config_path.display())))
                    }
                    None => None,
                }
            }
            Err(_) => None,
        },
    };

    match pinned {
        Some((port, source)) => {
            if TcpListener::bind(("127.0.0.1", port)).is_err() {
                return Err(anyhow!(
                    "port {port} (from {source}) is already in use — free it or pick another"
                ));
            }
            Ok(port)
        }
        None => Ok(pick_port(8756)),
    }
}

fn emit_status(app: &tauri::AppHandle, state: &str, message: &str) {
    emit_boot(app, state, message, None, None);
}

fn emit_boot(
    app: &tauri::AppHandle,
    state: &str,
    message: &str,
    progress: Option<f64>,
    detail: Option<&str>,
) {
    let mut payload = serde_json::json!({ "state": state, "message": message });
    if let Some(progress) = progress {
        payload["progress"] = serde_json::json!(progress);
    }
    if let Some(detail) = detail {
        payload["detail"] = serde_json::json!(detail);
    }
    let _ = app.emit("boot-status", payload);
}

fn navigate(app: &tauri::AppHandle, url: &str) -> Result<()> {
    let window = app
        .get_webview_window("main")
        .context("main window missing")?;
    let parsed = url.parse().context("invalid server url")?;
    window.navigate(parsed).context("navigation failed")?;
    Ok(())
}

/// counts compressed bytes as they stream out of the tarball so the splash
/// can show extraction progress
struct ProgressReader<'a, R: Read> {
    inner: R,
    app: &'a tauri::AppHandle,
    read: u64,
    total: u64,
    last_emit: Instant,
}

impl<R: Read> Read for ProgressReader<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.read += n as u64;
        if self.total > 0 && self.last_emit.elapsed() >= Duration::from_millis(150) {
            self.last_emit = Instant::now();
            emit_boot(
                self.app,
                "extracting",
                "Preparing application files…",
                Some(self.read as f64 / self.total as f64),
                None,
            );
        }
        Ok(n)
    }
}

/// extract the bundled runtime tarball into app_data/runtime/<id> once per
/// build; the id is a hash of the tarball produced by assemble-runtime.ts
fn ensure_runtime(app: &tauri::AppHandle, app_data: &Path) -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("STORYTELLER_TAURI_RUNTIME_DIR") {
        return Ok(PathBuf::from(dir));
    }

    let id = fs::read_to_string(
        app.path()
            .resolve("resources/runtime-id", BaseDirectory::Resource)?,
    )
    .context("bundled runtime-id resource missing")?;
    let id = id.trim();

    let runtimes = app_data.join("runtime");
    let dest = runtimes.join(id);
    if !dest.join("applications/web/server.js").exists() {
        let tarball = app
            .path()
            .resolve("resources/runtime.tar.gz", BaseDirectory::Resource)?;
        let tmp = runtimes.join(format!("{id}.partial"));
        if tmp.exists() {
            fs::remove_dir_all(&tmp)?;
        }
        fs::create_dir_all(&tmp)?;
        let total = fs::metadata(&tarball).map(|m| m.len()).unwrap_or(0);
        let file = fs::File::open(&tarball).context("bundled runtime tarball missing")?;
        let progress = ProgressReader {
            inner: std::io::BufReader::new(file),
            app,
            read: 0,
            total,
            last_emit: Instant::now(),
        };
        let decoder = flate2::read::GzDecoder::new(progress);
        let mut archive = tar::Archive::new(decoder);
        archive.set_preserve_permissions(true);
        for entry in archive.entries().context("runtime extraction failed")? {
            let mut entry = entry.context("runtime extraction failed")?;
            // skip macOS AppleDouble metadata entries: extracted as real
            // files they'd be picked up by directory scans (e.g. migrations)
            let is_appledouble = entry
                .path()
                .context("runtime extraction failed")?
                .file_name()
                .map(|name| name.to_string_lossy().starts_with("._"))
                .unwrap_or(false);
            if is_appledouble {
                continue;
            }
            entry.unpack_in(&tmp).context("runtime extraction failed")?;
        }
        if dest.exists() {
            fs::remove_dir_all(&dest)?;
        }
        fs::rename(&tmp, &dest)?;
    }

    // drop runtimes from previous app versions
    if let Ok(entries) = fs::read_dir(&runtimes) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy() != id {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }

    Ok(dest)
}

fn ensure_secret(app_data: &Path) -> Result<PathBuf> {
    let secret_file = app_data.join("secret.key");
    if !secret_file.exists() {
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        fs::write(&secret_file, hex)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&secret_file, fs::Permissions::from_mode(0o600))?;
        }
    }
    Ok(secret_file)
}

fn pick_port(preferred: u16) -> u16 {
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(preferred)
}

fn spawn_server(
    app: &tauri::AppHandle,
    runtime_dir: &Path,
    data_dir: &Path,
    assets_dir: Option<&Path>,
    secret_file: &Path,
    log_path: &Path,
    port: u16,
    readium_port: u16,
) -> Result<()> {
    let exe_dir = std::env::current_exe()?
        .parent()
        .context("no exe dir")?
        .to_path_buf();
    let node = exe_dir.join(exe_name("node"));
    if !node.exists() {
        return Err(anyhow!(
            "node sidecar missing at {} — was fetch-binaries run before bundling?",
            node.display()
        ));
    }

    // i have no fucking clue what this does
    // claude:
    // a process whose executable lives inside the .app bundle inherits the
    // bundle's LaunchServices identity as a Foreground app, so when next.js
    // sets its process title (libuv checks the process in with LS to set the
    // display name) a second, forever-bouncing dock icon appears. spawned
    // from a copy outside the bundle the same check-in registers as
    // background-only and stays out of the dock.
    #[cfg(target_os = "macos")]
    let node = {
        let relocated = runtime_dir.join("node");
        let stale = match (fs::metadata(&relocated), fs::metadata(&node)) {
            (Ok(copied), Ok(bundled)) => copied.len() != bundled.len(),
            _ => true,
        };
        if stale {
            fs::copy(&node, &relocated)
                .context("failed to stage node sidecar outside the app bundle")?;
        }
        relocated
    };

    let web_dir = runtime_dir.join("applications").join("web");

    // sidecar dir first so the server finds readium/ffmpeg/ffprobe
    let mut path_entries = vec![exe_dir.clone()];
    if let Some(existing) = std::env::var_os("PATH") {
        path_entries.extend(std::env::split_paths(&existing));
    }
    let path_var = std::env::join_paths(path_entries)?;

    let log = fs::File::create(log_path)?;

    let mut cmd = Command::new(&node);
    // scrub ambient server config (a terminal launch inherits the shell env,
    // including direnv-exported dev vars) so only what we set below applies
    for (key, _) in std::env::vars_os() {
        let key_str = key.to_string_lossy();
        if key_str.starts_with("STORYTELLER_")
            || key_str.starts_with("NEXT_")
            || key_str.starts_with("AUTH_")
            || matches!(
                key_str.as_ref(),
                "PORT"
                    | "HOSTNAME"
                    | "NODE_ENV"
                    | "NODE_OPTIONS"
                    | "READIUM_PORT"
                    | "SQLITE_NATIVE_BINDING"
                    | "ERROR_ALIGN_NATIVE_BINDING"
            )
        {
            cmd.env_remove(key);
        }
    }
    cmd.arg("--enable-source-maps")
        .arg(web_dir.join("server.js"))
        .current_dir(&web_dir)
        .env("PATH", path_var)
        .env("NODE_ENV", "production")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("READIUM_PORT", readium_port.to_string())
        .env("STORYTELLER_DATA_DIR", data_dir)
        .env("STORYTELLER_SECRET_KEY_FILE", secret_file)
        .envs(assets_dir.map(|dir| ("STORYTELLER_ASSETS_DIR", dir)))
        .env("STORYTELLER_WORKER", "worker.mjs")
        .env("STORYTELLER_FILE_WRITE_WORKER", "fileWriteWorker.mjs")
        .env("STORYTELLER_TAURI", "1")
        .env(
            "ERROR_ALIGN_NATIVE_BINDING",
            web_dir
                .join("work-dist")
                .join("@storyteller-platform")
                .join("align"),
        )
        .env(
            "SQLITE_NATIVE_BINDING",
            runtime_dir
                .join("node_modules")
                .join("better-sqlite3")
                .join("build")
                .join("Release")
                .join("better_sqlite3.node"),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().context("failed to spawn server")?;
    *app.state::<ServerState>().child.lock().unwrap() = Some(child);
    Ok(())
}

fn exe_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn server_exit_status(app: &tauri::AppHandle) -> Option<String> {
    let state = app.state::<ServerState>();
    let mut guard = state.child.lock().unwrap();
    let child = guard.as_mut()?;
    match child.try_wait() {
        Ok(Some(status)) => Some(status.to_string()),
        _ => None,
    }
}

/// terminate gracefully so the server can stop readium and close sqlite;
/// SIGKILL only after a timeout
fn stop_server(state: &ServerState) {
    {
        let mut shutting_down = state.shutting_down.lock().unwrap();
        if *shutting_down {
            return;
        }
        *shutting_down = true;
    }
    let Some(mut child) = state.child.lock().unwrap().take() else {
        return;
    };

    #[cfg(unix)]
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        // no SIGTERM on windows; kill the whole tree so readium doesn't orphan
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .status();
    }

    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            _ if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break;
            }
            _ => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

fn is_sqlite_file(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 16];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    &header == b"SQLite format 3\0"
}

/// put `src` in place as the library database; stale WAL/SHM files from the
/// previous database must not survive the swap
fn install_database(data_dir: &Path, src: &Path) -> Result<()> {
    let db_file = data_dir.join("storyteller.db");
    for suffix in ["-wal", "-shm"] {
        let _ = fs::remove_file(data_dir.join(format!("storyteller.db{suffix}")));
    }
    fs::copy(src, &db_file)
        .with_context(|| format!("failed to copy {} into the library", src.display()))?;
    Ok(())
}

/// menu-driven database restore: confirm, pick a file, back up the current
/// database, swap, and boot the server again
fn restore_database_flow(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

    let confirmed = app
        .dialog()
        .message(
            "Storyteller Server will restart using the database file you select. \
             The current database is backed up into the library's backups folder first.",
        )
        .title("Restore Database")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Choose File…".to_string(),
            "Cancel".to_string(),
        ))
        .blocking_show();
    if !confirmed {
        return;
    }

    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file()
    else {
        return;
    };
    let Ok(path) = picked.into_path() else {
        return;
    };
    if !is_sqlite_file(&path) {
        app.dialog()
            .message("That file doesn't look like a SQLite database.")
            .title("Restore Database")
            .blocking_show();
        return;
    }

    if let Err(err) = restore_database(&app, &path) {
        emit_status(&app, "error", &format!("{err:#}"));
    }
}

fn restore_database(app: &tauri::AppHandle, src: &Path) -> Result<()> {
    let app_data = app.path().app_data_dir().context("no app data directory")?;
    let data_dir = app_data.join("data");

    // back to the splash so the user sees restart progress
    let splash = app
        .state::<ServerState>()
        .splash_url
        .lock()
        .unwrap()
        .clone();
    if let (Some(window), Some(url)) = (app.get_webview_window("main"), splash) {
        let _ = window.navigate(url);
    }

    emit_status(app, "starting", "Stopping the server…");
    let state = app.state::<ServerState>();
    stop_server(state.inner());
    *state.shutting_down.lock().unwrap() = false;
    *state.server_url.lock().unwrap() = None;

    let current = data_dir.join("storyteller.db");
    if current.exists() {
        let backups = data_dir.join("backups");
        fs::create_dir_all(&backups)?;
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let backup = backups.join(format!("pre-restore-{stamp}.db"));
        fs::rename(&current, &backup).with_context(|| {
            format!(
                "failed to back up the current database to {}",
                backup.display()
            )
        })?;
    }

    install_database(&data_dir, src)?;

    let handle = app.clone();
    std::thread::spawn(move || boot(handle));
    Ok(())
}

fn open_server_log(app: &tauri::AppHandle) {
    let log_path = app.state::<ServerState>().log_path.lock().unwrap().clone();
    let Some(log_path) = log_path else {
        return;
    };
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(&log_path).spawn();
    #[cfg(target_os = "linux")]
    let _ = Command::new("xdg-open").arg(&log_path).spawn();
    #[cfg(windows)]
    let _ = Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(&log_path)
        .spawn();
}

/// minimal http health probe; avoids pulling in an http client crate
fn http_ok(port: u16, path: &str) -> bool {
    let addr = match format!("127.0.0.1:{port}").parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request =
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 32];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    String::from_utf8_lossy(&buf[..n]).contains(" 200 ")
}

fn tail_log(log_path: &Path, lines: usize) -> String {
    let Ok(content) = fs::read_to_string(log_path) else {
        return format!("(no server log at {})", log_path.display());
    };
    let tail: Vec<&str> = content.lines().rev().take(lines).collect();
    let tail: Vec<&str> = tail.into_iter().rev().collect();
    tail.join("\n")
}

fn last_log_line(log_path: &Path) -> Option<String> {
    let content = fs::read_to_string(log_path).ok()?;
    content
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
}
