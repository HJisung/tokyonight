//! 파일 작업 로직. Tauri에 의존하지 않아 임시 폴더로 테스트합니다.
//!
//! 모든 함수는 먼저 `FsScope`로 경로를 확인하고, 허용 범위 밖이면 아무것도 하지 않습니다.

use std::fs;
use std::io::Write;
use std::path::Path;

use serde::Serialize;

use super::error::{FsError, FsErrorKind, FsResult};
use super::scope::FsScope;

/// 나열 결과의 항목 종류. 프런트엔드의 `FsEntryKind`와 같습니다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    Folder,
    /// `.md`
    Markdown,
    /// `.txt` 또는 확장자 없음(일반 텍스트)
    Text,
    /// 그 외. 열 수 없습니다.
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
}

/// 삭제 방식. 실제로는 OS 휴지통, 테스트에서는 대체 구현을 씁니다.
pub trait Trash {
    fn move_to_trash(&self, path: &Path) -> Result<(), String>;
}

/// OS 휴지통으로 보냅니다(`trash` crate).
pub struct OsTrash;

impl Trash for OsTrash {
    fn move_to_trash(&self, path: &Path) -> Result<(), String> {
        trash::delete(path).map_err(|err| err.to_string())
    }
}

/// 파일 이름으로 종류를 정합니다. 확장자는 대소문자를 가리지 않습니다.
pub fn classify_file(name: &str) -> EntryKind {
    match Path::new(name).extension() {
        None => EntryKind::Text,
        Some(ext) => match ext.to_string_lossy().to_ascii_lowercase().as_str() {
            "md" => EntryKind::Markdown,
            "txt" => EntryKind::Text,
            _ => EntryKind::Unsupported,
        },
    }
}

pub fn path_string(path: &Path) -> FsResult<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| FsError::other(path, "경로를 UTF-8로 나타낼 수 없습니다"))
}

#[cfg(windows)]
fn has_hidden_attribute(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
}

#[cfg(not(windows))]
fn has_hidden_attribute(_metadata: &fs::Metadata) -> bool {
    false
}

/// 폴더의 바로 아래 항목을 나열합니다(하위 폴더로 내려가지 않음).
/// 숨김 항목은 빼고, 폴더를 먼저, 그다음 이름순으로 정렬합니다.
pub fn list_dir(scope: &FsScope, path: &Path) -> FsResult<Vec<Entry>> {
    let dir = scope.resolve_existing(path)?;
    let read_dir = fs::read_dir(&dir).map_err(|err| FsError::from_io(&err, &dir))?;

    let mut entries = Vec::new();
    for dir_entry in read_dir {
        let dir_entry = dir_entry.map_err(|err| FsError::from_io(&err, &dir))?;
        let entry_path = dir_entry.path();
        // UTF-8이 아닌 이름은 프런트로 온전히 넘길 수 없어 건너뜁니다.
        let file_name = dir_entry.file_name();
        let (Some(name), Some(path)) = (file_name.to_str(), entry_path.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        // 링크는 따라가서 종류를 정합니다. 끊어진 링크는 건너뜁니다.
        let Ok(metadata) = fs::metadata(&entry_path) else {
            continue;
        };
        if has_hidden_attribute(&metadata) {
            continue;
        }
        let kind = if metadata.is_dir() {
            EntryKind::Folder
        } else {
            classify_file(name)
        };
        entries.push(Entry {
            name: name.to_owned(),
            path: path.to_owned(),
            kind,
        });
    }

    entries.sort_by(|a, b| {
        let a_key = (a.kind != EntryKind::Folder, a.name.to_lowercase());
        let b_key = (b.kind != EntryKind::Folder, b.name.to_lowercase());
        a_key.cmp(&b_key).then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

/// 파일을 UTF-8 텍스트로 읽습니다. BOM과 줄바꿈은 그대로 둡니다.
/// UTF-8이 아니면 열지 않습니다(잘못 읽어 저장하면 손상되므로).
pub fn read_text(scope: &FsScope, path: &Path) -> FsResult<String> {
    let file = scope.resolve_existing(path)?;
    let bytes = fs::read(&file).map_err(|err| FsError::from_io(&err, &file))?;
    String::from_utf8(bytes).map_err(|_| {
        FsError::new(
            FsErrorKind::NotUtf8,
            format!("{}: UTF-8 텍스트가 아닙니다", file.display()),
        )
    })
}

/// 받은 내용을 바이트 그대로 씁니다.
///
/// 이미 있는 파일은 같은 폴더의 임시 파일에 다 쓴 뒤 교체하므로, 도중에 실패해도
/// 원래 내용이 남습니다. 아직 없는 파일은 새로 만들어 씁니다.
pub fn write_text(scope: &FsScope, path: &Path, contents: &str) -> FsResult<()> {
    let target = scope.resolve_for_write(path)?;
    match fs::metadata(&target) {
        Ok(metadata) => replace_file(&target, &metadata, contents.as_bytes()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            write_new_file(&target, contents.as_bytes())
        }
        Err(err) => Err(FsError::from_io(&err, &target)),
    }
}

fn replace_file(target: &Path, metadata: &fs::Metadata, bytes: &[u8]) -> FsResult<()> {
    if metadata.is_dir() {
        return Err(FsError::other(target, "폴더에는 쓸 수 없습니다"));
    }
    // 교체는 폴더 권한만 있으면 되므로, 읽기 전용 파일은 여기서 직접 막습니다.
    if metadata.permissions().readonly() {
        return Err(FsError::new(
            FsErrorKind::PermissionDenied,
            format!("{}: 읽기 전용 파일입니다", target.display()),
        ));
    }
    let dir = target
        .parent()
        .ok_or_else(|| FsError::other(target, "부모 폴더가 없습니다"))?;
    let io_err = |err: std::io::Error| FsError::from_io(&err, target);

    // 실패해서 빠져나가면 임시 파일은 자동으로 지워집니다.
    let mut temp = tempfile::Builder::new()
        .prefix(".tokyonight-")
        .suffix(".tmp")
        .tempfile_in(dir)
        .map_err(io_err)?;
    temp.write_all(bytes).map_err(io_err)?;
    temp.as_file().sync_all().map_err(io_err)?;
    fs::set_permissions(temp.path(), metadata.permissions()).map_err(io_err)?;
    temp.persist(target).map_err(|err| io_err(err.error))?;
    Ok(())
}

fn write_new_file(target: &Path, bytes: &[u8]) -> FsResult<()> {
    let io_err = |err: std::io::Error| FsError::from_io(&err, target);
    // `create_new`라서 그 사이 다른 파일이 생겼다면 덮어쓰지 않고 실패합니다.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(io_err)?;
    let written = file.write_all(bytes).and_then(|()| file.sync_all());
    if let Err(err) = written {
        drop(file);
        // 반쯤 쓰인 새 파일을 남기지 않습니다.
        let _ = fs::remove_file(target);
        return Err(io_err(err));
    }
    Ok(())
}

/// 빈 파일을 만듭니다. 이미 있으면 덮어쓰지 않고 오류를 돌려줍니다.
pub fn create_file(scope: &FsScope, path: &Path) -> FsResult<String> {
    let target = scope.resolve_entry(path)?;
    // Windows는 같은 이름의 폴더가 있으면 `create_new`가 '권한 없음'으로 실패하므로,
    // 먼저 확인해서 어느 OS에서나 '이미 있음'으로 알립니다. 경쟁 상황은 `create_new`가 막습니다.
    if fs::symlink_metadata(&target).is_ok() {
        return Err(FsError::already_exists(&target));
    }
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|err| FsError::from_io(&err, &target))?;
    path_string(&target)
}

/// 폴더를 만듭니다. 이미 있으면 오류를 돌려줍니다. 부모 폴더는 있어야 합니다.
pub fn create_folder(scope: &FsScope, path: &Path) -> FsResult<String> {
    let target = scope.resolve_entry(path)?;
    fs::create_dir(&target).map_err(|err| FsError::from_io(&err, &target))?;
    path_string(&target)
}

/// 대소문자만 다른 이름이 같은 항목을 가리키는지(대소문자를 가리지 않는 파일 시스템).
fn is_case_only_rename(from: &Path, to: &Path) -> bool {
    let (Some(from_name), Some(to_name)) = (from.file_name(), to.file_name()) else {
        return false;
    };
    let same_parent = from.parent() == to.parent();
    let same_name_ignoring_case =
        from_name.to_string_lossy().to_lowercase() == to_name.to_string_lossy().to_lowercase();
    let is_link = |path: &Path| {
        fs::symlink_metadata(path)
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(true)
    };
    same_parent
        && same_name_ignoring_case
        && !is_link(from)
        && !is_link(to)
        && matches!(
            (fs::canonicalize(from), fs::canonicalize(to)),
            (Ok(a), Ok(b)) if a == b
        )
}

/// 이름을 바꾸거나 옮깁니다. 대상이 이미 있으면 덮어쓰지 않고 오류를 돌려줍니다.
///
/// 존재 확인과 이름 변경 사이에 다른 프로그램이 같은 이름을 만들면 막지 못합니다
/// (표준 라이브러리에 '없을 때만 이름 변경'이 없음).
pub fn rename_entry(scope: &FsScope, from: &Path, to: &Path) -> FsResult<String> {
    let source = scope.resolve_entry(from)?;
    let target = scope.resolve_entry(to)?;
    if fs::symlink_metadata(&source).is_err() {
        return Err(FsError::not_found(&source));
    }
    if source == target {
        return path_string(&target);
    }
    if fs::symlink_metadata(&target).is_ok() && !is_case_only_rename(&source, &target) {
        return Err(FsError::already_exists(&target));
    }
    fs::rename(&source, &target).map_err(|err| FsError::from_io(&err, &source))?;
    path_string(&target)
}

/// 파일이나 폴더를 휴지통으로 보냅니다. 영구 삭제하지 않습니다.
pub fn delete_entry(scope: &FsScope, path: &Path, trash: &dyn Trash) -> FsResult<()> {
    let target = scope.resolve_entry(path)?;
    if fs::symlink_metadata(&target).is_err() {
        return Err(FsError::not_found(&target));
    }
    trash
        .move_to_trash(&target)
        .map_err(|reason| FsError::other(&target, reason))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::path::PathBuf;

    use tempfile::TempDir;

    use super::*;

    /// 휴지통 대신 호출된 경로를 기록하고, 폴더 밖 임시 위치로 옮깁니다.
    #[derive(Default)]
    struct FakeTrash {
        deleted: RefCell<Vec<PathBuf>>,
        fail: bool,
    }

    impl Trash for FakeTrash {
        fn move_to_trash(&self, path: &Path) -> Result<(), String> {
            if self.fail {
                return Err("휴지통을 쓸 수 없음".into());
            }
            self.deleted.borrow_mut().push(path.to_path_buf());
            Ok(())
        }
    }

    /// 허용된 폴더 `open`과 허용되지 않은 폴더 `outside`를 가진 임시 폴더.
    struct Fixture {
        _dir: TempDir,
        scope: FsScope,
        open: PathBuf,
        outside: PathBuf,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().expect("tempdir");
        let base = fs::canonicalize(dir.path()).expect("canonicalize");
        let open = base.join("open");
        let outside = base.join("outside");
        fs::create_dir(&open).expect("mkdir");
        fs::create_dir(&outside).expect("mkdir");
        let scope = FsScope::default();
        scope.allow_folder(&open).expect("allow");
        Fixture {
            _dir: dir,
            scope,
            open,
            outside,
        }
    }

    fn kind<T: std::fmt::Debug>(result: FsResult<T>) -> FsErrorKind {
        result.expect_err("should fail").kind
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .expect("read_dir")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .into_string()
                    .expect("utf8")
            })
            .collect();
        names.sort();
        names
    }

    // --- 종류 ---

    #[test]
    fn classify_file_by_extension() {
        assert_eq!(classify_file("note.md"), EntryKind::Markdown);
        assert_eq!(classify_file("NOTE.MD"), EntryKind::Markdown);
        assert_eq!(classify_file("note.txt"), EntryKind::Text);
        assert_eq!(classify_file("README"), EntryKind::Text);
        assert_eq!(classify_file("photo.png"), EntryKind::Unsupported);
        assert_eq!(classify_file("archive.tar.gz"), EntryKind::Unsupported);
        assert_eq!(classify_file("note.md.bak"), EntryKind::Unsupported);
    }

    // --- 나열 ---

    #[test]
    fn list_dir_marks_kinds_sorts_and_skips_hidden() {
        let fx = fixture();
        fs::create_dir(fx.open.join("sub")).expect("mkdir");
        fs::create_dir(fx.open.join(".git")).expect("mkdir");
        fs::write(fx.open.join("b.txt"), "").expect("write");
        fs::write(fx.open.join("a.md"), "").expect("write");
        fs::write(fx.open.join("LICENSE"), "").expect("write");
        fs::write(fx.open.join("image.png"), "").expect("write");
        fs::write(fx.open.join(".hidden.md"), "").expect("write");
        fs::write(fx.open.join("sub/nested.md"), "").expect("write");

        let entries = list_dir(&fx.scope, &fx.open).expect("list");

        let summary: Vec<(&str, EntryKind)> = entries
            .iter()
            .map(|entry| (entry.name.as_str(), entry.kind))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("sub", EntryKind::Folder),
                ("a.md", EntryKind::Markdown),
                ("b.txt", EntryKind::Text),
                ("image.png", EntryKind::Unsupported),
                ("LICENSE", EntryKind::Text),
            ]
        );
        assert_eq!(
            entries[1].path,
            fx.open.join("a.md").to_str().expect("utf8")
        );
    }

    #[test]
    fn list_dir_rejects_out_of_scope_and_missing() {
        let fx = fixture();
        assert_eq!(
            kind(list_dir(&fx.scope, &fx.outside)),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(list_dir(&fx.scope, &fx.open.join("missing"))),
            FsErrorKind::NotFound
        );
    }

    // --- 읽기 ---

    #[test]
    fn read_text_returns_contents() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "# 제목\n본문\n").expect("write");
        assert_eq!(
            read_text(&fx.scope, &fx.open.join("a.md")),
            Ok("# 제목\n본문\n".to_owned())
        );
    }

    #[test]
    fn read_text_rejects_non_utf8() {
        let fx = fixture();
        // EUC-KR로 저장한 "한글"
        fs::write(fx.open.join("euckr.txt"), [0xC7, 0xD1, 0xB1, 0xDB]).expect("write");
        // UTF-16 LE BOM + "a"
        fs::write(fx.open.join("utf16.txt"), [0xFF, 0xFE, 0x61, 0x00]).expect("write");

        assert_eq!(
            kind(read_text(&fx.scope, &fx.open.join("euckr.txt"))),
            FsErrorKind::NotUtf8
        );
        assert_eq!(
            kind(read_text(&fx.scope, &fx.open.join("utf16.txt"))),
            FsErrorKind::NotUtf8
        );
    }

    #[test]
    fn read_text_rejects_out_of_scope_and_missing() {
        let fx = fixture();
        fs::write(fx.outside.join("secret.md"), "s").expect("write");
        assert_eq!(
            kind(read_text(&fx.scope, &fx.outside.join("secret.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(read_text(&fx.scope, &fx.open.join("../outside/secret.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(read_text(&fx.scope, &fx.open.join("missing.md"))),
            FsErrorKind::NotFound
        );
    }

    // --- 쓰기 ---

    #[test]
    fn crlf_and_bom_survive_read_then_write() {
        let fx = fixture();
        let cases: [(&str, &[u8]); 4] = [
            ("bom-crlf.md", b"\xEF\xBB\xBF# title\r\n\r\nbody\r\n"),
            ("crlf.txt", b"one\r\ntwo\r\n"),
            ("mixed.txt", b"one\r\ntwo\nthree\rfour"),
            (
                "bom-lf-no-final-newline.md",
                b"\xEF\xBB\xBFline\n\xED\x95\x9C",
            ),
        ];
        for (name, original) in cases {
            let path = fx.open.join(name);
            fs::write(&path, original).expect("write");

            let text = read_text(&fx.scope, &path).expect("read");
            write_text(&fx.scope, &path, &text).expect("write back");

            assert_eq!(fs::read(&path).expect("read bytes"), original, "{name}");
        }
    }

    #[test]
    fn write_text_replaces_contents_without_leaving_temp_files() {
        let fx = fixture();
        let path = fx.open.join("a.md");
        fs::write(&path, "old contents that are longer").expect("write");

        write_text(&fx.scope, &path, "new").expect("write");

        assert_eq!(fs::read(&path).expect("read"), b"new");
        assert_eq!(names(&fx.open), vec!["a.md"]);
    }

    #[test]
    fn write_text_creates_a_missing_file() {
        let fx = fixture();
        let path = fx.open.join("new.md");

        write_text(&fx.scope, &path, "hello\r\n").expect("write");

        assert_eq!(fs::read(&path).expect("read"), b"hello\r\n");
    }

    #[test]
    fn write_text_rejects_out_of_scope_and_leaves_file_untouched() {
        let fx = fixture();
        let secret = fx.outside.join("secret.md");
        fs::write(&secret, "original").expect("write");

        assert_eq!(
            kind(write_text(&fx.scope, &secret, "changed")),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(write_text(&fx.scope, &fx.outside.join("new.md"), "x")),
            FsErrorKind::OutOfScope
        );
        assert_eq!(fs::read(&secret).expect("read"), b"original");
        assert_eq!(names(&fx.outside), vec!["secret.md"]);
    }

    #[test]
    fn write_text_refuses_read_only_file() {
        let fx = fixture();
        let path = fx.open.join("locked.md");
        fs::write(&path, "original").expect("write");
        let mut permissions = fs::metadata(&path).expect("metadata").permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).expect("chmod");

        assert_eq!(
            kind(write_text(&fx.scope, &path, "changed")),
            FsErrorKind::PermissionDenied
        );
        assert_eq!(fs::read(&path).expect("read"), b"original");
        assert_eq!(names(&fx.open), vec!["locked.md"]);
    }

    #[test]
    fn write_text_refuses_a_folder() {
        let fx = fixture();
        fs::create_dir(fx.open.join("sub")).expect("mkdir");
        assert_eq!(
            kind(write_text(&fx.scope, &fx.open.join("sub"), "x")),
            FsErrorKind::Other
        );
    }

    #[cfg(unix)]
    #[test]
    fn write_text_keeps_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let fx = fixture();
        let path = fx.open.join("a.md");
        fs::write(&path, "old").expect("write");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).expect("chmod");

        write_text(&fx.scope, &path, "new").expect("write");

        let mode = fs::metadata(&path).expect("metadata").permissions().mode();
        assert_eq!(mode & 0o777, 0o640);
    }

    #[cfg(unix)]
    #[test]
    fn write_text_through_symlink_keeps_the_link() {
        let fx = fixture();
        let real = fx.open.join("real.md");
        let link = fx.open.join("link.md");
        fs::write(&real, "old").expect("write");
        std::os::unix::fs::symlink(&real, &link).expect("symlink");

        write_text(&fx.scope, &link, "new").expect("write");

        assert_eq!(fs::read(&real).expect("read"), b"new");
        assert!(
            fs::symlink_metadata(&link)
                .expect("metadata")
                .file_type()
                .is_symlink()
        );
    }

    #[test]
    fn single_allowed_file_can_be_read_and_written_but_not_its_siblings() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("picked.md");
        let sibling = dir.path().join("sibling.md");
        fs::write(&file, "picked").expect("write");
        fs::write(&sibling, "sibling").expect("write");
        let scope = FsScope::default();
        scope.allow_file(&file).expect("allow");

        assert_eq!(read_text(&scope, &file), Ok("picked".to_owned()));
        write_text(&scope, &file, "changed").expect("write");
        assert_eq!(fs::read(&file).expect("read"), b"changed");

        assert_eq!(kind(read_text(&scope, &sibling)), FsErrorKind::OutOfScope);
        assert_eq!(
            kind(write_text(&scope, &sibling, "x")),
            FsErrorKind::OutOfScope
        );
        assert_eq!(kind(list_dir(&scope, dir.path())), FsErrorKind::OutOfScope);
        assert_eq!(fs::read(&sibling).expect("read"), b"sibling");
    }

    // --- 만들기 ---

    #[test]
    fn create_file_makes_an_empty_file() {
        let fx = fixture();
        let path = fx.open.join("new.md");

        let created = create_file(&fx.scope, &path).expect("create");

        assert_eq!(created, path.to_str().expect("utf8"));
        assert_eq!(fs::read(&path).expect("read"), b"");
    }

    #[test]
    fn create_file_refuses_to_overwrite() {
        let fx = fixture();
        let path = fx.open.join("a.md");
        fs::write(&path, "keep me").expect("write");
        fs::create_dir(fx.open.join("sub")).expect("mkdir");

        assert_eq!(
            kind(create_file(&fx.scope, &path)),
            FsErrorKind::AlreadyExists
        );
        assert_eq!(
            kind(create_file(&fx.scope, &fx.open.join("sub"))),
            FsErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(&path).expect("read"), b"keep me");
    }

    #[test]
    fn create_file_rejects_out_of_scope_and_missing_parent() {
        let fx = fixture();
        assert_eq!(
            kind(create_file(&fx.scope, &fx.outside.join("new.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(create_file(&fx.scope, &fx.open.join("missing/new.md"))),
            FsErrorKind::NotFound
        );
        assert!(names(&fx.outside).is_empty());
    }

    #[test]
    fn create_folder_makes_a_folder_and_refuses_existing() {
        let fx = fixture();
        let path = fx.open.join("sub");

        let created = create_folder(&fx.scope, &path).expect("create");
        assert_eq!(created, path.to_str().expect("utf8"));
        assert!(path.is_dir());

        fs::write(path.join("a.md"), "keep me").expect("write");
        assert_eq!(
            kind(create_folder(&fx.scope, &path)),
            FsErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(path.join("a.md")).expect("read"), b"keep me");
    }

    #[test]
    fn create_folder_rejects_out_of_scope() {
        let fx = fixture();
        assert_eq!(
            kind(create_folder(&fx.scope, &fx.outside.join("sub"))),
            FsErrorKind::OutOfScope
        );
        assert!(names(&fx.outside).is_empty());
    }

    // --- 이름 변경 ---

    #[test]
    fn rename_entry_renames_a_file() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");

        let renamed =
            rename_entry(&fx.scope, &fx.open.join("a.md"), &fx.open.join("b.md")).expect("rename");

        assert_eq!(renamed, fx.open.join("b.md").to_str().expect("utf8"));
        assert_eq!(names(&fx.open), vec!["b.md"]);
        assert_eq!(fs::read(fx.open.join("b.md")).expect("read"), b"a");
    }

    #[test]
    fn rename_entry_moves_files_and_folders_between_folders() {
        let fx = fixture();
        fs::create_dir(fx.open.join("from")).expect("mkdir");
        fs::create_dir(fx.open.join("to")).expect("mkdir");
        fs::write(fx.open.join("from/a.md"), "a").expect("write");

        rename_entry(
            &fx.scope,
            &fx.open.join("from/a.md"),
            &fx.open.join("to/a.md"),
        )
        .expect("move file");
        assert_eq!(fs::read(fx.open.join("to/a.md")).expect("read"), b"a");

        rename_entry(&fx.scope, &fx.open.join("to"), &fx.open.join("from/to"))
            .expect("move folder");
        assert_eq!(fs::read(fx.open.join("from/to/a.md")).expect("read"), b"a");
    }

    #[test]
    fn rename_entry_refuses_to_overwrite() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");
        fs::write(fx.open.join("b.md"), "b").expect("write");
        fs::create_dir(fx.open.join("sub")).expect("mkdir");

        assert_eq!(
            kind(rename_entry(
                &fx.scope,
                &fx.open.join("a.md"),
                &fx.open.join("b.md")
            )),
            FsErrorKind::AlreadyExists
        );
        assert_eq!(
            kind(rename_entry(
                &fx.scope,
                &fx.open.join("a.md"),
                &fx.open.join("sub")
            )),
            FsErrorKind::AlreadyExists
        );
        assert_eq!(fs::read(fx.open.join("a.md")).expect("read"), b"a");
        assert_eq!(fs::read(fx.open.join("b.md")).expect("read"), b"b");
    }

    #[test]
    fn rename_entry_rejects_out_of_scope_on_either_side() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");
        fs::write(fx.outside.join("secret.md"), "s").expect("write");

        assert_eq!(
            kind(rename_entry(
                &fx.scope,
                &fx.open.join("a.md"),
                &fx.outside.join("a.md")
            )),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(rename_entry(
                &fx.scope,
                &fx.outside.join("secret.md"),
                &fx.open.join("secret.md")
            )),
            FsErrorKind::OutOfScope
        );
        // 열린 폴더 자체는 바꿀 수 없습니다.
        assert_eq!(
            kind(rename_entry(&fx.scope, &fx.open, &fx.open.join("moved"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(names(&fx.open), vec!["a.md"]);
        assert_eq!(names(&fx.outside), vec!["secret.md"]);
    }

    #[test]
    fn rename_entry_reports_missing_source_and_allows_same_path() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");

        assert_eq!(
            kind(rename_entry(
                &fx.scope,
                &fx.open.join("missing.md"),
                &fx.open.join("b.md")
            )),
            FsErrorKind::NotFound
        );
        rename_entry(&fx.scope, &fx.open.join("a.md"), &fx.open.join("a.md")).expect("no-op");
        assert_eq!(fs::read(fx.open.join("a.md")).expect("read"), b"a");
    }

    #[test]
    fn rename_entry_allows_case_only_change() {
        let fx = fixture();
        fs::write(fx.open.join("note.md"), "a").expect("write");

        rename_entry(
            &fx.scope,
            &fx.open.join("note.md"),
            &fx.open.join("Note.md"),
        )
        .expect("rename");

        assert_eq!(names(&fx.open), vec!["Note.md"]);
        assert_eq!(fs::read(fx.open.join("Note.md")).expect("read"), b"a");
    }

    // --- 삭제 ---

    #[test]
    fn delete_entry_sends_files_and_folders_to_trash() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");
        fs::create_dir(fx.open.join("sub")).expect("mkdir");
        let trash = FakeTrash::default();

        delete_entry(&fx.scope, &fx.open.join("a.md"), &trash).expect("delete file");
        delete_entry(&fx.scope, &fx.open.join("sub"), &trash).expect("delete folder");

        assert_eq!(
            *trash.deleted.borrow(),
            vec![fx.open.join("a.md"), fx.open.join("sub")]
        );
    }

    #[test]
    fn delete_entry_rejects_out_of_scope_without_touching_trash() {
        let fx = fixture();
        fs::write(fx.outside.join("secret.md"), "s").expect("write");
        let trash = FakeTrash::default();

        assert_eq!(
            kind(delete_entry(
                &fx.scope,
                &fx.outside.join("secret.md"),
                &trash
            )),
            FsErrorKind::OutOfScope
        );
        // 열린 폴더 자체는 지울 수 없습니다.
        assert_eq!(
            kind(delete_entry(&fx.scope, &fx.open, &trash)),
            FsErrorKind::OutOfScope
        );
        assert!(trash.deleted.borrow().is_empty());
    }

    #[test]
    fn delete_entry_reports_missing_and_trash_failure() {
        let fx = fixture();
        fs::write(fx.open.join("a.md"), "a").expect("write");

        let trash = FakeTrash::default();
        assert_eq!(
            kind(delete_entry(&fx.scope, &fx.open.join("missing.md"), &trash)),
            FsErrorKind::NotFound
        );
        assert!(trash.deleted.borrow().is_empty());

        let failing = FakeTrash {
            fail: true,
            ..FakeTrash::default()
        };
        assert_eq!(
            kind(delete_entry(&fx.scope, &fx.open.join("a.md"), &failing)),
            FsErrorKind::Other
        );
        assert!(fx.open.join("a.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn delete_entry_targets_the_link_not_what_it_points_to() {
        let fx = fixture();
        fs::write(fx.outside.join("secret.md"), "s").expect("write");
        std::os::unix::fs::symlink(fx.outside.join("secret.md"), fx.open.join("link.md"))
            .expect("symlink");
        let trash = FakeTrash::default();

        delete_entry(&fx.scope, &fx.open.join("link.md"), &trash).expect("delete");

        assert_eq!(*trash.deleted.borrow(), vec![fx.open.join("link.md")]);
    }
}
