use codexmanager_core::storage::{Account, ConversationBinding, Storage, Token};

use super::super::super::conversation_binding::ConversationRoutingContext;
use super::super::super::IncomingHeaderSnapshot;
use crate::apikey_profile::PROTOCOL_ANTHROPIC_NATIVE;

pub(in super::super) struct UpstreamRequestSetup {
    pub(in super::super) upstream_base: String,
    pub(in super::super) upstream_fallback_base: Option<String>,
    pub(in super::super) url: String,
    pub(in super::super) url_alt: Option<String>,
    pub(in super::super) candidate_count: usize,
    pub(in super::super) account_max_inflight: usize,
    pub(in super::super) anthropic_has_prompt_cache_key: bool,
    pub(in super::super) has_sticky_fallback_session: bool,
    pub(in super::super) has_sticky_fallback_conversation: bool,
    pub(in super::super) has_body_encrypted_content: bool,
    pub(in super::super) conversation_routing: Option<ConversationRoutingContext>,
}

pub(in super::super) fn prepare_request_setup(
    path: &str,
    protocol_type: &str,
    has_prompt_cache_key: bool,
    incoming_headers: &IncomingHeaderSnapshot,
    body: &bytes::Bytes,
    storage: &Storage,
    candidates: &mut Vec<(Account, Token)>,
    key_id: &str,
    platform_key_hash: &str,
    local_conversation_id: Option<&str>,
    conversation_binding: Option<&ConversationBinding>,
    model_for_log: Option<&str>,
    trace_id: &str,
) -> UpstreamRequestSetup {
    let upstream_base = super::super::super::resolve_upstream_base_url();
    let upstream_fallback_base =
        super::super::super::resolve_upstream_fallback_base_url(upstream_base.as_str());
    let (url, url_alt) =
        super::super::super::request_rewrite::compute_upstream_url(upstream_base.as_str(), path);
    let candidate_count = candidates.len();
    let account_max_inflight = super::super::super::account_max_inflight_limit();
    let anthropic_has_prompt_cache_key =
        protocol_type == PROTOCOL_ANTHROPIC_NATIVE && has_prompt_cache_key;
    let conversation_routing =
        super::super::super::conversation_binding::prepare_conversation_routing(
            platform_key_hash,
            local_conversation_id,
            conversation_binding,
            candidates,
        );
    let rotation_plan = super::super::super::conversation_binding::apply_candidate_rotation(
        Some(storage),
        candidates,
        conversation_routing.as_ref(),
        key_id,
        model_for_log,
    );
    let candidate_order = candidates
        .iter()
        .map(|(account, _)| format!("{}#sort={}", account.id, account.sort))
        .collect::<Vec<_>>();
    super::super::super::trace_log::log_candidate_pool(
        trace_id,
        key_id,
        rotation_plan.strategy_label,
        candidate_order.as_slice(),
    );

    UpstreamRequestSetup {
        upstream_base,
        upstream_fallback_base,
        url,
        url_alt,
        candidate_count,
        account_max_inflight,
        anthropic_has_prompt_cache_key,
        has_sticky_fallback_session: false,
        has_sticky_fallback_conversation:
            super::super::header_profile::derive_sticky_conversation_id_from_headers(
                incoming_headers,
            )
            .is_some(),
        has_body_encrypted_content:
            super::super::support::payload_rewrite::body_has_encrypted_content_hint(body.as_ref()),
        conversation_routing,
    }
}

#[cfg(test)]
mod tests {
    use super::super::super::super::IncomingHeaderSnapshot;
    use super::prepare_request_setup;
    use crate::storage_helpers::{
        clear_storage_cache_for_tests, clear_storage_open_count_for_tests,
        storage_open_count_for_tests,
    };
    use codexmanager_core::storage::{Account, Token};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct EnvGuard {
        key: &'static str,
        original: Option<std::ffi::OsString>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let original = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, original }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            if let Some(value) = &self.original {
                std::env::set_var(self.key, value);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    fn unique_db_path(prefix: &str) -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        std::env::temp_dir()
            .join(format!("{prefix}-{nonce}.db"))
            .to_string_lossy()
            .to_string()
    }

    fn candidates() -> Vec<(Account, Token)> {
        vec![
            (
                Account {
                    id: "acc-a".to_string(),
                    label: "A".to_string(),
                    issuer: "".to_string(),
                    chatgpt_account_id: None,
                    workspace_id: None,
                    group_name: None,
                    sort: 0,
                    status: "active".to_string(),
                    created_at: 0,
                    updated_at: 0,
                },
                Token {
                    account_id: "acc-a".to_string(),
                    id_token: "".to_string(),
                    access_token: "".to_string(),
                    refresh_token: "".to_string(),
                    api_key_access_token: None,
                    last_refresh: 0,
                },
            ),
            (
                Account {
                    id: "acc-b".to_string(),
                    label: "B".to_string(),
                    issuer: "".to_string(),
                    chatgpt_account_id: None,
                    workspace_id: None,
                    group_name: None,
                    sort: 1,
                    status: "active".to_string(),
                    created_at: 0,
                    updated_at: 0,
                },
                Token {
                    account_id: "acc-b".to_string(),
                    id_token: "".to_string(),
                    access_token: "".to_string(),
                    refresh_token: "".to_string(),
                    api_key_access_token: None,
                    last_refresh: 0,
                },
            ),
        ]
    }

    #[test]
    fn route_selection_does_not_reopen_storage_when_request_handle_is_alive() {
        let _runtime_guard = super::super::super::super::gateway_runtime_test_guard();
        let db_path = unique_db_path("codexmanager-route-request-setup-storage");
        let _db_guard = EnvGuard::set("CODEXMANAGER_DB_PATH", &db_path);
        let _strategy_guard = EnvGuard::set("CODEXMANAGER_ROUTE_STRATEGY", "balanced");

        clear_storage_cache_for_tests();
        clear_storage_open_count_for_tests(&db_path);
        super::super::super::super::reload_runtime_config_from_env();

        let storage = crate::storage_helpers::open_storage().expect("open request storage");
        storage.init().expect("init");

        let mut candidates = candidates();
        let _setup = prepare_request_setup(
            "/v1/chat/completions",
            "openai_compat",
            false,
            &IncomingHeaderSnapshot::default(),
            &bytes::Bytes::from_static(b"{}"),
            &storage,
            &mut candidates,
            "gk-storage",
            "platform-hash",
            None,
            None,
            Some("gpt-5.4"),
            "trace-storage",
        );

        assert_eq!(
            storage_open_count_for_tests(&db_path),
            1,
            "route selection should reuse the existing request storage handle"
        );

        drop(storage);
        clear_storage_cache_for_tests();
        clear_storage_open_count_for_tests(&db_path);
        let _ = std::fs::remove_file(&db_path);
    }
}
