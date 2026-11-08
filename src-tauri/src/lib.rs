pub mod database;
pub mod model;

#[cfg(feature = "desktop")]
pub fn run() {
    use database::Database;
    use model::Workspace;
    use std::sync::Mutex;
    use tauri::Manager;

    #[tauri::command]
    fn updater_enabled() -> bool {
        cfg!(target_os = "windows")
            && !option_env!("QUIET_UPDATER_PUBLIC_KEY")
                .unwrap_or("")
                .trim()
                .is_empty()
    }

    #[tauri::command]
    fn load_workspace(
        database: tauri::State<'_, Mutex<Database>>,
    ) -> Result<Option<Workspace>, String> {
        database.lock().map_err(|e| e.to_string())?.load()
    }

    #[tauri::command]
    fn save_workspace(
        workspace: Workspace,
        database: tauri::State<'_, Mutex<Database>>,
    ) -> Result<(), String> {
        database.lock().map_err(|e| e.to_string())?.save(&workspace)
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(option_env!("QUIET_UPDATER_PUBLIC_KEY").unwrap_or("").trim())
                .build(),
        )
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let database =
                Database::open(directory.join("workspace.db")).map_err(std::io::Error::other)?;
            app.manage(Mutex::new(database));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            updater_enabled
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Quiet Workspace");
}
