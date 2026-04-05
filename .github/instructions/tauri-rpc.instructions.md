---
applyTo: "apps/src-tauri/**/*.rs,apps/src/lib/api/**/*.ts,apps/src/lib/runtime/**/*.ts"
---

# Tauri 与 RPC 约束

- 新增或调整 Tauri 命令时，同时检查 `apps/src-tauri/src/commands/registry.rs`、对应 `*-client.ts`、必要的 `normalize.ts` 与类型定义，避免桥接层半同步。
- 面向已启动服务的 RPC 调用默认沿用 `withAddr()` 注入地址；启动、连接、初始化等生命周期命令再按场景显式传 `addr`。
- 仅当命令确实需要浏览器 / Web fallback 时，才同步更新 `WEB_COMMAND_MAP`。
- Tauri 命令优先统一返回 `Result<..., String>`；长耗时任务走 `spawn_blocking`，不要在命令链路里 `panic!`、`unwrap()` 或直接走网络 `fetch()`。
- 变更桥接层、命令注册、`rpc_client` 或 `service_runtime` 后，至少执行 `apps/src-tauri/` 下的 `cargo test`；若同时影响前端，再补 `pnpm run build:desktop`。
