use std::sync::Mutex;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use crate::app_storage::apply_runtime_storage_env;
use crate::rpc_client::{normalize_addr, rpc_call};

const CONNECTED_SERVICE_ADDR_ENV: &str = "CODEXMANAGER_CONNECTED_SERVICE_ADDR";

pub(super) fn validate_initialize_response(v: &serde_json::Value) -> Result<(), String> {
    // 连接探测必须确认对端确实是 codexmanager-service，避免端口被其他服务占用时误判“已连接”。
    let server_name = v
        .get("result")
        .and_then(|r| r.get("server_name"))
        .and_then(|s| s.as_str())
        .unwrap_or("");
    if server_name == "codexmanager-service" {
        return Ok(());
    }

    let hint = if server_name.is_empty() {
        "missing server_name"
    } else {
        server_name
    };
    Err(format!(
        "Port is in use or unexpected service responded ({hint})"
    ))
}

pub(super) fn spawn_service_with_addr(
    app: &tauri::AppHandle,
    bind_addr: &str,
    connect_addr: &str,
) -> Result<(), String> {
    if std::env::var("CODEXMANAGER_NO_SERVICE").is_ok() {
        return Ok(());
    }

    apply_runtime_storage_env(app);

    std::env::set_var("CODEXMANAGER_SERVICE_ADDR", bind_addr);
    codexmanager_service::clear_shutdown_flag();

    let bind_addr = bind_addr.to_string();
    let connect_addr = connect_addr.to_string();
    let thread_addr = bind_addr.clone();
    log::info!(
        "service starting at {} (local rpc {})",
        bind_addr,
        connect_addr
    );
    let handle = thread::spawn(move || {
        if let Err(err) = codexmanager_service::start_server(&thread_addr) {
            log::error!("service stopped: {}", err);
        }
    });
    set_service_runtime(ServiceRuntime {
        addr: connect_addr,
        join: handle,
    });
    Ok(())
}

pub(super) fn remember_connected_service_addr(addr: &str) {
    if let Ok(normalized) = normalize_addr(addr) {
        std::env::set_var(CONNECTED_SERVICE_ADDR_ENV, normalized);
    }
}

struct ServiceRuntime {
    addr: String,
    join: thread::JoinHandle<()>,
}

static SERVICE_RUNTIME: OnceLock<Mutex<Option<ServiceRuntime>>> = OnceLock::new();

fn set_service_runtime(runtime: ServiceRuntime) {
    let slot = SERVICE_RUNTIME.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        *guard = Some(runtime);
    }
}

fn take_service_runtime() -> Option<ServiceRuntime> {
    let slot = SERVICE_RUNTIME.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        guard.take()
    } else {
        None
    }
}

pub(super) fn stop_service() {
    if let Some(runtime) = take_service_runtime() {
        log::info!("service stopping at {}", runtime.addr);
        codexmanager_service::request_shutdown(&runtime.addr);
        thread::spawn(move || {
            let _ = runtime.join.join();
        });
        return;
    }

    let Some(addr) = std::env::var(CONNECTED_SERVICE_ADDR_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return;
    };

    log::info!("service stopping at {}", addr);
    codexmanager_service::request_shutdown(&addr);
}

pub(super) fn wait_for_service_ready(
    addr: &str,
    retries: usize,
    delay: Duration,
) -> Result<(), String> {
    let mut last_err = "service bootstrap check failed".to_string();
    for attempt in 0..=retries {
        match rpc_call("initialize", Some(addr.to_string()), None) {
            Ok(v) => match validate_initialize_response(&v) {
                Ok(()) => return Ok(()),
                Err(err) => last_err = err,
            },
            Err(err) => {
                last_err = err;
            }
        }
        if attempt < retries {
            std::thread::sleep(delay);
        }
    }
    Err(last_err)
}

#[cfg(test)]
mod tests {
    use super::{stop_service, CONNECTED_SERVICE_ADDR_ENV};
    use std::io::Read;
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::time::Duration;

    struct EnvGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: Option<&str>) -> Self {
            let previous = std::env::var(key).ok();
            match value {
                Some(value) => std::env::set_var(key, value),
                None => std::env::remove_var(key),
            }
            Self { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            if let Some(previous) = self.previous.as_deref() {
                std::env::set_var(self.key, previous);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    #[test]
    fn stop_service_requests_shutdown_for_connected_addr_without_local_runtime() {
        codexmanager_service::clear_shutdown_flag();
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind listener");
        let addr = listener.local_addr().expect("listener addr").to_string();
        let _guard = EnvGuard::set(CONNECTED_SERVICE_ADDR_ENV, Some(&addr));
        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept shutdown request");
            let mut buffer = [0u8; 512];
            let read = stream.read(&mut buffer).expect("read shutdown request");
            tx.send(String::from_utf8_lossy(&buffer[..read]).to_string())
                .expect("send captured request");
        });

        stop_service();

        let request = rx
            .recv_timeout(Duration::from_secs(1))
            .expect("shutdown request");
        assert!(request.contains("GET /__shutdown HTTP/1.1"));
        codexmanager_service::clear_shutdown_flag();
    }
}
