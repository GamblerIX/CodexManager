use super::*;
use std::sync::MutexGuard;
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

fn test_guard() -> MutexGuard<'static, ()> {
    gateway_runtime_test_guard()
}

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

    fn clear(key: &'static str) -> Self {
        let original = std::env::var_os(key);
        std::env::remove_var(key);
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

fn spawn_mock_proxy_server(
    response_body: &str,
) -> (
    String,
    std::sync::mpsc::Receiver<Option<String>>,
    thread::JoinHandle<()>,
) {
    let server = Server::http("127.0.0.1:0").expect("start mock proxy server");
    let addr = format!("http://{}", server.server_addr());
    let response_body = response_body.to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = thread::spawn(move || {
        let request = server
            .recv_timeout(Duration::from_secs(3))
            .expect("receive proxy request");
        let Some(request) = request else {
            tx.send(None).expect("send missing proxy request");
            return;
        };
        tx.send(Some(request.url().to_string()))
            .expect("send proxy request url");
        let response = Response::from_string(response_body)
            .with_status_code(StatusCode(200))
            .with_header(
                Header::from_bytes("Content-Type", "text/plain")
                    .expect("content-type header"),
            );
        request.respond(response).expect("respond proxy request");
    });
    (addr, rx, handle)
}

#[test]
fn reload_from_env_updates_timeout_and_proxy() {
    let _guard = test_guard();
    let _timeout_guard = EnvGuard::set(ENV_UPSTREAM_TOTAL_TIMEOUT_MS, "777");
    let _stream_timeout_guard = EnvGuard::set(ENV_UPSTREAM_STREAM_TIMEOUT_MS, "888");
    let _inflight_guard = EnvGuard::set(ENV_ACCOUNT_MAX_INFLIGHT, "4");
    let _strict_allowlist_guard = EnvGuard::set(ENV_STRICT_REQUEST_PARAM_ALLOWLIST, "0");
    let _request_compression_guard = EnvGuard::set(ENV_ENABLE_REQUEST_COMPRESSION, "0");
    let _client_id_guard = EnvGuard::set(ENV_TOKEN_EXCHANGE_CLIENT_ID, "client-id-123");
    let _issuer_guard = EnvGuard::set(ENV_TOKEN_EXCHANGE_ISSUER, "https://issuer.example");
    let _proxy_guard = EnvGuard::set(ENV_UPSTREAM_PROXY_URL, "socks5://127.0.0.1:7890");

    reload_from_env();

    assert_eq!(upstream_total_timeout(), Some(Duration::from_millis(777)));
    assert_eq!(upstream_stream_timeout(), Some(Duration::from_millis(888)));
    assert_eq!(account_max_inflight_limit(), 4);
    assert!(!strict_request_param_allowlist_enabled());
    assert!(!request_compression_enabled());
    assert_eq!(token_exchange_client_id(), "client-id-123");
    assert_eq!(
        token_exchange_default_issuer(),
        "https://issuer.example".to_string()
    );
    assert_eq!(
        upstream_proxy_url().as_deref(),
        Some("socks5h://127.0.0.1:7890")
    );
}

#[test]
fn reload_from_env_defaults_account_max_inflight_to_one() {
    let _guard = test_guard();
    let _guard = EnvGuard::clear(ENV_ACCOUNT_MAX_INFLIGHT);
    let _request_compression_guard = EnvGuard::clear(ENV_ENABLE_REQUEST_COMPRESSION);

    reload_from_env();

    assert_eq!(account_max_inflight_limit(), 1);
    assert!(request_compression_enabled());
}

#[test]
fn parse_proxy_list_env_limits_to_five_entries() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(
        ENV_PROXY_LIST,
        "http://p1:8080,http://p2:8080;http://p3:8080\nhttp://p4:8080\rhttp://p5:8080,http://p6:8080",
    );
    let parsed = parse_proxy_list_env();
    assert_eq!(parsed.len(), MAX_UPSTREAM_PROXY_POOL_SIZE);
    assert_eq!(parsed.first().map(String::as_str), Some("http://p1:8080"));
    assert_eq!(parsed.last().map(String::as_str), Some("http://p5:8080"));
}

#[test]
fn parse_proxy_list_env_normalizes_socks_entries() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(
        ENV_PROXY_LIST,
        "socks5://127.0.0.1:7890,socks://127.0.0.1:7891,https://socks5://127.0.0.1:7892",
    );

    let parsed = parse_proxy_list_env();

    assert_eq!(parsed.len(), 3);
    assert_eq!(parsed[0], "socks5h://127.0.0.1:7890");
    assert_eq!(parsed[1], "socks5h://127.0.0.1:7891");
    assert_eq!(parsed[2], "socks5h://127.0.0.1:7892");
}

#[test]
fn stable_proxy_index_is_deterministic() {
    let _guard = test_guard();
    let idx1 = stable_proxy_index("account-42", 5);
    let idx2 = stable_proxy_index("account-42", 5);
    assert_eq!(idx1, idx2);
    assert!(idx1.expect("index") < 5);
}

#[test]
fn set_upstream_proxy_url_updates_env_and_cache() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_UPSTREAM_PROXY_URL, "");

    let applied = set_upstream_proxy_url(Some("http://127.0.0.1:7890")).expect("set proxy");
    assert_eq!(applied.as_deref(), Some("http://127.0.0.1:7890"));
    assert_eq!(
        std::env::var(ENV_UPSTREAM_PROXY_URL).ok().as_deref(),
        Some("http://127.0.0.1:7890")
    );
    assert_eq!(
        upstream_proxy_url().as_deref(),
        Some("http://127.0.0.1:7890")
    );

    let cleared = set_upstream_proxy_url(None).expect("clear proxy");
    assert!(cleared.is_none());
    assert_eq!(std::env::var(ENV_UPSTREAM_PROXY_URL).ok(), None);
    assert_eq!(upstream_proxy_url(), None);
}

#[test]
fn set_upstream_proxy_url_normalizes_socks_scheme() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_UPSTREAM_PROXY_URL, "");

    let applied =
        set_upstream_proxy_url(Some("https://socks5://127.0.0.1:7890")).expect("set proxy");

    assert_eq!(applied.as_deref(), Some("socks5h://127.0.0.1:7890"));
    assert_eq!(
        std::env::var(ENV_UPSTREAM_PROXY_URL).ok().as_deref(),
        Some("socks5h://127.0.0.1:7890")
    );
}

#[test]
fn build_upstream_client_uses_environment_http_proxy_when_explicit_proxy_is_unset() {
    let _guard = test_guard();
    let (proxy_url, proxy_requests, proxy_handle) = spawn_mock_proxy_server("proxied");
    let _upstream_proxy_guard = EnvGuard::clear(ENV_UPSTREAM_PROXY_URL);
    let _connect_timeout_guard = EnvGuard::set(ENV_UPSTREAM_CONNECT_TIMEOUT_SECS, "1");
    let _http_proxy_guard = EnvGuard::set("HTTP_PROXY", &proxy_url);
    let _http_proxy_lower_guard = EnvGuard::set("http_proxy", &proxy_url);
    let _https_proxy_guard = EnvGuard::clear("HTTPS_PROXY");
    let _https_proxy_lower_guard = EnvGuard::clear("https_proxy");
    let _all_proxy_guard = EnvGuard::clear("ALL_PROXY");
    let _all_proxy_lower_guard = EnvGuard::clear("all_proxy");
    let _no_proxy_guard = EnvGuard::clear("NO_PROXY");
    let _no_proxy_lower_guard = EnvGuard::clear("no_proxy");

    reload_from_env();

    let response_result = build_upstream_client_with_proxy(None)
        .get("http://example.invalid/proxy-check")
        .send();
    let proxied_url = proxy_requests
        .recv_timeout(Duration::from_secs(5))
        .expect("receive proxy observation");
    proxy_handle.join().expect("join proxy thread");

    let response = response_result.expect("request should succeed through env proxy");
    assert_eq!(proxied_url.as_deref(), Some("http://example.invalid/proxy-check"));
    assert_eq!(response.text().expect("read proxy response body"), "proxied");
}

#[test]
fn set_upstream_stream_timeout_ms_updates_env_and_cache() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_UPSTREAM_STREAM_TIMEOUT_MS, "1800000");

    let applied = set_upstream_stream_timeout_ms(432100);

    assert_eq!(applied, 432100);
    assert_eq!(current_upstream_stream_timeout_ms(), 432100);
    assert_eq!(
        upstream_stream_timeout(),
        Some(Duration::from_millis(432100))
    );
    assert_eq!(
        std::env::var(ENV_UPSTREAM_STREAM_TIMEOUT_MS)
            .ok()
            .as_deref(),
        Some("432100")
    );
}

#[test]
fn reload_from_env_defaults_user_agent_version_to_0_116_0() {
    let _guard = test_guard();
    let _guard = EnvGuard::clear(ENV_UPSTREAM_PROXY_URL);

    reload_from_env();

    assert_eq!(current_codex_user_agent_version(), "0.116.0");
    assert!(current_codex_user_agent().contains("codex_cli_rs/0.116.0"));
}

#[test]
fn reload_from_env_parses_free_account_preferred_models() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(
        ENV_FREE_ACCOUNT_PREFERRED_MODELS,
        "gpt-5.4-mini, gpt-5.2 , gpt-5.4-mini",
    );

    reload_from_env();

    assert_eq!(
        current_free_account_preferred_models(),
        vec!["gpt-5.4-mini".to_string(), "gpt-5.2".to_string()]
    );
    assert!(should_prioritize_free_account_for_model(Some(
        "gpt-5.4-mini"
    )));
    assert!(!should_prioritize_free_account_for_model(Some("gpt-5.4")));
}

#[test]
fn normalize_model_slug_maps_legacy_gpt_5_4_pro_to_gpt_5_4() {
    let _guard = test_guard();

    let actual = normalize_model_slug("gpt-5.4-pro").expect("normalize model");

    assert_eq!(actual, "gpt-5.4");
}

#[test]
fn should_prioritize_free_account_for_model_normalizes_legacy_aliases() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_FREE_ACCOUNT_PREFERRED_MODELS, "gpt-5.4");

    reload_from_env();

    assert!(should_prioritize_free_account_for_model(Some(
        "gpt-5.4-pro"
    )));
}

#[test]
fn normalize_model_slug_accepts_auto() {
    let _guard = test_guard();

    let actual = normalize_model_slug("auto").expect("normalize model");

    assert_eq!(actual, "auto");
}

#[test]
fn set_originator_updates_env_and_wire_originator() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_ORIGINATOR, "codex_cli_rs");

    let applied = set_originator("codex_cli_rs_windows").expect("set originator");

    assert_eq!(applied, "codex_cli_rs_windows");
    assert_eq!(current_originator(), "codex_cli_rs_windows");
    assert_eq!(current_wire_originator(), "codex_cli_rs_windows");
    assert_eq!(
        std::env::var(ENV_ORIGINATOR).ok().as_deref(),
        Some("codex_cli_rs_windows")
    );
    let expected_prefix = format!(
        "codex_cli_rs_windows/{}",
        current_codex_user_agent_version()
    );
    assert!(current_codex_user_agent().contains(expected_prefix.as_str()));
}

#[test]
fn set_originator_accepts_legacy_user_agent_delimiters() {
    let _guard = test_guard();

    let applied = set_originator("codex cli (desktop)").expect("accept legacy wire originator");

    assert_eq!(applied, "codex cli (desktop)");
    assert_eq!(current_originator(), "codex cli (desktop)");
    assert_eq!(current_wire_originator(), "codex cli (desktop)");
    assert!(current_codex_user_agent().contains("codex cli (desktop)/"));
}

#[test]
fn set_originator_rejects_control_characters() {
    let _guard = test_guard();

    let err = set_originator("codex_cli_rs\r\nbad").expect_err("reject invalid wire originator");

    assert_eq!(err, "originator contains control characters");
}

#[test]
fn set_codex_user_agent_version_updates_env_and_user_agent() {
    let _guard = test_guard();

    let applied = set_codex_user_agent_version("0.102.1").expect("set codex user agent version");

    assert_eq!(applied, "0.102.1");
    assert_eq!(current_codex_user_agent_version(), "0.102.1");
    assert!(current_codex_user_agent().contains("codex_cli_rs/0.102.1"));
}

#[test]
fn set_residency_requirement_updates_env_and_cache() {
    let _guard = test_guard();
    let _guard = EnvGuard::clear(ENV_RESIDENCY_REQUIREMENT);

    let applied = set_residency_requirement(Some("us")).expect("set residency requirement");
    assert_eq!(applied.as_deref(), Some("us"));
    assert_eq!(current_residency_requirement().as_deref(), Some("us"));
    assert_eq!(
        std::env::var(ENV_RESIDENCY_REQUIREMENT).ok().as_deref(),
        Some("us")
    );

    let cleared = set_residency_requirement(None).expect("clear residency requirement");
    assert!(cleared.is_none());
    assert_eq!(current_residency_requirement(), None);
    assert_eq!(std::env::var(ENV_RESIDENCY_REQUIREMENT).ok(), None);
}

#[test]
fn set_request_compression_enabled_updates_env_and_cache() {
    let _guard = test_guard();
    let _guard = EnvGuard::set(ENV_ENABLE_REQUEST_COMPRESSION, "1");

    let applied = set_request_compression_enabled(false);

    assert!(!applied);
    assert!(!request_compression_enabled());
    assert_eq!(
        std::env::var(ENV_ENABLE_REQUEST_COMPRESSION)
            .ok()
            .as_deref(),
        Some("0")
    );

    let reapplied = set_request_compression_enabled(true);
    assert!(reapplied);
    assert!(request_compression_enabled());
    assert_eq!(
        std::env::var(ENV_ENABLE_REQUEST_COMPRESSION)
            .ok()
            .as_deref(),
        Some("1")
    );
}
