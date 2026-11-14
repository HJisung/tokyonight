mod files;
mod menu;
mod search;
mod store;
mod watch;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(watch::WatchState::start(app.handle().clone()));
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // "cmd:"로 시작하는 항목은 화면 쪽에서 처리한다.
            if let Some(command) = event.id().as_ref().strip_prefix("cmd:") {
                let _ = app.emit("menu", command);
            }
        })
        .invoke_handler(tauri::generate_handler![
            files::resolve_path,
            files::read_dir,
            files::read_file,
            files::write_file,
            files::create_file,
            files::create_dir,
            files::rename_path,
            files::trash_path,
            files::existing_names,
            files::copy_path,
            store::load_app_state,
            store::set_last,
            store::load_session,
            store::save_session,
            store::scratch_list,
            store::scratch_read,
            store::scratch_write,
            store::scratch_remove,
            watch::watch_folder,
            watch::watch_files,
            search::search,
        ])
        .run(tauri::generate_context!())
        .expect("앱을 시작하지 못했습니다");
}
