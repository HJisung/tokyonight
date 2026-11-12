//! 파일 시스템 백엔드. 사용자 파일을 손상시키지 않는 것이 최우선입니다.
//!
//! - `scope`: 접근 허용 목록(대화상자로 고른 폴더·파일만)
//! - `ops`: 나열·읽기·쓰기·만들기·이름 변경·삭제 로직
//! - `commands`: Tauri 명령(얇게)
//! - `error`: 프런트로 넘기는 오류 종류

pub mod commands;
mod error;
mod ops;
mod scope;

pub use scope::FsScope;
