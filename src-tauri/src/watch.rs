//! 열린 폴더(하위 포함)와 폴더 밖에서 연 파일의 변경을 감지해 화면에 알린다.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

pub struct WatchState {
    tx: Sender<PathBuf>,
    folder: Mutex<Option<RecommendedWatcher>>,
    files: Mutex<Option<RecommendedWatcher>>,
}

fn is_noise(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s == ".git" || s == "node_modules"
    }) || path
        .file_name()
        .map(|n| n.to_string_lossy().ends_with(".tmp"))
        .unwrap_or(false)
}

impl WatchState {
    /// 짧은 시간에 몰려오는 이벤트를 모아 한 번에 보내는 스레드를 띄운다.
    pub fn start(app: AppHandle) -> Self {
        let (tx, rx) = channel::<PathBuf>();
        std::thread::spawn(move || loop {
            let Ok(first) = rx.recv() else { return };
            let mut batch = BTreeSet::from([first]);
            let started = Instant::now();
            while started.elapsed() < Duration::from_millis(1000) {
                match rx.recv_timeout(Duration::from_millis(150)) {
                    Ok(path) => {
                        batch.insert(path);
                    }
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            let paths: Vec<String> = batch
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            let _ = app.emit("fs-changed", paths);
        });
        WatchState {
            tx,
            folder: Mutex::new(None),
            files: Mutex::new(None),
        }
    }

    fn watcher(&self) -> Result<RecommendedWatcher, String> {
        let tx = self.tx.clone();
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                if event.kind.is_access() {
                    return;
                }
                for path in event.paths {
                    if !is_noise(&path) {
                        let _ = tx.send(path);
                    }
                }
            }
        })
        .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn watch_folder(state: State<WatchState>, path: Option<String>) -> Result<(), String> {
    let mut slot = state.folder.lock().map_err(|e| e.to_string())?;
    *slot = None;
    if let Some(path) = path {
        let mut watcher = state.watcher()?;
        watcher
            .watch(Path::new(&path), RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        *slot = Some(watcher);
    }
    Ok(())
}

/// 폴더 밖 파일은 원자적 교체(이름 바꾸기)도 잡을 수 있게 부모 폴더를 감시한다.
#[tauri::command]
pub fn watch_files(state: State<WatchState>, paths: Vec<String>) -> Result<(), String> {
    let mut slot = state.files.lock().map_err(|e| e.to_string())?;
    *slot = None;
    let dirs: BTreeSet<PathBuf> = paths
        .iter()
        .filter_map(|p| Path::new(p).parent().map(Path::to_path_buf))
        .collect();
    if dirs.is_empty() {
        return Ok(());
    }
    let mut watcher = state.watcher()?;
    for dir in dirs {
        // 사라진 폴더는 건너뛴다.
        let _ = watcher.watch(&dir, RecursiveMode::NonRecursive);
    }
    *slot = Some(watcher);
    Ok(())
}
