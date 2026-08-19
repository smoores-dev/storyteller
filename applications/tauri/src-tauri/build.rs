fn main() {
    // the served web app is a remote origin (http://127.0.0.1:<port>) to
    // tauri's acl, and remote origins can only invoke commands that exist as
    // permissions; registering them here generates allow-* permissions the
    // capability can grant (local pages like the splash are unaffected)
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "set_titlebar_color",
            "report_user_agent",
            "read_server_log",
            "show_server_log",
            "choose_database",
            "choose_assets_dir",
            "get_tauri_config",
            "set_update_channel",
            "check_for_updates_now",
        ]),
    ))
    .expect("failed to run tauri-build");
}
