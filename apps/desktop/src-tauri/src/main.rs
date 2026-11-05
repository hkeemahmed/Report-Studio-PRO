// Desktop shell: starts the bundled local backend (FastAPI + SQLite) on 127.0.0.1:8765 so the app
// works fully offline (editing, exports, local Ollama). Cloud sync uses the /sync API of a remote server.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data = dirs::data_dir().unwrap_or(std::env::temp_dir()).join("ReportStudioPRO");
            std::fs::create_dir_all(&data)?;
            let db = format!("sqlite:///{}", data.join("reportstudio.db").to_string_lossy().replace('\\', "/"));
            let (_rx, _child) = app.shell().sidecar("rsp-backend")?
                .env("RSP_DATABASE_URL", db)
                .env("RSP_STORAGE_DIR", data.join("storage").to_string_lossy().to_string())
                .env("RSP_CORS_ORIGINS", "tauri://localhost,http://tauri.localhost,http://localhost:5173")
                .spawn()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Report Studio PRO");
}
