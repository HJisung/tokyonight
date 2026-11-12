mod app_info;
mod fs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(fs::FsScope::default())
        .invoke_handler(tauri::generate_handler![
            app_info::get_app_info,
            fs::commands::fs_pick_folder,
            fs::commands::fs_pick_file,
            fs::commands::fs_pick_save_file,
            fs::commands::fs_list_dir,
            fs::commands::fs_read_text,
            fs::commands::fs_write_text,
            fs::commands::fs_create_file,
            fs::commands::fs_create_folder,
            fs::commands::fs_rename,
            fs::commands::fs_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
