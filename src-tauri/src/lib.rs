pub mod attachments;
pub mod database;
pub mod kit;
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

    #[tauri::command]
    async fn store_attachment(
        request: tauri::ipc::Request<'_>,
        database: tauri::State<'_, Mutex<Database>>,
    ) -> Result<crate::attachments::StoredAttachment, String> {
        match request.body() {
            tauri::ipc::InvokeBody::Raw(bytes) => database
                .lock()
                .map_err(|e| e.to_string())?
                .store_attachment(bytes),
            _ => Err("Expected binary attachment data".into()),
        }
    }
    #[tauri::command]
    async fn load_attachment(
        hash: String,
        database: tauri::State<'_, Mutex<Database>>,
    ) -> Result<tauri::ipc::Response, String> {
        database
            .lock()
            .map_err(|e| e.to_string())?
            .load_attachment(&hash)
            .map(tauri::ipc::Response::new)
    }
    #[tauri::command]
    fn prune_attachments(database: tauri::State<'_, Mutex<Database>>) -> Result<(), String> {
        database
            .lock()
            .map_err(|e| e.to_string())?
            .prune_attachments()
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
            updater_enabled,
            store_attachment,
            load_attachment,
            prune_attachments
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Quiet Workspace");
}
