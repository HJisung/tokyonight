use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_ENTRIES: usize = 30_000;
const MAX_FILE_HITS: usize = 50;
const MAX_MATCHES: usize = 300;
const MAX_PER_FILE: usize = 20;
const MAX_CONTENT_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct FileHit {
    path: String,
    name: String,
}

#[derive(Serialize)]
pub struct Match {
    path: String,
    line: usize,
    text: String,
}

#[derive(Serialize, Default)]
pub struct SearchResult {
    files: Vec<FileHit>,
    matches: Vec<Match>,
    truncated: bool,
}

fn is_document(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".md")
        || lower.ends_with(".markdown")
        || lower.ends_with(".txt")
        || !name.contains('.')
}

fn excerpt(line: &str, query: &str) -> String {
    let trimmed = line.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 160 {
        return trimmed.to_string();
    }
    // 긴 줄은 일치한 부분 주변만 보여준다.
    let at = trimmed
        .to_lowercase()
        .find(query)
        .map(|byte| trimmed[..byte.min(trimmed.len())].chars().count())
        .unwrap_or(0);
    let start = at.saturating_sub(40);
    let end = (start + 160).min(chars.len());
    let mut out: String = chars[start..end].iter().collect();
    if start > 0 {
        out.insert(0, '…');
    }
    if end < chars.len() {
        out.push('…');
    }
    out
}

/// 폴더에서 파일 이름과 문서 내용을 대소문자 구분 없이 찾는다.
#[tauri::command(async)]
pub fn search(folder: String, query: String) -> SearchResult {
    let mut result = SearchResult::default();
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return result;
    }
    let mut stack = vec![Path::new(&folder).to_path_buf()];
    let mut seen = 0usize;
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            seen += 1;
            if seen > MAX_ENTRIES {
                result.truncated = true;
                return result;
            }
            let path = entry.path();
            // 심볼릭 링크로 인한 순환을 피하려고 링크된 폴더는 따라가지 않는다.
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            if !is_document(&name) {
                continue;
            }
            let path_str = path.to_string_lossy().into_owned();
            if name.to_lowercase().contains(&query) {
                if result.files.len() < MAX_FILE_HITS {
                    result.files.push(FileHit {
                        path: path_str.clone(),
                        name: name.clone(),
                    });
                } else {
                    result.truncated = true;
                }
            }
            if result.matches.len() >= MAX_MATCHES {
                result.truncated = true;
                continue;
            }
            let small = fs::metadata(&path)
                .map(|m| m.len() <= MAX_CONTENT_BYTES)
                .unwrap_or(false);
            if !small {
                continue;
            }
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            let mut in_file = 0;
            for (i, line) in content.lines().enumerate() {
                if !line.to_lowercase().contains(&query) {
                    continue;
                }
                if in_file >= MAX_PER_FILE || result.matches.len() >= MAX_MATCHES {
                    result.truncated = true;
                    break;
                }
                in_file += 1;
                result.matches.push(Match {
                    path: path_str.clone(),
                    line: i + 1,
                    text: excerpt(line, &query),
                });
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_names_and_content() {
        let dir = std::env::temp_dir().join(format!("tn-search-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(
            dir.join("Network.md"),
            "# TCP\n\n혼잡 제어와 Network 계층\n",
        )
        .unwrap();
        fs::write(dir.join("sub/memo"), "network 메모\n").unwrap();
        fs::write(dir.join("sub/image.png"), "network").unwrap();
        fs::write(dir.join(".hidden/x.md"), "network").unwrap();

        let r = search(dir.to_string_lossy().into_owned(), "NETWORK".into());
        assert_eq!(r.files.len(), 1);
        assert_eq!(r.files[0].name, "Network.md");
        assert_eq!(r.matches.len(), 2);
        assert!(r
            .matches
            .iter()
            .any(|m| m.line == 3 && m.text.contains("혼잡")));

        let korean = search(dir.to_string_lossy().into_owned(), "혼잡".into());
        assert_eq!(korean.matches.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn long_lines_are_trimmed_around_match() {
        let line = format!("{}바늘{}", "가".repeat(500), "나".repeat(500));
        let out = excerpt(&line, "바늘");
        assert!(out.contains("바늘"));
        assert!(out.chars().count() <= 162);
    }
}
