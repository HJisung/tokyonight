//! 접근 허용 목록. 사용자가 대화상자로 고른 폴더와 파일만 들어갑니다.
//!
//! 모든 경로는 심볼릭 링크와 `..`을 푼 실제 경로로 바꾼 뒤 비교합니다.
//! 허용된 폴더 안의 링크가 폴더 밖을 가리키면 범위 밖으로 봅니다.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use super::error::{FsError, FsResult};

#[derive(Default)]
struct Allowed {
    folders: Vec<PathBuf>,
    files: Vec<PathBuf>,
}

impl Allowed {
    /// 허용된 폴더 자신이거나 그 안, 또는 허용된 파일.
    fn contains(&self, path: &Path) -> bool {
        self.files.iter().any(|file| file == path)
            || self.folders.iter().any(|folder| path.starts_with(folder))
    }

    /// 허용된 폴더의 안쪽(폴더 자신은 제외), 또는 허용된 파일.
    fn contains_entry(&self, path: &Path) -> bool {
        self.files.iter().any(|file| file == path)
            || self
                .folders
                .iter()
                .any(|folder| path != folder && path.starts_with(folder))
    }
}

/// 앱 실행 중에만 유지되는 허용 목록(Tauri 상태로 등록).
#[derive(Default)]
pub struct FsScope {
    allowed: Mutex<Allowed>,
}

impl FsScope {
    fn lock(&self) -> MutexGuard<'_, Allowed> {
        self.allowed
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// 사용자가 고른 폴더를 허용합니다. 실제 경로를 돌려줍니다.
    pub fn allow_folder(&self, path: &Path) -> FsResult<PathBuf> {
        let folder = canonicalize(path)?;
        if !folder.is_dir() {
            return Err(FsError::other(path, "폴더가 아닙니다"));
        }
        let mut allowed = self.lock();
        if !allowed.folders.contains(&folder) {
            allowed.folders.push(folder.clone());
        }
        Ok(folder)
    }

    /// 사용자가 고른 파일을 허용합니다. 저장 대화상자로 고른, 아직 없는 파일도 됩니다.
    pub fn allow_file(&self, path: &Path) -> FsResult<PathBuf> {
        let file = if fs::symlink_metadata(path).is_ok() {
            canonicalize(path)?
        } else {
            entry_path(path)?
        };
        if file.is_dir() {
            return Err(FsError::other(path, "파일이 아닙니다"));
        }
        let mut allowed = self.lock();
        if !allowed.files.contains(&file) {
            allowed.files.push(file.clone());
        }
        Ok(file)
    }

    /// 이미 있는 경로를 링크까지 따라가 확인합니다(나열, 읽기, 덮어쓰기).
    pub fn resolve_existing(&self, path: &Path) -> FsResult<PathBuf> {
        let resolved = canonicalize(path)?;
        if self.lock().contains(&resolved) {
            Ok(resolved)
        } else {
            Err(FsError::out_of_scope(path))
        }
    }

    /// 항목 자체를 확인합니다(만들기, 이름 변경, 삭제). 마지막 요소는 없어도 되고,
    /// 링크면 링크 자체를 가리킵니다. 허용된 폴더 자신은 대상이 될 수 없습니다.
    pub fn resolve_entry(&self, path: &Path) -> FsResult<PathBuf> {
        let resolved = entry_path(path)?;
        if self.lock().contains_entry(&resolved) {
            Ok(resolved)
        } else {
            Err(FsError::out_of_scope(path))
        }
    }

    /// 쓰기 대상: 이미 있으면 링크를 따라간 실제 파일, 없으면 새 항목.
    pub fn resolve_for_write(&self, path: &Path) -> FsResult<PathBuf> {
        if fs::symlink_metadata(path).is_ok() {
            self.resolve_existing(path)
        } else {
            self.resolve_entry(path)
        }
    }
}

fn require_absolute(path: &Path) -> FsResult<()> {
    if path.is_absolute() {
        Ok(())
    } else {
        Err(FsError::out_of_scope(path))
    }
}

fn canonicalize(path: &Path) -> FsResult<PathBuf> {
    require_absolute(path)?;
    fs::canonicalize(path).map_err(|err| FsError::from_io(&err, path))
}

/// 부모 폴더의 실제 경로에 마지막 이름을 붙입니다. 마지막 요소의 링크는 풀지 않습니다.
fn entry_path(path: &Path) -> FsResult<PathBuf> {
    require_absolute(path)?;
    // `..`으로 끝나면 `file_name`이 없습니다.
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(FsError::out_of_scope(path));
    };
    let parent = fs::canonicalize(parent).map_err(|err| FsError::from_io(&err, path))?;
    Ok(parent.join(name))
}

#[cfg(test)]
mod tests {
    use super::super::error::FsErrorKind;
    use super::*;

    fn kind<T: std::fmt::Debug>(result: FsResult<T>) -> FsErrorKind {
        result.expect_err("should fail").kind
    }

    #[test]
    fn nothing_is_allowed_by_default() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("a.md");
        fs::write(&file, "a").expect("write");
        let scope = FsScope::default();

        assert_eq!(kind(scope.resolve_existing(&file)), FsErrorKind::OutOfScope);
        assert_eq!(kind(scope.resolve_entry(&file)), FsErrorKind::OutOfScope);
    }

    #[test]
    fn allowed_folder_covers_nested_paths_only() {
        let dir = tempfile::tempdir().expect("tempdir");
        let inside = dir.path().join("open");
        let outside = dir.path().join("other");
        fs::create_dir_all(inside.join("sub")).expect("mkdir");
        fs::create_dir(&outside).expect("mkdir");
        fs::write(inside.join("sub/a.md"), "a").expect("write");
        fs::write(outside.join("b.md"), "b").expect("write");
        let scope = FsScope::default();
        let root = scope.allow_folder(&inside).expect("allow");

        assert_eq!(
            scope.resolve_existing(&inside.join("sub/a.md")),
            Ok(root.join("sub/a.md"))
        );
        assert_eq!(
            scope.resolve_entry(&inside.join("new.md")),
            Ok(root.join("new.md"))
        );
        assert_eq!(
            kind(scope.resolve_existing(&outside.join("b.md"))),
            FsErrorKind::OutOfScope
        );
        // 이름이 같은 접두사로 시작해도 다른 폴더입니다.
        let sibling = dir.path().join("open-2");
        fs::create_dir(&sibling).expect("mkdir");
        assert_eq!(
            kind(scope.resolve_entry(&sibling.join("c.md"))),
            FsErrorKind::OutOfScope
        );
    }

    #[test]
    fn parent_traversal_out_of_folder_is_rejected() {
        let dir = tempfile::tempdir().expect("tempdir");
        let inside = dir.path().join("open");
        fs::create_dir(&inside).expect("mkdir");
        fs::write(dir.path().join("secret.md"), "s").expect("write");
        let scope = FsScope::default();
        scope.allow_folder(&inside).expect("allow");

        assert_eq!(
            kind(scope.resolve_existing(&inside.join("../secret.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_entry(&inside.join("../new.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_entry(&inside.join(".."))),
            FsErrorKind::OutOfScope
        );
    }

    #[test]
    fn relative_paths_are_rejected() {
        let scope = FsScope::default();
        assert_eq!(
            kind(scope.resolve_existing(Path::new("a.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_entry(Path::new("a.md"))),
            FsErrorKind::OutOfScope
        );
    }

    #[test]
    fn allowed_folder_itself_is_not_an_entry() {
        let dir = tempfile::tempdir().expect("tempdir");
        let scope = FsScope::default();
        let root = scope.allow_folder(dir.path()).expect("allow");

        assert_eq!(scope.resolve_existing(dir.path()), Ok(root));
        assert_eq!(
            kind(scope.resolve_entry(dir.path())),
            FsErrorKind::OutOfScope
        );
    }

    #[test]
    fn allowed_file_does_not_allow_siblings() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("a.md");
        let sibling = dir.path().join("b.md");
        fs::write(&file, "a").expect("write");
        fs::write(&sibling, "b").expect("write");
        let scope = FsScope::default();
        let allowed = scope.allow_file(&file).expect("allow");

        assert_eq!(scope.resolve_existing(&file), Ok(allowed.clone()));
        assert_eq!(scope.resolve_entry(&file), Ok(allowed));
        assert_eq!(
            kind(scope.resolve_existing(&sibling)),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_existing(dir.path())),
            FsErrorKind::OutOfScope
        );
    }

    #[test]
    fn allow_file_accepts_a_path_that_does_not_exist_yet() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("new.md");
        let scope = FsScope::default();
        let allowed = scope.allow_file(&file).expect("allow");

        assert_eq!(scope.resolve_for_write(&file), Ok(allowed));
    }

    #[test]
    fn allow_folder_rejects_files_and_missing_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("a.md");
        fs::write(&file, "a").expect("write");
        let scope = FsScope::default();

        assert_eq!(kind(scope.allow_folder(&file)), FsErrorKind::Other);
        assert_eq!(
            kind(scope.allow_folder(&dir.path().join("missing"))),
            FsErrorKind::NotFound
        );
        assert_eq!(kind(scope.allow_file(dir.path())), FsErrorKind::Other);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_pointing_outside_is_rejected() {
        let dir = tempfile::tempdir().expect("tempdir");
        let inside = dir.path().join("open");
        let outside = dir.path().join("other");
        fs::create_dir(&inside).expect("mkdir");
        fs::create_dir(&outside).expect("mkdir");
        fs::write(outside.join("secret.md"), "s").expect("write");
        std::os::unix::fs::symlink(outside.join("secret.md"), inside.join("link.md"))
            .expect("symlink");
        std::os::unix::fs::symlink(&outside, inside.join("linked-dir")).expect("symlink");
        let scope = FsScope::default();
        let root = scope.allow_folder(&inside).expect("allow");

        assert_eq!(
            kind(scope.resolve_existing(&inside.join("link.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_for_write(&inside.join("link.md"))),
            FsErrorKind::OutOfScope
        );
        assert_eq!(
            kind(scope.resolve_entry(&inside.join("linked-dir/new.md"))),
            FsErrorKind::OutOfScope
        );
        // 링크 자체(이름 변경·삭제 대상)는 폴더 안의 항목입니다.
        assert_eq!(
            scope.resolve_entry(&inside.join("link.md")),
            Ok(root.join("link.md"))
        );
    }
}
