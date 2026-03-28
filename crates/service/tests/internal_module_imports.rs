use std::fs;
use std::path::{Path, PathBuf};

#[test]
fn service_modules_use_relative_paths_for_internal_imports() {
    let src_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut offenders = Vec::new();
    collect_offenders(src_root.as_path(), &mut offenders);

    assert!(
        offenders.is_empty(),
        "found crate-root self-imports that should use relative module paths:\n{}",
        offenders.join("\n")
    );
}

fn collect_offenders(dir: &Path, offenders: &mut Vec<String>) {
    let entries = fs::read_dir(dir).expect("read dir");
    for entry in entries {
        let entry = entry.expect("dir entry");
        let path = entry.path();
        if path.is_dir() {
            collect_offenders(path.as_path(), offenders);
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("rs") {
            continue;
        }

        let relative = path
            .strip_prefix(Path::new(env!("CARGO_MANIFEST_DIR")))
            .expect("relative path")
            .to_path_buf();
        let content = fs::read_to_string(path.as_path()).expect("read source file");

        for prefix in disallowed_prefixes(relative.as_path()) {
            for (line_index, line) in content.lines().enumerate() {
                if line.contains(prefix) {
                    offenders.push(format!(
                        "{}:{} contains `{}`",
                        relative.display(),
                        line_index + 1,
                        prefix
                    ));
                }
            }
        }
    }
}

fn disallowed_prefixes(relative: &Path) -> &'static [&'static str] {
    if relative.starts_with(PathBuf::from("src").join("gateway")) {
        return &["crate::gateway::", "use crate::gateway;"];
    }
    if relative.starts_with(PathBuf::from("src").join("auth")) {
        return &[
            "crate::auth_account",
            "crate::auth_callback",
            "crate::auth_login",
            "crate::auth_tokens",
            "crate::auth::",
        ];
    }
    if relative.starts_with(PathBuf::from("src").join("usage")) {
        return &[
            "crate::usage_account_meta",
            "crate::usage_aggregate",
            "crate::usage_http",
            "crate::usage_keepalive",
            "crate::usage_list",
            "crate::usage_read",
            "crate::usage_refresh",
            "crate::usage_scheduler",
            "crate::usage_snapshot_store",
            "crate::usage_token_refresh",
            "crate::usage::",
        ];
    }
    if relative.starts_with(PathBuf::from("src").join("account")) {
        return &[
            "crate::account_availability",
            "crate::account_cleanup",
            "crate::account_delete",
            "crate::account_delete_many",
            "crate::account_export",
            "crate::account_import",
            "crate::account_list",
            "crate::account_plan",
            "crate::account_status",
            "crate::account_update",
            "crate::account::",
        ];
    }
    if relative.starts_with(PathBuf::from("src").join("requestlog")) {
        return &[
            "crate::requestlog_clear",
            "crate::requestlog_list",
            "crate::requestlog_summary",
            "crate::requestlog_today_summary",
            "crate::requestlog::",
        ];
    }
    &[]
}
