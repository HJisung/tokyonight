//! Tauri 명령. 인자를 넘기기만 하고 로직은 `ops`·`scope`에 둡니다.
//! 프런트엔드의 `src/ipc/fs.ts`와 짝을 이룹니다.

use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::{FsError, FsResult};
use super::ops::{self, Entry, OsTrash};
use super::scope::FsScope;

fn picked_path(picked: FilePath) -> FsResult<std::path::PathBuf> {
    picked.into_path().map_err(|err| {
        FsError::new(
            super::error::FsErrorKind::Other,
            format!("고른 경로를 쓸 수 없습니다: {err}"),
        )
    })
}

/// 폴더 선택 대화상자. 고른 폴더를 허용 목록에 넣고 경로를 돌려줍니다. 취소하면 `None`.
#[tauri::command]
pub async fn fs_pick_folder(app: AppHandle, scope: State<'_, FsScope>) -> FsResult<Option<String>> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let folder = scope.allow_folder(&picked_path(picked)?)?;
    ops::path_string(&folder).map(Some)
}

/// 파일 열기 대화상자. 고른 파일을 허용 목록에 넣고 경로를 돌려줍니다. 취소하면 `None`.
#[tauri::command]
pub async fn fs_pick_file(app: AppHandle, scope: State<'_, FsScope>) -> FsResult<Option<String>> {
    let Some(picked) = app.dialog().file().blocking_pick_file() else {
        return Ok(None);
    };
    let file = scope.allow_file(&picked_path(picked)?)?;
    ops::path_string(&file).map(Some)
}

/// 저장 대화상자. 고른 경로(아직 없는 파일 포함)를 허용 목록에 넣고 돌려줍니다. 취소하면 `None`.
/// 이미 있는 파일을 고르면 덮어쓸지는 OS 대화상자가 묻습니다.
#[tauri::command]
pub async fn fs_pick_save_file(
    app: AppHandle,
    scope: State<'_, FsScope>,
    default_name: Option<String>,
) -> FsResult<Option<String>> {
    let mut dialog = app.dialog().file();
    if let Some(name) = default_name {
        dialog = dialog.set_file_name(name);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let file = scope.allow_file(&picked_path(picked)?)?;
    ops::path_string(&file).map(Some)
}

#[tauri::command(async)]
pub fn fs_list_dir(scope: State<'_, FsScope>, path: String) -> FsResult<Vec<Entry>> {
    ops::list_dir(&scope, Path::new(&path))
}

#[tauri::command(async)]
pub fn fs_read_text(scope: State<'_, FsScope>, path: String) -> FsResult<String> {
    ops::read_text(&scope, Path::new(&path))
}

#[tauri::command(async)]
pub fn fs_write_text(scope: State<'_, FsScope>, path: String, contents: String) -> FsResult<()> {
    ops::write_text(&scope, Path::new(&path), &contents)
}

#[tauri::command(async)]
pub fn fs_create_file(scope: State<'_, FsScope>, path: String) -> FsResult<String> {
    ops::create_file(&scope, Path::new(&path))
}

#[tauri::command(async)]
pub fn fs_create_folder(scope: State<'_, FsScope>, path: String) -> FsResult<String> {
    ops::create_folder(&scope, Path::new(&path))
}

#[tauri::command(async)]
pub fn fs_rename(scope: State<'_, FsScope>, from: String, to: String) -> FsResult<String> {
    ops::rename_entry(&scope, Path::new(&from), Path::new(&to))
}

#[tauri::command(async)]
pub fn fs_delete(scope: State<'_, FsScope>, path: String) -> FsResult<()> {
    ops::delete_entry(&scope, Path::new(&path), &OsTrash)
}
