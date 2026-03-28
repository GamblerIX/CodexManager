use crate::app_storage::apply_runtime_storage_env;
use crate::rpc_client::{normalize_addr, rpc_call};
use crate::service_runtime::{
    remember_connected_service_addr, spawn_service_with_addr, stop_service,
    validate_initialize_response, wait_for_service_ready,
};

const SERVICE_READY_RETRIES: usize = 40;
const SERVICE_READY_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(250);

#[tauri::command]
pub async fn service_initialize(
    app: tauri::AppHandle,
    addr: Option<String>,
) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    let service_addr = addr.as_deref().map(normalize_addr).transpose()?;
    let rpc_addr = service_addr.clone();
    let v = tauri::async_runtime::spawn_blocking(move || rpc_call("initialize", rpc_addr, None))
        .await
        .map_err(|err| format!("initialize task failed: {err}"))??;
    validate_initialize_response(&v)?;
    if let Some(service_addr) = service_addr.as_deref() {
        remember_connected_service_addr(service_addr);
    }
    Ok(v)
}

#[tauri::command]
pub async fn service_start(app: tauri::AppHandle, addr: String) -> Result<(), String> {
    let connect_addr = normalize_addr(&addr)?;
    apply_runtime_storage_env(&app);
    let bind_addr = codexmanager_service::listener_bind_addr(&connect_addr);
    tauri::async_runtime::spawn_blocking(move || {
        log::info!(
            "service_start requested connect_addr={} bind_addr={}",
            connect_addr,
            bind_addr
        );
        std::env::set_var("CODEXMANAGER_SERVICE_ADDR", &bind_addr);
        stop_service();
        spawn_service_with_addr(&app, &bind_addr, &connect_addr)?;
        wait_for_service_ready(
            &connect_addr,
            SERVICE_READY_RETRIES,
            SERVICE_READY_RETRY_DELAY,
        )
        .map(|_| remember_connected_service_addr(&connect_addr))
        .map_err(|err| {
            log::error!(
                "service health check failed at {} (bind {}): {}",
                connect_addr,
                bind_addr,
                err
            );
            stop_service();
            format!("service not ready at {connect_addr}: {err}")
        })
    })
    .await
    .map_err(|err| format!("service_start task failed: {err}"))?
}

#[tauri::command]
pub async fn service_stop(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_runtime_storage_env(&app);
        stop_service();
        Ok(())
    })
    .await
    .map_err(|err| format!("service_stop task failed: {err}"))?
}

#[tauri::command]
pub async fn service_rpc_token() -> Result<String, String> {
    Ok(codexmanager_service::rpc_auth_token().to_string())
}
