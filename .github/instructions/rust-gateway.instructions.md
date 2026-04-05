---
applyTo: "crates/core/**/*.rs,crates/service/**/*.rs,crates/start/**/*.rs,crates/web/**/*.rs,Cargo.toml"
---

# Rust 网关与核心约束

- 触及账号池、平台 Key、网关转发、监听地址、SQLite、配置读写、OpenAI/Codex 协议兼容、认证鉴权、日志脱敏或资源释放前，先查现有实现与相关测试。
- 敏感信息不得明文落库或明文日志；新增敏感字段时同步补齐加密、脱敏和错误传播路径。
- 配置改动同时核对快照值与 effective 值，避免只改加载侧或只改持久化侧。
- 不要静默破坏状态流转、协议兼容和日志链路；发现行为差异时优先补验证而不是猜测通过。
- `crates/core` / `crates/service` 改动至少执行根目录 `cargo build -p codexmanager-core -p codexmanager-service`；涉及服务逻辑再补 `cargo test -p codexmanager-service --quiet`；若命中网关协议，再运行 `scripts/tests/gateway_regression_suite.ps1`。
