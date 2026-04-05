use std::fs;
use std::path::{Path, PathBuf};

const MAX_IMPORT_FILE_COUNT: usize = 256;
const MAX_IMPORT_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES: u64 = 16 * 1024 * 1024;

fn collect_json_files_recursively(
    root: &Path,
    output: &mut Vec<PathBuf>,
    total_bytes: &mut u64,
) -> Result<(), String> {
    let entries =
        fs::read_dir(root).map_err(|err| format!("read dir failed ({}): {err}", root.display()))?;
    for entry in entries {
        let entry =
            entry.map_err(|err| format!("read dir entry failed ({}): {err}", root.display()))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("read metadata failed ({}): {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_json_files_recursively(&path, output, total_bytes)?;
            continue;
        }
        let is_json = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("json"))
            .unwrap_or(false);
        if is_json {
            if output.len() >= MAX_IMPORT_FILE_COUNT {
                return Err(format!(
                    "too many import files under {} (limit: {MAX_IMPORT_FILE_COUNT})",
                    root.display()
                ));
            }
            let file_bytes = metadata.len();
            if file_bytes > MAX_IMPORT_FILE_BYTES {
                return Err(format!(
                    "import file too large ({} bytes, limit: {MAX_IMPORT_FILE_BYTES}) {}",
                    file_bytes,
                    path.display()
                ));
            }
            let next_total_bytes = total_bytes.saturating_add(file_bytes);
            if next_total_bytes > MAX_IMPORT_TOTAL_BYTES {
                return Err(format!(
                    "total import bytes exceed limit ({MAX_IMPORT_TOTAL_BYTES}) under {}",
                    root.display()
                ));
            }
            *total_bytes = next_total_bytes;
            output.push(path);
        }
    }
    Ok(())
}

pub(crate) fn read_account_import_contents_from_directory(
    root: &Path,
) -> Result<(Vec<PathBuf>, Vec<String>), String> {
    let mut json_files = Vec::new();
    let mut total_bytes = 0u64;
    collect_json_files_recursively(root, &mut json_files, &mut total_bytes)?;
    json_files.sort();

    let mut contents = Vec::with_capacity(json_files.len());
    for path in &json_files {
        let text = fs::read_to_string(path)
            .map_err(|err| format!("read json file failed ({}): {err}", path.display()))?;
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            contents.push(trimmed.to_string());
        }
    }
    Ok((json_files, contents))
}

pub(crate) fn read_account_import_contents_from_files(
    files: &[PathBuf],
) -> Result<Vec<String>, String> {
    if files.len() > MAX_IMPORT_FILE_COUNT {
        return Err(format!(
            "too many import files selected (limit: {MAX_IMPORT_FILE_COUNT})"
        ));
    }

    let mut contents = Vec::with_capacity(files.len());
    let mut total_bytes = 0u64;
    for path in files {
        let metadata = fs::symlink_metadata(path)
            .map_err(|err| format!("read import file metadata failed ({}): {err}", path.display()))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let file_bytes = metadata.len();
        if file_bytes > MAX_IMPORT_FILE_BYTES {
            return Err(format!(
                "import file too large ({} bytes, limit: {MAX_IMPORT_FILE_BYTES}) {}",
                file_bytes,
                path.display()
            ));
        }
        let next_total_bytes = total_bytes.saturating_add(file_bytes);
        if next_total_bytes > MAX_IMPORT_TOTAL_BYTES {
            return Err(format!(
                "total import bytes exceed limit ({MAX_IMPORT_TOTAL_BYTES})"
            ));
        }
        total_bytes = next_total_bytes;
        let text = fs::read_to_string(path)
            .map_err(|err| format!("read import file failed ({}): {err}", path.display()))?;
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            contents.push(trimmed.to_string());
        }
    }
    Ok(contents)
}

#[cfg(test)]
mod tests {
    use super::{
        read_account_import_contents_from_directory, read_account_import_contents_from_files,
        MAX_IMPORT_FILE_BYTES, MAX_IMPORT_TOTAL_BYTES,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "codexmanager_{prefix}_{}_{}",
            std::process::id(),
            unique
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn read_account_import_contents_from_directory_rejects_oversized_json_file() {
        let dir = create_temp_dir("import_dir_limit");
        let file_path = dir.join("oversized.json");
        fs::write(&file_path, vec![b'a'; (MAX_IMPORT_FILE_BYTES as usize) + 1])
            .expect("write oversized file");

        let result = read_account_import_contents_from_directory(&dir);
        fs::remove_dir_all(&dir).expect("cleanup temp dir");

        let err = result.expect_err("expected oversized file error");
        assert!(err.contains("import file too large"));
    }

    #[test]
    fn read_account_import_contents_from_files_rejects_total_bytes_over_limit() {
        let dir = create_temp_dir("import_files_limit");
        let per_file_bytes = (MAX_IMPORT_FILE_BYTES - 1) as usize;
        let file_count = ((MAX_IMPORT_TOTAL_BYTES / MAX_IMPORT_FILE_BYTES) + 2) as usize;
        let mut file_paths = Vec::with_capacity(file_count);

        for index in 0..file_count {
            let path = dir.join(format!("{index}.json"));
            fs::write(&path, vec![b'a'; per_file_bytes]).expect("write limit test file");
            file_paths.push(path);
        }

        let result = read_account_import_contents_from_files(&file_paths);
        fs::remove_dir_all(&dir).expect("cleanup temp dir");

        let err = result.expect_err("expected total import bytes error");
        assert!(err.contains("total import bytes exceed limit"));
    }
}
