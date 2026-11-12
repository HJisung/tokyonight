# T-001 개발 도구 설치·확인

- 마일스톤: M0 하네스·개발 환경
- 상태: done
- 검수: 해당 없음(규칙 도입 전 완료)
- 의존: 없음
- 담당: 사용자+오케스트레이터

## 목표

macOS 개발 머신에서 Tauri 2 앱을 빌드할 수 있는 상태를 만든다.

## 범위

- Rust(rustup, stable)와 Xcode Command Line Tools 설치 확인. 현재 `cargo`·`rustc`가 없다.
- Node·pnpm 버전을 고정한다(`.nvmrc` 또는 `package.json#engines`, `packageManager`).
- 필요한 도구와 버전을 `docs/harness.md`의 '개발 환경' 절에 기록한다.

## 범위 밖

- Windows 머신 준비(T-061).

## 완료 기준

- `cargo --version`, `rustc --version`, `node --version`, `pnpm --version`이 모두 성공한다.
- 설치는 사용자가 직접 실행하거나 명시적으로 승인한 뒤에만 진행했다.

## 작업 기록

- 2026-11-12: 사용자 승인 후 rustup으로 stable 설치. `cargo 1.99.1`, `rustc 1.99.1` 확인. Xcode CLT 있음.
- 남은 것: Node·pnpm 버전 고정은 `package.json`이 생기는 T-003에서 처리.
