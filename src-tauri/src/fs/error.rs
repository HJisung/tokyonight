//! 파일 작업 오류. 프런트엔드의 `src/ipc/fs.ts`(`FsError`)와 같은 모양입니다.

use std::io;
use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FsErrorKind {
    /// 경로가 없음.
    NotFound,
    /// 만들기·이름 변경의 대상이 이미 있음.
    AlreadyExists,
    /// OS가 접근을 거부했거나 읽기 전용임.
    PermissionDenied,
    /// 사용자가 대화상자로 고르지 않은 경로.
    OutOfScope,
    /// UTF-8로 읽을 수 없는 파일.
    NotUtf8,
    /// 그 밖의 오류.
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FsError {
    pub kind: FsErrorKind,
    pub message: String,
}

pub type FsResult<T> = Result<T, FsError>;

impl FsError {
    pub fn new(kind: FsErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn out_of_scope(path: &Path) -> Self {
        Self::new(
            FsErrorKind::OutOfScope,
            format!("{}: 허용된 폴더나 파일 밖의 경로입니다", path.display()),
        )
    }

    pub fn not_found(path: &Path) -> Self {
        Self::new(
            FsErrorKind::NotFound,
            format!("{}: 경로가 없습니다", path.display()),
        )
    }

    pub fn already_exists(path: &Path) -> Self {
        Self::new(
            FsErrorKind::AlreadyExists,
            format!("{}: 이미 있습니다", path.display()),
        )
    }

    pub fn other(path: &Path, reason: impl std::fmt::Display) -> Self {
        Self::new(FsErrorKind::Other, format!("{}: {reason}", path.display()))
    }

    /// OS 오류를 오류 종류로 옮깁니다.
    pub fn from_io(err: &io::Error, path: &Path) -> Self {
        let kind = match err.kind() {
            io::ErrorKind::NotFound => FsErrorKind::NotFound,
            io::ErrorKind::AlreadyExists => FsErrorKind::AlreadyExists,
            io::ErrorKind::PermissionDenied => FsErrorKind::PermissionDenied,
            _ => FsErrorKind::Other,
        };
        Self::new(kind, format!("{}: {err}", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_io_maps_known_kinds() {
        let path = Path::new("/tmp/a.md");
        let cases = [
            (io::ErrorKind::NotFound, FsErrorKind::NotFound),
            (io::ErrorKind::AlreadyExists, FsErrorKind::AlreadyExists),
            (
                io::ErrorKind::PermissionDenied,
                FsErrorKind::PermissionDenied,
            ),
            (io::ErrorKind::InvalidData, FsErrorKind::Other),
        ];
        for (io_kind, expected) in cases {
            let err = FsError::from_io(&io::Error::from(io_kind), path);
            assert_eq!(err.kind, expected);
            assert!(err.message.contains("/tmp/a.md"));
        }
    }

    #[test]
    fn serializes_kind_in_camel_case() {
        let err = FsError::new(FsErrorKind::OutOfScope, "밖");
        assert_eq!(
            serde_json::to_value(&err).expect("serializable"),
            serde_json::json!({ "kind": "outOfScope", "message": "밖" })
        );
        let err = FsError::new(FsErrorKind::NotUtf8, "x");
        assert_eq!(
            serde_json::to_value(&err).expect("serializable")["kind"],
            "notUtf8"
        );
    }
}
