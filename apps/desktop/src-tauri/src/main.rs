// Report Studio PRO desktop shell.
// Starts the bundled local backend (FastAPI + SQLite) on 127.0.0.1:8765 so the app works fully offline
// (editing, PDF/DOCX/ODT export, local Ollama). Cloud sync uses the /sync API of a remote server.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct Backend(Mutex<Option<CommandChild>>);

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let db = format!("sqlite:///{}", data.join("reportstudio.db").to_string_lossy().replace('\\', "/"));
            let (_rx, child) = app.shell().sidecar("rsp-backend")?
                .env("RSP_DATABASE_URL", db)
                .env("RSP_PARENT_PID", std::process::id().to_string())
                .env("RSP_STORAGE_DIR", data.join("storage").to_string_lossy().to_string())
                .env("RSP_CORS_ORIGINS", "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:5173")
                .spawn()?;
            *app.state::<Backend>().0.lock().unwrap() = Some(child);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Report Studio PRO");
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = handle.state::<Backend>().0.lock().unwrap().take() {
                let _ = child.kill(); // never leave the local server running after the app closes
            }
        }
    });
}
