use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::UNIX_EPOCH;

static FILE_IO: Mutex<()> = Mutex::new(());
static TEMP_SERIAL: AtomicU64 = AtomicU64::new(0);

#[cfg(test)]
thread_local! {
    static BEFORE_COMMIT_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = const { std::cell::RefCell::new(None) };
}

const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFile {
    raw: String,
    mtime_ms: f64,
}

fn mtime_ms(path: &Path) -> Option<f64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as f64)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn temp_file(target: &Path) -> io::Result<(PathBuf, fs::File)> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let name = target.file_name().unwrap_or_default().to_string_lossy();
    loop {
        let serial = TEMP_SERIAL.fetch_add(1, Ordering::Relaxed);
        let tmp = dir.join(format!(
            ".{}.tn-{}-{}.tmp",
            name,
            std::process::id(),
            serial
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
        {
            Ok(file) => return Ok((tmp, file)),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
}

/// 공유 임시 파일 없이 쓰기를 끝낸 자신의 파일만 공개한다.
/// 각 명령의 읽기·충돌 검사·쓰기는 FILE_IO로 직렬화한다.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    atomic_write_checked(path, bytes, || Ok(()))
}

fn atomic_write_checked(
    path: &Path,
    bytes: &[u8],
    check: impl FnOnce() -> io::Result<()>,
) -> io::Result<()> {
    // 호출부가 정규화한 경로를 그대로 교체한다. 마지막 링크를 다시 따라가면
    // 검사 뒤 교체된 링크가 엉뚱한 파일로 쓰기를 돌릴 수 있다.
    let target = path.to_path_buf();
    let (tmp, mut file) = temp_file(&target)?;
    let result = (|| {
        if let Ok(meta) = fs::metadata(&target) {
            fs::set_permissions(&tmp, meta.permissions())?;
        }
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        #[cfg(test)]
        BEFORE_COMMIT_HOOK.with(|slot| {
            if let Some(hook) = slot.borrow_mut().take() {
                hook();
            }
        });
        check()?;
        fs::rename(&tmp, &target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPath {
    pub path: String,
    pub is_symlink: bool,
}

#[tauri::command(async)]
pub fn resolve_path(path: String) -> Result<ResolvedPath, String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let original = Path::new(&path);
    if !original.is_absolute() {
        return Err("절대 경로가 필요합니다.".into());
    }
    let is_symlink = fs::symlink_metadata(original)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    let canonical = match fs::canonicalize(original) {
        Ok(path) => path,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            match (original.parent(), original.file_name()) {
                (Some(parent), Some(name)) => fs::canonicalize(parent)
                    .map(|p| p.join(name))
                    .unwrap_or_else(|_| original.to_path_buf()),
                _ => original.to_path_buf(),
            }
        }
        Err(e) => return Err(e.to_string()),
    };
    let display = canonical.to_string_lossy().into_owned();
    #[cfg(windows)]
    let display = if let Some(rest) = display.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else {
        display
            .strip_prefix(r"\\?\")
            .unwrap_or(&display)
            .to_string()
    };
    Ok(ResolvedPath {
        path: display,
        is_symlink,
    })
}

#[tauri::command(async)]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let mut entries: Vec<DirEntry> = fs::read_dir(&path)
        .map_err(err)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let path = e.path();
            // 심볼릭 링크는 가리키는 대상 기준으로 판단하고, 끊어진 링크는 숨긴다.
            let is_dir = fs::metadata(&path).ok()?.is_dir();
            Some(DirEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// 오류는 코드 문자열로 돌려준다: missing | not-text | too-large | error:<메시지>
#[tauri::command(async)]
pub fn read_file(path: String) -> Result<RawFile, String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let p = Path::new(&path);
    let meta = match fs::metadata(p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err("missing".into()),
        Err(e) => return Err(format!("error:{e}")),
    };
    if meta.is_dir() {
        return Err("not-text".into());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err("too-large".into());
    }
    let bytes = fs::read(p).map_err(|e| format!("error:{e}"))?;
    let raw = String::from_utf8(bytes).map_err(|_| "not-text".to_string())?;
    if raw.contains('\0') {
        return Err("not-text".into());
    }
    Ok(RawFile {
        raw,
        mtime_ms: mtime_ms(p).unwrap_or(0.0),
    })
}

/// expected_mtime_ms가 주어지면 디스크의 파일이 그 시점 그대로일 때만 쓴다.
/// 달라졌거나 사라졌으면 "conflict"를 돌려주고 아무것도 쓰지 않는다.
#[tauri::command(async)]
pub fn write_file(
    path: String,
    raw: String,
    expected_mtime_ms: Option<f64>,
    expected_raw: Option<String>,
) -> Result<f64, String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let p = Path::new(&path);
    if fs::symlink_metadata(p)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("error:저장 위치가 심볼릭 링크입니다. 파일을 다시 여세요.".into());
    }
    if let Some(expected) = expected_mtime_ms {
        match mtime_ms(p) {
            Some(current) if current == expected => {}
            _ => return Err("conflict".into()),
        }
    }
    if expected_mtime_ms.is_some() && expected_raw.is_none() {
        return Err("error:마지막으로 읽은 원문이 필요합니다.".into());
    }
    let before = match fs::read(p) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("error:{e}")),
    };
    let before_time = mtime_ms(p);
    if let Some(expected) = expected_raw {
        if before.as_deref() != Some(expected.as_bytes()) {
            return Err("conflict".into());
        }
    }
    atomic_write_checked(p, raw.as_bytes(), || {
        let now = match fs::read(p) {
            Ok(bytes) => Some(bytes),
            Err(e) if e.kind() == io::ErrorKind::NotFound => None,
            Err(e) => return Err(e),
        };
        let linked = fs::symlink_metadata(p)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);
        if linked || now != before || mtime_ms(p) != before_time {
            return Err(io::Error::new(io::ErrorKind::WouldBlock, "conflict"));
        }
        Ok(())
    })
    .map_err(|e| {
        if e.kind() == io::ErrorKind::WouldBlock && e.to_string() == "conflict" {
            "conflict".into()
        } else {
            format!("error:{e}")
        }
    })?;
    Ok(mtime_ms(p).unwrap_or(0.0))
}

#[tauri::command(async)]
pub fn create_file(path: String) -> Result<(), String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map(|_| ())
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                "같은 이름의 항목이 이미 있습니다.".to_string()
            } else {
                err(e)
            }
        })
}

#[tauri::command(async)]
pub fn create_dir(path: String) -> Result<(), String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    if Path::new(&path).exists() {
        return Err("같은 이름의 항목이 이미 있습니다.".into());
    }
    fs::create_dir(&path).map_err(err)
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn same_directory_entry(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (fs::symlink_metadata(a), fs::symlink_metadata(b)) {
            (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
            _ => false,
        }
    }
    #[cfg(not(unix))]
    {
        a == b
    } // 파일 ID를 검증하지 못하는 플랫폼에서는 기존 대상을 교체하지 않는다.
}

#[tauri::command(async)]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let (src, dst) = (Path::new(&from), Path::new(&to));
    // 대소문자만 바꾸는 경우(같은 파일)는 허용한다.
    if fs::symlink_metadata(dst).is_ok() && !same_directory_entry(src, dst) {
        return Err("같은 이름의 항목이 이미 있습니다.".into());
    }
    fs::rename(src, dst).map_err(err)
}

#[tauri::command(async)]
pub fn trash_path(path: String) -> Result<(), String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    trash::delete(&path).map_err(err)
}

/// sources 중 dest_dir에 같은 이름이 이미 있는 것들의 이름.
#[tauri::command(async)]
pub fn existing_names(sources: Vec<String>, dest_dir: String) -> Vec<String> {
    sources
        .iter()
        .filter_map(|s| {
            Path::new(s)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
        })
        .filter(|name| fs::symlink_metadata(Path::new(&dest_dir).join(name)).is_ok())
        .collect()
}

fn numbered(name: &str, n: u32) -> String {
    match name.rfind('.') {
        Some(dot) if dot > 0 => format!("{} {}{}", &name[..dot], n, &name[dot..]),
        _ => format!("{name} {n}"),
    }
}

fn copy_recursive(src: &Path, dst: &Path, overwrite: bool) -> io::Result<()> {
    let source_meta = fs::symlink_metadata(src)?;
    if source_meta.file_type().is_symlink() {
        return Err(io::Error::other("하위 심볼릭 링크는 복사할 수 없습니다."));
    }
    if let Ok(meta) = fs::symlink_metadata(dst) {
        if meta.file_type().is_symlink() {
            return Err(io::Error::other("대상 심볼릭 링크를 덮어쓸 수 없습니다."));
        }
        if !overwrite {
            return Err(io::Error::from(io::ErrorKind::AlreadyExists));
        }
    }
    if source_meta.is_dir() {
        if !dst.exists() {
            fs::create_dir(dst)?;
        }
        if !fs::metadata(dst)?.is_dir() {
            return Err(io::Error::other("대상이 폴더가 아닙니다."));
        }
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()), overwrite)?;
        }
        Ok(())
    } else {
        let mut input = fs::File::open(src)?;
        if !overwrite {
            // 검사 이후 다른 항목이 생겨도 create_new가 조용한 덮어쓰기를 막는다.
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dst)?;
            let result = io::copy(&mut input, &mut output).and_then(|_| output.sync_all());
            if result.is_err() {
                let _ = fs::remove_file(dst);
            }
            result
        } else {
            // 기존 파일을 먼저 truncate하지 않는다. 실패하면 기존 내용이 그대로 남는다.
            let (tmp, mut output) = temp_file(dst)?;
            let result = (|| {
                io::copy(&mut input, &mut output)?;
                fs::set_permissions(&tmp, source_meta.permissions())?;
                output.sync_all()?;
                drop(output);
                fs::rename(&tmp, dst)
            })();
            if result.is_err() {
                let _ = fs::remove_file(tmp);
            }
            result
        }
    }
}

/// 원본을 dest_dir 아래에 복사하고 최종 경로를 돌려준다. 원본은 건드리지 않는다.
/// mode: "fail"(이미 있으면 오류) | "overwrite" | "keep-both"(번호를 붙여 새 이름)
#[tauri::command(async)]
pub fn copy_path(source: String, dest_dir: String, mode: String) -> Result<String, String> {
    let _guard = FILE_IO.lock().map_err(err)?;
    let src = fs::canonicalize(&source).map_err(err)?;
    let dest_dir = fs::canonicalize(&dest_dir).map_err(err)?;
    let original = Path::new(&source);
    let name = original
        .file_name()
        .ok_or("이름을 알 수 없는 항목입니다.")?
        .to_string_lossy()
        .into_owned();
    if dest_dir.starts_with(&src) {
        return Err("폴더를 자기 자신 안으로 복사할 수 없습니다.".into());
    }
    let mut dst: PathBuf = dest_dir.join(&name);
    if fs::symlink_metadata(&dst).is_ok() {
        match mode.as_str() {
            "overwrite" => {
                if same_file(&src, &dst) {
                    return Err("원본과 대상이 같은 항목입니다.".into());
                }
            }
            "keep-both" => {
                let mut n = 2;
                while fs::symlink_metadata(&dst).is_ok() {
                    dst = dest_dir.join(numbered(&name, n));
                    n += 1;
                }
            }
            _ => return Err("같은 이름의 항목이 이미 있습니다.".into()),
        }
    }
    copy_recursive(&src, &dst, mode == "overwrite").map_err(err)?;
    Ok(dst.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tn-test-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn stale_content_with_unchanged_mtime_must_not_be_overwritten() {
        let dir = temp_dir("same-mtime");
        let path = dir.join("a.txt");
        fs::write(&path, "old").unwrap();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let snapshot = read_file(path.to_string_lossy().into_owned()).unwrap();
        fs::write(&path, "external").unwrap();
        fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        assert!(write_file(
            path.to_string_lossy().into_owned(),
            "mine".into(),
            Some(snapshot.mtime_ms),
            Some(snapshot.raw)
        )
        .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");
    }

    #[test]
    fn atomic_write_does_not_truncate_an_unrelated_existing_temp_file() {
        let dir = temp_dir("temp-collision");
        let path = dir.join("a.txt");
        let occupied = dir.join(format!(".a.txt.tn-{}.tmp", std::process::id()));
        fs::write(&occupied, "unrelated data").unwrap();
        atomic_write(&path, b"my document").unwrap();
        assert_eq!(fs::read_to_string(&occupied).unwrap(), "unrelated data");
    }

    #[cfg(unix)]
    #[test]
    fn copying_a_symlink_uses_the_name_that_was_checked_for_conflicts() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("copy-alias");
        let src = dir.join("src");
        let dst = dir.join("dst");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        fs::write(src.join("real.txt"), "source").unwrap();
        symlink(src.join("real.txt"), src.join("alias.txt")).unwrap();
        fs::write(dst.join("alias.txt"), "confirmed target").unwrap();
        fs::write(dst.join("real.txt"), "must survive").unwrap();
        copy_path(
            src.join("alias.txt").to_string_lossy().into_owned(),
            dst.to_string_lossy().into_owned(),
            "overwrite".into(),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(dst.join("real.txt")).unwrap(),
            "must survive"
        );
        assert_eq!(fs::read_to_string(dst.join("alias.txt")).unwrap(), "source");
    }

    #[cfg(unix)]
    #[test]
    fn directory_copy_does_not_follow_destination_symlinks_outside_the_target() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("copy-dest-link");
        let source = dir.join("src");
        let destination = dir.join("dst");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(destination.join("src")).unwrap();
        fs::write(source.join("a.txt"), "new").unwrap();
        let victim = dir.join("victim.txt");
        fs::write(&victim, "unrelated").unwrap();
        symlink(&victim, destination.join("src/a.txt")).unwrap();
        assert!(copy_path(
            source.to_string_lossy().into_owned(),
            destination.to_string_lossy().into_owned(),
            "overwrite".into()
        )
        .is_err());
        assert_eq!(fs::read_to_string(&victim).unwrap(), "unrelated");
    }

    #[cfg(unix)]
    #[test]
    fn replacing_a_symlink_never_writes_its_unrelated_target() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("atomic-target-link");
        let target = dir.join("note.txt");
        let victim = dir.join("other.txt");
        fs::write(&victim, "unrelated").unwrap();
        symlink(&victim, &target).unwrap();
        atomic_write(&target, b"note").unwrap();
        assert_eq!(fs::read_to_string(&victim).unwrap(), "unrelated");
    }

    #[cfg(unix)]
    #[test]
    fn resolve_path_unifies_dot_and_symlink_aliases() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("resolve");
        fs::write(dir.join("real.txt"), "text").unwrap();
        symlink(dir.join("real.txt"), dir.join("alias.txt")).unwrap();
        let direct = resolve_path(dir.join("./real.txt").to_string_lossy().into_owned()).unwrap();
        let alias = resolve_path(dir.join("alias.txt").to_string_lossy().into_owned()).unwrap();
        assert_eq!(direct.path, alias.path);
        assert!(!direct.is_symlink);
        assert!(alias.is_symlink);
    }

    #[test]
    fn two_checked_writers_cannot_both_replace_the_same_snapshot() {
        let dir = temp_dir("parallel-cas");
        let path = dir.join("note.txt");
        fs::write(&path, "old").unwrap();
        let snapshot = read_file(path.to_string_lossy().into_owned()).unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let jobs: Vec<_> = ["one", "two"]
            .into_iter()
            .map(|text| {
                let path = path.to_string_lossy().into_owned();
                let barrier = barrier.clone();
                let old = snapshot.raw.clone();
                let time = snapshot.mtime_ms;
                std::thread::spawn(move || {
                    barrier.wait();
                    write_file(path, text.into(), Some(time), Some(old))
                })
            })
            .collect();
        let success = jobs
            .into_iter()
            .map(|job| job.join().unwrap())
            .filter(Result::is_ok)
            .count();
        assert_eq!(success, 1);
    }

    #[cfg(unix)]
    #[test]
    fn rename_does_not_replace_an_unconfirmed_dangling_symlink() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("rename-dangling");
        let source = dir.join("a.txt");
        let target = dir.join("b.txt");
        fs::write(&source, "original").unwrap();
        symlink(dir.join("missing"), &target).unwrap();
        assert!(rename_path(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned()
        )
        .is_err());
        assert_eq!(fs::read_to_string(source).unwrap(), "original");
        assert!(fs::symlink_metadata(target)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn rename_does_not_replace_a_different_link_to_the_same_file() {
        use std::os::unix::fs::symlink;
        let dir = temp_dir("rename-link-alias");
        let source = dir.join("a.txt");
        let target = dir.join("b.txt");
        fs::write(&source, "original").unwrap();
        symlink(&source, &target).unwrap();
        assert!(rename_path(
            source.to_string_lossy().into_owned(),
            target.to_string_lossy().into_owned()
        )
        .is_err());
        assert_eq!(fs::read_to_string(source).unwrap(), "original");
    }

    #[test]
    fn change_while_the_temp_file_is_written_must_not_be_overwritten() {
        let dir = temp_dir("change-during-stage");
        let path = dir.join("a.txt");
        fs::write(&path, "old").unwrap();
        let snapshot = read_file(path.to_string_lossy().into_owned()).unwrap();
        let external = path.clone();
        BEFORE_COMMIT_HOOK.with(|slot| {
            *slot.borrow_mut() = Some(Box::new(move || {
                fs::write(external, "external while staging").unwrap();
            }));
        });
        let result = write_file(
            path.to_string_lossy().into_owned(),
            "mine".into(),
            Some(snapshot.mtime_ms),
            Some(snapshot.raw),
        );
        assert_eq!(result, Err("conflict".into()));
        assert_eq!(fs::read_to_string(path).unwrap(), "external while staging");
    }

    #[test]
    fn write_refuses_when_disk_changed() {
        let dir = temp_dir("conflict");
        let file = dir.join("a.md").to_string_lossy().into_owned();
        let first = write_file(file.clone(), "one".into(), None, None).unwrap();
        assert_eq!(
            write_file(
                file.clone(),
                "two".into(),
                Some(first - 5000.0),
                Some("one".into())
            ),
            Err("conflict".into())
        );
        assert_eq!(fs::read_to_string(&file).unwrap(), "one");
        assert!(write_file(file.clone(), "two".into(), Some(first), Some("one".into())).is_ok());
        assert_eq!(fs::read_to_string(&file).unwrap(), "two");
        fs::remove_file(&file).unwrap();
        assert_eq!(
            write_file(
                file.clone(),
                "three".into(),
                Some(first),
                Some("two".into())
            ),
            Err("conflict".into())
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn read_rejects_non_text() {
        let dir = temp_dir("binary");
        let file = dir.join("b");
        fs::write(&file, [0xff, 0xfe, 0x00, 0x41]).unwrap();
        assert_eq!(
            read_file(file.to_string_lossy().into_owned()).err(),
            Some("not-text".into())
        );
        assert_eq!(
            read_file(dir.join("none").to_string_lossy().into_owned()).err(),
            Some("missing".into())
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn copy_keeps_original_and_never_overwrites_silently() {
        let dir = temp_dir("copy");
        let (src_dir, dst_dir) = (dir.join("src"), dir.join("dst"));
        fs::create_dir_all(src_dir.join("sub")).unwrap();
        fs::create_dir_all(&dst_dir).unwrap();
        fs::write(src_dir.join("n.md"), "new").unwrap();
        fs::write(src_dir.join("sub/x.txt"), "x").unwrap();
        fs::write(dst_dir.join("n.md"), "old").unwrap();
        let s = |p: PathBuf| p.to_string_lossy().into_owned();

        assert_eq!(
            existing_names(vec![s(src_dir.join("n.md"))], s(dst_dir.clone())),
            vec!["n.md"]
        );
        assert!(copy_path(s(src_dir.join("n.md")), s(dst_dir.clone()), "fail".into()).is_err());
        assert_eq!(fs::read_to_string(dst_dir.join("n.md")).unwrap(), "old");

        let kept = copy_path(
            s(src_dir.join("n.md")),
            s(dst_dir.clone()),
            "keep-both".into(),
        )
        .unwrap();
        assert!(kept.ends_with("n 2.md"));
        assert_eq!(fs::read_to_string(dst_dir.join("n.md")).unwrap(), "old");

        copy_path(
            s(src_dir.join("n.md")),
            s(dst_dir.clone()),
            "overwrite".into(),
        )
        .unwrap();
        assert_eq!(fs::read_to_string(dst_dir.join("n.md")).unwrap(), "new");
        assert_eq!(fs::read_to_string(src_dir.join("n.md")).unwrap(), "new");

        copy_path(s(src_dir.join("sub")), s(dst_dir.clone()), "fail".into()).unwrap();
        assert_eq!(fs::read_to_string(dst_dir.join("sub/x.txt")).unwrap(), "x");
        assert!(copy_path(s(src_dir.clone()), s(src_dir.join("sub")), "fail".into()).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
