#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct OutgoingSessionAffinity<'a> {
    pub(crate) incoming_session_id: Option<&'a str>,
    pub(crate) incoming_client_request_id: Option<&'a str>,
    pub(crate) incoming_turn_state: Option<&'a str>,
    pub(crate) fallback_session_id: Option<&'a str>,
}

fn normalize_anchor(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

pub(crate) fn has_thread_anchor_conflict(
    conversation_id: Option<&str>,
    prompt_cache_key: Option<&str>,
) -> bool {
    match (
        normalize_anchor(conversation_id),
        normalize_anchor(prompt_cache_key),
    ) {
        (Some(conversation_id), Some(prompt_cache_key)) => conversation_id != prompt_cache_key,
        _ => false,
    }
}

pub(crate) fn log_thread_anchor_conflict(
    context: &str,
    account_id: Option<&str>,
    conversation_id: Option<&str>,
    prompt_cache_key: Option<&str>,
) {
    let Some(conversation_id) = normalize_anchor(conversation_id) else {
        return;
    };
    let Some(prompt_cache_key) = normalize_anchor(prompt_cache_key) else {
        return;
    };
    if !has_thread_anchor_conflict(Some(conversation_id), Some(prompt_cache_key)) {
        return;
    }

    log::warn!(
        "event=gateway_thread_anchor_conflict context={} account_id={} conversation_fp={} prompt_cache_key_fp={} effective_source=prompt_cache_key",
        context,
        account_id.unwrap_or("-"),
        super::anchor_fingerprint::fingerprint_anchor(conversation_id),
        super::anchor_fingerprint::fingerprint_anchor(prompt_cache_key),
    );
}

pub(crate) fn derive_primary_outgoing_session_affinity<'a>(
    incoming_session_id: Option<&'a str>,
    incoming_client_request_id: Option<&'a str>,
    incoming_turn_state: Option<&'a str>,
    conversation_id: Option<&'a str>,
    prompt_cache_key: Option<&'a str>,
    is_compact_request: bool,
) -> OutgoingSessionAffinity<'a> {
    let conversation_anchor = normalize_anchor(conversation_id);
    let prompt_cache_key = normalize_anchor(prompt_cache_key);
    let effective_thread_anchor = if is_compact_request {
        conversation_anchor
    } else {
        prompt_cache_key.or(conversation_anchor)
    };

    let mut resolved_incoming_session_id = incoming_session_id;
    let mut resolved_turn_state = incoming_turn_state;
    let resolved_client_request_id = if is_compact_request {
        incoming_client_request_id
    } else {
        effective_thread_anchor.or(incoming_client_request_id)
    };

    if effective_thread_anchor.is_some() {
        resolved_incoming_session_id = None;
    }
    if resolved_turn_state.is_some() && incoming_session_id.is_none() && prompt_cache_key.is_none()
    {
        // 中文注释：没有稳定线程锚点时，不透传孤儿 turn-state，避免把请求粘到历史线程。
        resolved_turn_state = None;
    }
    if let (Some(prompt_cache_key), Some(legacy_session_id)) = (prompt_cache_key, incoming_session_id)
    {
        if legacy_session_id.trim() != prompt_cache_key {
            // 中文注释：请求体中的线程锚点已经覆盖旧 session 时，turn-state 也必须同步失效。
            resolved_turn_state = None;
        }
    }

    OutgoingSessionAffinity {
        incoming_session_id: resolved_incoming_session_id,
        incoming_client_request_id: resolved_client_request_id,
        incoming_turn_state: resolved_turn_state,
        fallback_session_id: effective_thread_anchor,
    }
}

pub(crate) fn derive_fallback_outgoing_session_affinity<'a>(
    incoming_session_id: Option<&'a str>,
    incoming_client_request_id: Option<&'a str>,
    incoming_turn_state: Option<&'a str>,
    conversation_id: Option<&'a str>,
    prompt_cache_key: Option<&'a str>,
) -> OutgoingSessionAffinity<'a> {
    let conversation_anchor = normalize_anchor(conversation_id);
    let prompt_cache_key = normalize_anchor(prompt_cache_key);
    let effective_thread_anchor = prompt_cache_key.or(conversation_anchor);

    let mut resolved_incoming_session_id = incoming_session_id;
    let mut resolved_turn_state = incoming_turn_state;

    if prompt_cache_key.is_some() {
        resolved_incoming_session_id = None;
    }
    if conversation_anchor.is_some() {
        resolved_incoming_session_id = None;
    }
    if resolved_turn_state.is_some()
        && incoming_session_id.is_none()
        && effective_thread_anchor.is_none()
    {
        // 中文注释：fallback 分支同样不信任没有锚点的 turn-state。
        resolved_turn_state = None;
    }
    if let (Some(thread_anchor), Some(legacy_session_id)) =
        (effective_thread_anchor, incoming_session_id)
    {
        if legacy_session_id.trim() != thread_anchor {
            resolved_turn_state = None;
        }
    }

    OutgoingSessionAffinity {
        incoming_session_id: resolved_incoming_session_id,
        incoming_client_request_id,
        incoming_turn_state: resolved_turn_state,
        fallback_session_id: effective_thread_anchor,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        derive_fallback_outgoing_session_affinity, derive_primary_outgoing_session_affinity,
        has_thread_anchor_conflict,
    };

    #[test]
    fn primary_affinity_uses_thread_anchor_for_session_and_request_id() {
        let actual = derive_primary_outgoing_session_affinity(
            Some("legacy_session_should_not_win"),
            Some("legacy_request_id_should_not_win"),
            Some("legacy_turn_state_should_not_win"),
            Some("conversation_anchor"),
            Some("prompt_thread_anchor"),
            false,
        );

        assert_eq!(actual.incoming_session_id, None);
        assert_eq!(actual.incoming_client_request_id, Some("prompt_thread_anchor"));
        assert_eq!(actual.incoming_turn_state, None);
        assert_eq!(actual.fallback_session_id, Some("prompt_thread_anchor"));
    }

    #[test]
    fn primary_affinity_drops_orphan_turn_state_without_prompt_cache_anchor() {
        let actual = derive_primary_outgoing_session_affinity(
            None,
            Some("explicit_client_request_id"),
            Some("turn_state_ok"),
            Some("conversation_anchor"),
            None,
            false,
        );

        assert_eq!(actual.incoming_session_id, None);
        assert_eq!(actual.incoming_client_request_id, Some("conversation_anchor"));
        assert_eq!(actual.incoming_turn_state, None);
        assert_eq!(actual.fallback_session_id, Some("conversation_anchor"));
    }

    #[test]
    fn fallback_affinity_uses_conversation_anchor_without_inventing_request_id() {
        let actual = derive_fallback_outgoing_session_affinity(
            Some("legacy_session_should_not_win"),
            Some("legacy_request_id_should_not_win"),
            Some("legacy_turn_state_should_not_win"),
            Some("conv_anchor_only"),
            None,
        );

        assert_eq!(actual.incoming_session_id, None);
        assert_eq!(
            actual.incoming_client_request_id,
            Some("legacy_request_id_should_not_win")
        );
        assert_eq!(actual.incoming_turn_state, None);
        assert_eq!(actual.fallback_session_id, Some("conv_anchor_only"));
    }

    #[test]
    fn fallback_affinity_drops_orphan_turn_state_without_any_anchor() {
        let actual = derive_fallback_outgoing_session_affinity(
            None,
            Some("explicit_client_request_id"),
            Some("turn_state_ok"),
            None,
            None,
        );

        assert_eq!(actual.incoming_session_id, None);
        assert_eq!(
            actual.incoming_client_request_id,
            Some("explicit_client_request_id")
        );
        assert_eq!(actual.incoming_turn_state, None);
        assert_eq!(actual.fallback_session_id, None);
    }

    #[test]
    fn conflict_detection_matches_anchor_mismatch() {
        assert!(has_thread_anchor_conflict(
            Some("conversation_anchor"),
            Some("prompt_thread_anchor")
        ));
        assert!(!has_thread_anchor_conflict(
            Some("conversation_anchor"),
            Some("conversation_anchor")
        ));
        assert!(!has_thread_anchor_conflict(Some("conversation_anchor"), None));
    }
}
