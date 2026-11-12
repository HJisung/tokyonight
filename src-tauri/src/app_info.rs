//! 앱 이름·버전 조회. 프런트엔드의 `src/ipc/appInfo.ts`와 짝을 이룹니다.

use serde::Serialize;
use tauri::{AppHandle, PackageInfo};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

impl AppInfo {
    fn from_package_info(package_info: &PackageInfo) -> Self {
        Self {
            name: package_info.name.clone(),
            version: package_info.version.to_string(),
        }
    }
}

/// 명령은 얇게 두고, 변환 로직은 `AppInfo::from_package_info`에 둡니다.
#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    AppInfo::from_package_info(app.package_info())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_package_info_copies_name_and_version() {
        let package_info = PackageInfo {
            name: "tokyonight".into(),
            version: "1.2.3".parse().expect("valid semver"),
            authors: "",
            description: "",
            crate_name: "tokyonight",
        };

        assert_eq!(
            AppInfo::from_package_info(&package_info),
            AppInfo {
                name: "tokyonight".into(),
                version: "1.2.3".into(),
            }
        );
    }
}
