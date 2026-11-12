// Windows 릴리스 빌드에서 콘솔 창이 함께 뜨지 않게 합니다. 지우지 마세요.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tokyonight_lib::run()
}
