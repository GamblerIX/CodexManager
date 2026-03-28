use super::*;
use super::super::{gateway_runtime_test_guard, reload_runtime_config_from_env};
use codexmanager_core::storage::{now_ts, Storage, UsageSnapshotRecord};

fn candidate_list() -> Vec<(Account, Token)> {
    vec![
        (
            Account {
                id: "acc-a".to_string(),
                label: "".to_string(),
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
                label: "".to_string(),
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
        (
            Account {
                id: "acc-c".to_string(),
                label: "".to_string(),
                issuer: "".to_string(),
                chatgpt_account_id: None,
                workspace_id: None,
                group_name: None,
                sort: 2,
                status: "active".to_string(),
                created_at: 0,
                updated_at: 0,
            },
            Token {
                account_id: "acc-c".to_string(),
                id_token: "".to_string(),
                access_token: "".to_string(),
                refresh_token: "".to_string(),
                api_key_access_token: None,
                last_refresh: 0,
            },
        ),
    ]
}

fn encode_base64url(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let chunk = ((bytes[index] as u32) << 16)
            | ((bytes[index + 1] as u32) << 8)
            | (bytes[index + 2] as u32);
        out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
        out.push(TABLE[(chunk & 0x3f) as usize] as char);
        index += 3;
    }
    match bytes.len().saturating_sub(index) {
        1 => {
            let chunk = (bytes[index] as u32) << 16;
            out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
            out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        }
        2 => {
            let chunk = ((bytes[index] as u32) << 16) | ((bytes[index + 1] as u32) << 8);
            out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
            out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
            out.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
        }
        _ => {}
    }
    out
}

fn plan_token(plan: &str) -> String {
    let header = encode_base64url(br#"{"alg":"none","typ":"JWT"}"#);
    let payload = encode_base64url(
        serde_json::json!({
            "sub": format!("acc-{plan}"),
            "https://api.openai.com/auth": {
                "chatgpt_plan_type": plan
            }
        })
        .to_string()
        .as_bytes(),
    );
    format!("{header}.{payload}.sig")
}

fn candidate_with_plan(id: &str, sort: i64, plan: &str) -> (Account, Token) {
    let token = plan_token(plan);
    (
        Account {
            id: id.to_string(),
            label: "".to_string(),
            issuer: "".to_string(),
            chatgpt_account_id: None,
            workspace_id: None,
            group_name: None,
            sort,
            status: "active".to_string(),
            created_at: 0,
            updated_at: 0,
        },
        Token {
            account_id: id.to_string(),
            id_token: token.clone(),
            access_token: token,
            refresh_token: "".to_string(),
            api_key_access_token: None,
            last_refresh: 0,
        },
    )
}

fn account_ids(candidates: &[(Account, Token)]) -> Vec<String> {
    candidates
        .iter()
        .map(|(account, _)| account.id.clone())
        .collect()
}

fn storage_with_candidates(candidates: &[(Account, Token)]) -> Storage {
    let storage = Storage::open_in_memory().expect("open");
    storage.init().expect("init");
    for (account, token) in candidates {
        storage.insert_account(account).expect("insert account");
        storage.insert_token(token).expect("insert token");
    }
    storage
}

#[test]
fn defaults_to_ordered_strategy() {
    let _guard = route_strategy_test_guard();
    let previous = std::env::var(ROUTE_STRATEGY_ENV).ok();
    std::env::remove_var(ROUTE_STRATEGY_ENV);
    reload_from_env();
    clear_route_state_for_tests();

    let mut candidates = candidate_list();
    apply_route_strategy(&mut candidates, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(
        account_ids(&candidates),
        vec![
            "acc-a".to_string(),
            "acc-b".to_string(),
            "acc-c".to_string()
        ]
    );

    let mut second = candidate_list();
    apply_route_strategy(&mut second, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(
        account_ids(&second),
        vec![
            "acc-a".to_string(),
            "acc-b".to_string(),
            "acc-c".to_string()
        ]
    );

    if let Some(value) = previous {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    reload_from_env();
}

#[test]
fn balanced_round_robin_rotates_start_by_key_and_model() {
    let _guard = route_strategy_test_guard();
    let previous = std::env::var(ROUTE_STRATEGY_ENV).ok();
    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    reload_from_env();
    clear_route_state_for_tests();

    let mut first = candidate_list();
    apply_route_strategy(&mut first, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(
        account_ids(&first),
        vec![
            "acc-a".to_string(),
            "acc-b".to_string(),
            "acc-c".to_string()
        ]
    );

    let mut second = candidate_list();
    apply_route_strategy(&mut second, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(
        account_ids(&second),
        vec![
            "acc-b".to_string(),
            "acc-c".to_string(),
            "acc-a".to_string()
        ]
    );

    let mut third = candidate_list();
    apply_route_strategy(&mut third, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(
        account_ids(&third),
        vec![
            "acc-c".to_string(),
            "acc-a".to_string(),
            "acc-b".to_string()
        ]
    );

    if let Some(value) = previous {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    reload_from_env();
}

#[test]
fn balanced_round_robin_isolated_by_key_and_model() {
    let _guard = route_strategy_test_guard();
    let previous = std::env::var(ROUTE_STRATEGY_ENV).ok();
    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    reload_from_env();
    clear_route_state_for_tests();

    let mut gpt_first = candidate_list();
    apply_route_strategy(&mut gpt_first, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&gpt_first)[0], "acc-a");

    let mut gpt_second = candidate_list();
    apply_route_strategy(&mut gpt_second, "gk_1", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&gpt_second)[0], "acc-b");

    let mut o3_first = candidate_list();
    apply_route_strategy(&mut o3_first, "gk_1", Some("o3"));
    assert_eq!(account_ids(&o3_first)[0], "acc-a");

    let mut other_key_first = candidate_list();
    apply_route_strategy(&mut other_key_first, "gk_2", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&other_key_first)[0], "acc-a");

    if let Some(value) = previous {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    reload_from_env();
}

#[test]
fn set_route_strategy_accepts_aliases_and_reports_canonical_name() {
    let _guard = route_strategy_test_guard();
    clear_route_state_for_tests();
    assert_eq!(
        set_route_strategy("ordered").expect("set ordered"),
        "ordered"
    );
    assert_eq!(
        set_route_strategy("round_robin").expect("set rr alias"),
        "balanced"
    );
    assert_eq!(current_route_strategy(), "balanced");
    assert!(set_route_strategy("unsupported").is_err());
}

#[test]
fn route_state_ttl_expires_per_key_state() {
    let _guard = route_strategy_test_guard();
    let prev_strategy = std::env::var(ROUTE_STRATEGY_ENV).ok();
    let prev_ttl = std::env::var(ROUTE_STATE_TTL_SECS_ENV).ok();
    let prev_cap = std::env::var(ROUTE_STATE_CAPACITY_ENV).ok();

    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    std::env::set_var(ROUTE_STATE_TTL_SECS_ENV, "1");
    std::env::set_var(ROUTE_STATE_CAPACITY_ENV, "100");
    reload_from_env();
    clear_route_state_for_tests();

    let key = key_model_key("gk_ttl", Some("m1"), None);
    let lock = ROUTE_STATE.get_or_init(|| Mutex::new(RouteRoundRobinState::default()));
    let now = Instant::now();
    {
        let mut state = lock.lock().expect("route state");
        state.next_start_by_key_model.insert(
            key.clone(),
            RouteStateEntry::new(2, now - Duration::from_secs(5)),
        );
        state.p2c_nonce_by_key_model.insert(
            key.clone(),
            RouteStateEntry::new(9, now - Duration::from_secs(5)),
        );
    }

    // 中文注释：过期后应视为“无状态”，从 0 开始轮询。
    assert_eq!(next_start_index("gk_ttl", Some("m1"), 3), 0);

    // 中文注释：nonce 过期后应重置；第一次调用后 value=1（从 0 自增）。
    let _ = p2c_challenger_index("gk_ttl", Some("m1"), 3);
    {
        let state = lock.lock().expect("route state");
        let entry = state
            .p2c_nonce_by_key_model
            .get(key.as_str())
            .expect("nonce entry");
        assert_eq!(entry.value, 1);
    }

    if let Some(value) = prev_strategy {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    if let Some(value) = prev_ttl {
        std::env::set_var(ROUTE_STATE_TTL_SECS_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STATE_TTL_SECS_ENV);
    }
    if let Some(value) = prev_cap {
        std::env::set_var(ROUTE_STATE_CAPACITY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STATE_CAPACITY_ENV);
    }
    reload_from_env();
}

#[test]
fn route_state_capacity_evicts_lru_and_keeps_maps_in_sync() {
    let _guard = route_strategy_test_guard();
    let prev_ttl = std::env::var(ROUTE_STATE_TTL_SECS_ENV).ok();
    let prev_cap = std::env::var(ROUTE_STATE_CAPACITY_ENV).ok();

    // 中文注释：禁用 TTL，单测只验证容量淘汰逻辑。
    std::env::set_var(ROUTE_STATE_TTL_SECS_ENV, "0");
    std::env::set_var(ROUTE_STATE_CAPACITY_ENV, "2");
    reload_from_env();
    clear_route_state_for_tests();

    let k1 = key_model_key("k1", None, None);
    let k2 = key_model_key("k2", None, None);
    let k3 = key_model_key("k3", None, None);

    let _ = next_start_index("k1", None, 3);
    let _ = next_start_index("k2", None, 3);

    // 中文注释：预填充另一张 map，用于验证“同 key 联动清理”。
    let lock = ROUTE_STATE.get_or_init(|| Mutex::new(RouteRoundRobinState::default()));
    {
        let mut state = lock.lock().expect("route state");
        let now = Instant::now();
        state
            .p2c_nonce_by_key_model
            .insert(k1.clone(), RouteStateEntry::new(0, now));
        state
            .p2c_nonce_by_key_model
            .insert(k2.clone(), RouteStateEntry::new(0, now));
    }

    let _ = next_start_index("k3", None, 3);

    {
        let state = lock.lock().expect("route state");
        assert_eq!(state.next_start_by_key_model.len(), 2);
        assert!(!state.next_start_by_key_model.contains_key(k1.as_str()));
        assert!(state.next_start_by_key_model.contains_key(k2.as_str()));
        assert!(state.next_start_by_key_model.contains_key(k3.as_str()));

        assert!(!state.p2c_nonce_by_key_model.contains_key(k1.as_str()));
    }

    if let Some(value) = prev_ttl {
        std::env::set_var(ROUTE_STATE_TTL_SECS_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STATE_TTL_SECS_ENV);
    }
    if let Some(value) = prev_cap {
        std::env::set_var(ROUTE_STATE_CAPACITY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STATE_CAPACITY_ENV);
    }
    reload_from_env();
}

#[test]
fn health_p2c_promotes_healthier_candidate_in_ordered_mode() {
    let _guard = route_strategy_test_guard();
    let _quality_guard = super::super::route_quality::route_quality_test_guard();
    super::super::route_quality::clear_route_quality_for_tests();
    std::env::set_var(ROUTE_HEALTH_P2C_ENABLED_ENV, "1");
    // 中文注释：窗口=2 时挑战者固定为 index=1，确保测试稳定可复现。
    std::env::set_var(ROUTE_HEALTH_P2C_ORDERED_WINDOW_ENV, "2");
    std::env::set_var(ROUTE_STRATEGY_ENV, "ordered");
    reload_from_env();
    clear_route_state_for_tests();

    for _ in 0..4 {
        super::super::route_quality::record_route_quality("acc-a", 429);
        super::super::route_quality::record_route_quality("acc-b", 200);
    }

    let mut candidates = candidate_list();
    apply_route_strategy(&mut candidates, "gk-health-1", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&candidates)[0], "acc-b");

    std::env::remove_var(ROUTE_HEALTH_P2C_ENABLED_ENV);
    std::env::remove_var(ROUTE_HEALTH_P2C_ORDERED_WINDOW_ENV);
    std::env::remove_var(ROUTE_STRATEGY_ENV);
    reload_from_env();
}

#[test]
fn balanced_mode_keeps_strict_round_robin_by_default() {
    let _guard = route_strategy_test_guard();
    let _quality_guard = super::super::route_quality::route_quality_test_guard();
    let prev_strategy = std::env::var(ROUTE_STRATEGY_ENV).ok();
    let prev_p2c = std::env::var(ROUTE_HEALTH_P2C_ENABLED_ENV).ok();
    let prev_balanced_window = std::env::var(ROUTE_HEALTH_P2C_BALANCED_WINDOW_ENV).ok();

    std::env::set_var(ROUTE_HEALTH_P2C_ENABLED_ENV, "1");
    std::env::remove_var(ROUTE_HEALTH_P2C_BALANCED_WINDOW_ENV);
    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    reload_from_env();
    clear_route_state_for_tests();

    for _ in 0..4 {
        super::super::route_quality::record_route_quality("acc-a", 429);
        super::super::route_quality::record_route_quality("acc-b", 200);
    }

    let mut first = candidate_list();
    apply_route_strategy(&mut first, "gk-strict-default", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&first)[0], "acc-a");

    let mut second = candidate_list();
    apply_route_strategy(&mut second, "gk-strict-default", Some("gpt-5.3-codex"));
    assert_eq!(account_ids(&second)[0], "acc-b");

    if let Some(value) = prev_strategy {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    if let Some(value) = prev_p2c {
        std::env::set_var(ROUTE_HEALTH_P2C_ENABLED_ENV, value);
    } else {
        std::env::remove_var(ROUTE_HEALTH_P2C_ENABLED_ENV);
    }
    if let Some(value) = prev_balanced_window {
        std::env::set_var(ROUTE_HEALTH_P2C_BALANCED_WINDOW_ENV, value);
    } else {
        std::env::remove_var(ROUTE_HEALTH_P2C_BALANCED_WINDOW_ENV);
    }
    reload_from_env();
}

#[test]
fn manual_preferred_account_is_preserved_when_current_candidates_do_not_include_it() {
    let _guard = route_strategy_test_guard();
    clear_route_state_for_tests();
    set_manual_preferred_account("acc-missing").expect("set manual preferred");

    let mut candidates = candidate_list();
    apply_route_strategy(&mut candidates, "gk-manual-missing", Some("gpt-5.3-codex"));

    assert_eq!(
        get_manual_preferred_account().as_deref(),
        Some("acc-missing")
    );
    assert_eq!(account_ids(&candidates)[0], "acc-a");
}

#[test]
fn free_preferred_models_keep_free_accounts_at_route_head() {
    let _guard = route_strategy_test_guard();
    let _runtime_guard = gateway_runtime_test_guard();
    let prev_strategy = std::env::var(ROUTE_STRATEGY_ENV).ok();
    let prev_preferred = std::env::var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS").ok();

    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    std::env::set_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS", "gpt-5.4-mini");
    reload_runtime_config_from_env();
    clear_route_state_for_tests();

    let template = vec![
        candidate_with_plan("acc-paid-a", 0, "plus"),
        candidate_with_plan("acc-free-a", 1, "free"),
        candidate_with_plan("acc-free-b", 2, "free"),
    ];

    let mut first = template.clone();
    apply_route_strategy(&mut first, "gk-free-priority", Some("gpt-5.4-mini"));
    assert_eq!(
        account_ids(&first),
        vec![
            "acc-free-a".to_string(),
            "acc-free-b".to_string(),
            "acc-paid-a".to_string()
        ]
    );

    let mut second = template;
    apply_route_strategy(&mut second, "gk-free-priority", Some("gpt-5.4-mini"));
    assert_eq!(
        account_ids(&second),
        vec![
            "acc-free-b".to_string(),
            "acc-free-a".to_string(),
            "acc-paid-a".to_string()
        ]
    );

    if let Some(value) = prev_strategy {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    if let Some(value) = prev_preferred {
        std::env::set_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS", value);
    } else {
        std::env::remove_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS");
    }
    reload_runtime_config_from_env();
}

#[test]
fn free_preferred_models_treat_snapshot_detected_free_accounts_as_free() {
    let _guard = route_strategy_test_guard();
    let _runtime_guard = gateway_runtime_test_guard();
    let prev_strategy = std::env::var(ROUTE_STRATEGY_ENV).ok();
    let prev_preferred = std::env::var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS").ok();

    std::env::set_var(ROUTE_STRATEGY_ENV, "balanced");
    std::env::set_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS", "gpt-5.4-mini");
    reload_runtime_config_from_env();
    clear_route_state_for_tests();

    let template = vec![
        candidate_with_plan("acc-paid-a", 0, "plus"),
        (
            Account {
                id: "acc-free-snapshot".to_string(),
                label: "".to_string(),
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
                account_id: "acc-free-snapshot".to_string(),
                id_token: "".to_string(),
                access_token: "".to_string(),
                refresh_token: "".to_string(),
                api_key_access_token: None,
                last_refresh: 0,
            },
        ),
    ];
    let storage = storage_with_candidates(&template);
    storage
        .insert_usage_snapshot(&UsageSnapshotRecord {
            account_id: "acc-free-snapshot".to_string(),
            used_percent: Some(10.0),
            window_minutes: Some(300),
            resets_at: None,
            secondary_used_percent: Some(20.0),
            secondary_window_minutes: Some(10_080),
            secondary_resets_at: None,
            credits_json: Some(r#"{"planType":"free"}"#.to_string()),
            captured_at: now_ts(),
        })
        .expect("insert usage snapshot");

    let mut candidates = template;
    apply_route_strategy_with_storage(
        Some(&storage),
        &mut candidates,
        "gk-free-snapshot",
        Some("gpt-5.4-mini"),
    );

    assert_eq!(
        account_ids(&candidates),
        vec!["acc-free-snapshot".to_string(), "acc-paid-a".to_string(),]
    );

    if let Some(value) = prev_strategy {
        std::env::set_var(ROUTE_STRATEGY_ENV, value);
    } else {
        std::env::remove_var(ROUTE_STRATEGY_ENV);
    }
    if let Some(value) = prev_preferred {
        std::env::set_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS", value);
    } else {
        std::env::remove_var("CODEXMANAGER_FREE_ACCOUNT_PREFERRED_MODELS");
    }
    reload_runtime_config_from_env();
}
