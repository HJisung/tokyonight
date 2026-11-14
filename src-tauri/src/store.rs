//! 앱 상태, 폴더별 작업 화면, 임시 메모를 앱 데이터 폴더에 JSON/텍스트로 보관한다.
//! 사용자의 폴더에는 설정 파일을 만들지 않는다.

use crate::files::atomic_write;
use serde_json::{json, Value};
use std::fs;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

static STORE_IO: Mutex<()> = Mutex::new(());
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // 테스트나 별도 프로필 실행을 위해 위치를 바꿀 수 있게 한다.
    let dir = match std::env::var_os("TOKYONIGHT_DATA_DIR") {
        Some(custom) => PathBuf::from(custom),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".bak");
    PathBuf::from(name)
}

fn parse_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn read_json(path: &Path) -> Option<Value> {
    parse_json(path).or_else(|| parse_json(&backup_path(path)))
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if let Ok(previous) = fs::read(path) {
        if serde_json::from_slice::<Value>(&previous).is_ok() {
            atomic_write(&backup_path(path), &previous).map_err(|e| e.to_string())?;
        } else {
            // 새 기본 상태를 기록하더라도 손상본과 마지막 유효 백업은 보관한다.
            let stamp = std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let broken = path.with_extension(format!("corrupt-{stamp}"));
            fs::write(broken, previous).map_err(|e| e.to_string())?;
        }
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    atomic_write(path, text.as_bytes()).map_err(|e| e.to_string())
}

/// 폴더 경로를 파일 이름으로 쓰기 위한 FNV-1a 해시.
fn hash(text: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in text.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn session_path(app: &AppHandle, folder: &Option<String>) -> Result<PathBuf, String> {
    let name = match folder {
        Some(f) => hash(f),
        None => "no-folder".to_string(),
    };
    Ok(data_dir(app)?.join("sessions").join(format!("{name}.json")))
}

#[tauri::command]
pub fn load_app_state(app: AppHandle) -> Result<Value, String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    let state = read_json(&data_dir(&app)?.join("state.json")).unwrap_or(Value::Null);
    let recent: Vec<Value> = state["recent"]
        .as_array()
        .map(|a| a.iter().filter(|v| v.is_string()).cloned().collect())
        .unwrap_or_default();
    let last = if state["last"].is_string() {
        state["last"].clone()
    } else {
        Value::Null
    };
    Ok(json!({ "recent": recent, "last": last }))
}

/// 마지막 세션을 기록한다. 폴더를 연 경우 최근 목록의 맨 앞으로 올린다.
#[tauri::command]
pub fn set_last(app: AppHandle, last: Option<String>) -> Result<(), String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    let path = data_dir(&app)?.join("state.json");
    let mut recent: Vec<String> = read_json(&path)
        .and_then(|s| s["recent"].as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    if let Some(folder) = last.as_ref().filter(|f| !f.is_empty()) {
        recent.retain(|r| r != folder);
        recent.insert(0, folder.clone());
        recent.truncate(12);
    }
    write_json(&path, &json!({ "recent": recent, "last": last }))
}

#[tauri::command]
pub fn load_session(app: AppHandle, folder: Option<String>) -> Result<Value, String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    let stored = read_json(&session_path(&app, &folder)?).unwrap_or(Value::Null);
    Ok(stored["session"].clone())
}

#[tauri::command]
pub fn save_session(app: AppHandle, folder: Option<String>, session: Value) -> Result<(), String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    write_json(
        &session_path(&app, &folder)?,
        &json!({ "folder": folder, "session": session }),
    )
}

fn scratch_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("scratch");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn check_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric()) {
        Ok(())
    } else {
        Err("잘못된 임시 메모 ID".into())
    }
}

fn valid_meta(meta: &Value, id: &str) -> bool {
    meta["id"].as_str() == Some(id)
        && meta["title"].is_string()
        && matches!(meta["kind"].as_str(), Some("md" | "txt"))
        && meta["updatedAt"].is_number()
}

fn scratch_index(dir: &Path) -> Result<Vec<Value>, String> {
    let stored = read_json(&dir.join("index.json"))
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    let mut index = Vec::new();
    // 인덱스는 캐시다. 성공한 본문 쓰기와 인덱스 쓰기 사이의 중단도 복구한다.
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") || !path.is_file() {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if check_id(id).is_err() {
            continue;
        }
        let meta = read_json(&dir.join(format!("{id}.json")))
            .filter(|m| valid_meta(m, id))
            .or_else(|| stored.iter().find(|m| valid_meta(m, id)).cloned());
        if let Some(meta) = meta {
            index.push(meta);
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_else(|_| "읽을 수 없는 임시 메모".into());
        let title = content
            .lines()
            .find(|s| !s.trim().is_empty())
            .unwrap_or("임시 메모")
            .trim();
        let title: String = title.chars().take(40).collect();
        let updated = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        index.push(json!({ "id": id, "kind": "txt", "title": title, "updatedAt": updated }));
    }
    index.sort_by(|a, b| {
        b["updatedAt"]
            .as_f64()
            .unwrap_or(0.0)
            .total_cmp(&a["updatedAt"].as_f64().unwrap_or(0.0))
    });
    Ok(index)
}

#[tauri::command]
pub fn scratch_list(app: AppHandle) -> Result<Vec<Value>, String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    scratch_index(&scratch_dir(&app)?)
}

fn scratch_read_in(dir: &Path, id: &str) -> Result<Option<String>, String> {
    check_id(id)?;
    match fs::read_to_string(dir.join(format!("{id}.txt"))) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn scratch_write_in(dir: &Path, meta: Value, content: String) -> Result<(), String> {
    let id = meta["id"]
        .as_str()
        .ok_or("임시 메모 ID가 없습니다.")?
        .to_string();
    check_id(&id)?;
    atomic_write(&dir.join(format!("{id}.txt")), content.as_bytes()).map_err(|e| e.to_string())?;
    write_json(&dir.join(format!("{id}.json")), &meta)?;
    let mut index = scratch_index(dir)?;
    index.retain(|m| m["id"].as_str() != Some(&id));
    index.insert(0, meta);
    write_json(&dir.join("index.json"), &Value::Array(index))
}

fn scratch_remove_in(dir: &Path, id: &str) -> Result<(), String> {
    check_id(id)?;
    let mut index = scratch_index(dir)?;
    index.retain(|m| m["id"].as_str() != Some(id));
    write_json(&dir.join("index.json"), &Value::Array(index))?;
    match fs::remove_file(dir.join(format!("{id}.txt"))) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e.to_string()), // 본문이 남으면 다음 목록 스캔에서 다시 나타난다.
    }
    let _ = fs::remove_file(dir.join(format!("{id}.json")));
    let _ = fs::remove_file(backup_path(&dir.join(format!("{id}.json"))));
    Ok(())
}

#[tauri::command]
pub fn scratch_read(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    scratch_read_in(&scratch_dir(&app)?, &id)
}

#[tauri::command]
pub fn scratch_write(app: AppHandle, meta: Value, content: String) -> Result<(), String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    scratch_write_in(&scratch_dir(&app)?, meta, content)
}

#[tauri::command]
pub fn scratch_remove(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = STORE_IO.lock().map_err(|e| e.to_string())?;
    scratch_remove_in(&scratch_dir(&app)?, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tn-store-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn broken_json_recovers_the_last_valid_backup() {
        let dir = dir("backup");
        let path = dir.join("session.json");
        write_json(&path, &json!({"session": "first"})).unwrap();
        write_json(&path, &json!({"session": "second"})).unwrap();
        fs::write(&path, "{broken").unwrap();
        assert_eq!(read_json(&path), Some(json!({"session": "first"})));
    }

    #[test]
    fn missing_or_broken_scratch_index_does_not_hide_existing_content() {
        let dir = dir("orphan");
        fs::write(dir.join("orphan1.txt"), "보존할 메모").unwrap();
        fs::write(dir.join("index.json"), "{broken").unwrap();
        let index = scratch_index(&dir).unwrap();
        assert_eq!(index.len(), 1);
        assert_eq!(index[0]["id"], "orphan1");
        assert_eq!(
            scratch_read_in(&dir, "orphan1").unwrap(),
            Some("보존할 메모".into())
        );
    }

    #[test]
    fn an_unreadable_orphan_still_appears_in_the_recovery_list() {
        let dir = dir("unreadable-orphan");
        fs::write(dir.join("badutf8.txt"), [0xff, 0xfe]).unwrap();
        fs::write(dir.join("good.txt"), "good").unwrap();
        let index = scratch_index(&dir).unwrap();
        assert_eq!(index.len(), 2);
        assert!(scratch_read_in(&dir, "badutf8").is_err());
    }

    #[test]
    fn scratch_io_errors_are_not_reported_as_missing_or_success() {
        let dir = dir("io-errors");
        fs::create_dir(dir.join("broken.txt")).unwrap();
        assert!(scratch_read_in(&dir, "broken").is_err());
        assert!(scratch_remove_in(&dir, "broken").is_err());
    }
}
