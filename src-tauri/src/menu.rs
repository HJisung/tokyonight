use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Wry};

fn item(
    app: &AppHandle,
    id: &str,
    text: &str,
    accel: Option<&str>,
) -> tauri::Result<MenuItem<Wry>> {
    let builder = MenuItemBuilder::with_id(format!("cmd:{id}"), text);
    match accel {
        Some(a) => builder.accelerator(a).build(app),
        None => builder.build(app),
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let file = SubmenuBuilder::new(app, "파일")
        .item(&item(
            app,
            "new-scratch",
            "새 임시 메모",
            Some("CmdOrCtrl+N"),
        )?)
        .item(&item(
            app,
            "new-file",
            "새 파일…",
            Some("CmdOrCtrl+Shift+N"),
        )?)
        .separator()
        .item(&item(
            app,
            "open-folder",
            "폴더 열기…",
            Some("CmdOrCtrl+O"),
        )?)
        .item(&item(
            app,
            "open-file",
            "파일 열기…",
            Some("CmdOrCtrl+Shift+O"),
        )?)
        .separator()
        .item(&item(app, "save", "저장", Some("CmdOrCtrl+S"))?)
        .separator()
        .item(&item(
            app,
            "close-pane",
            "분할 영역 닫기",
            Some("CmdOrCtrl+W"),
        )?)
        .item(&item(app, "close-folder", "시작 화면으로", None)?)
        .build()?;

    // 실행 취소/다시 실행은 편집기의 기록을 쓰도록 화면 쪽으로 넘긴다.
    let edit = SubmenuBuilder::new(app, "편집")
        .item(&item(app, "undo", "실행 취소", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "다시 실행", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&item(app, "insert-table", "표 삽입", None)?)
        .item(&item(
            app,
            "search",
            "폴더에서 검색",
            Some("CmdOrCtrl+Shift+F"),
        )?)
        .build()?;

    let view = SubmenuBuilder::new(app, "보기")
        .item(&item(
            app,
            "toggle-mode",
            "서식 보기 / 원문 전환",
            Some("CmdOrCtrl+E"),
        )?)
        .separator()
        .item(&item(
            app,
            "split-right",
            "오른쪽으로 분할",
            Some("CmdOrCtrl+\\"),
        )?)
        .item(&item(
            app,
            "split-down",
            "아래로 분할",
            Some("CmdOrCtrl+Shift+\\"),
        )?)
        .separator()
        .item(&item(
            app,
            "new-workspace",
            "새 워크스페이스",
            Some("CmdOrCtrl+T"),
        )?)
        .separator()
        .fullscreen()
        .build()?;

    let window = SubmenuBuilder::new(app, "윈도우").minimize().build()?;

    let mut menu = MenuBuilder::new(app);
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "TokyoNight")
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu = menu.item(&app_menu);
    }
    menu.item(&file)
        .item(&edit)
        .item(&view)
        .item(&window)
        .build()
}
