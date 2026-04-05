# 前端工程规范

本文档说明了 Next.js 前端的架构约束与编码规范。

## 1. 技术栈

* **框架**：Next.js 14+（App Router）
* **语言**：TypeScript（严格模式）+ 简体中文。
* **样式**：Tailwind CSS v4
* **UI 组件**：shadcn/ui（基于 @base-ui/react）
* **状态管理**：Zustand
* **数据获取**：TanStack Query（React Query）v5
* **运行时**：Tauri v2

## 2. 设计语言：Glassmorphism 与主题

* **环境背景**：使用 `globals.css` 中定义的高饱和网格渐变背景，并与当前激活主题保持同步。
* **玻璃材质**：

  * 导航栏使用 `.glass-sidebar`
  * 顶栏使用 `.glass-header`
  * 主内容容器使用 `.glass-card`
* **性能模式**：始终遵循 `body` 上的 `low-transparency` 类。当该模式启用时，所有模糊与渐变效果都**必须**禁用，改用纯色（`var(--card-solid)`）。
* **主题**：通过 `next-themes` 支持全部 12 个核心主题（如 Enterprise Blue、Pure Black、Dark One 等）。

## 3. 组件规范

* **逻辑分离**：保持组件“无业务逻辑化”，将复杂逻辑抽离到自定义 Hook 中（例如 `useAccounts`、`useDashboardStats`）。
* **语义化 HTML**：避免嵌套 `<button>` 元素。对于触发器（如 `DropdownMenuTrigger`），使用 `render={<span />}` 和 `nativeButton={false}`，以在不破坏 HTML 规范的前提下保持可访问性。
* **客户端组件**：交互式组件请标记 `"use client"`。静态布局优先使用服务端组件。

## 4. API 与 IPC 规范

* **传输方式**：使用 `@/lib/api/transport` 中集中封装的 `invoke` 和 `invokeFirst` 辅助方法。
* **参数寻址**：面向已启动服务的 RPC 调用默认使用 `withAddr()` 注入地址；启动、连接、初始化等生命周期命令按调用场景显式传递 `addr`。
* **错误处理**：在传输层统一处理业务错误解包，以显示一致的 toast 通知。
* **IPC 禁止使用 Fetch**：在桌面环境中，不要使用 `fetch()` 调用后端命令；应使用 Tauri 原生 `invoke` 以获得最佳可靠性与性能。

## 5. 目录结构

* `app/`：路由与页面布局
* `components/ui/`：原子级 shadcn 组件
* `components/modals/`：功能级对话框
* `hooks/`：业务逻辑 Hook
* `lib/api/`：类型化后端客户端封装
* `store/`：Zustand 全局状态仓库
* `types/`：共享 TypeScript 接口

## 6. Copilot开发工作流

### 6.1 目标

* **一次对话闭环**：默认以 1 次对话内完成“并行扫描 -> 实施改动 -> 跨层同步 -> 验证结果 -> 汇总结论”为目标；除非遇到需求冲突、不可逆操作、缺少外部凭据或真实阻塞，否则不要把中间方案回抛给用户等待确认。
* **优先读代码，不优先提问**：仓库中已有答案的问题，优先通过代码、脚本、测试和现有实现自行确认，减少来回追问与额度消耗。
* **优先复用现有模式**：新增页面、Hook、IPC 命令、RPC 接口、配置项或数据结构时，先查现有同类实现，再做最小必要改动，避免无关重构。

### 6.2 默认执行顺序

1. **并行扫描直接相关层级**：前端优先看 `apps/src/app`、`apps/src/components`、`apps/src/hooks`、`apps/src/lib/api`、`apps/src/lib/store`、`apps/src/lib/runtime`；桌面桥接优先看 `apps/src-tauri/src/commands`、`apps/src-tauri/src/commands/registry.rs`、`apps/src-tauri/src/service_runtime.rs`、`apps/src-tauri/src/rpc_client`；服务端优先看 `crates/core`、`crates/service`、`crates/start`、`crates/web`；构建入口优先看 `apps/package.json`、根 `Cargo.toml` 与 `scripts/README.md`。
2. **确定联动范围**：先找与当前需求最接近的现有实现，明确是否会同时影响前端页面、Tauri 命令、`lib/api`、Rust 服务、数据库迁移、配置读写或构建脚本。
3. **直接落地最小改动**：需求已明确时直接修改，不先输出长方案等待确认；不做与用户目标无关的重命名、重构、样式翻新或目录整理。
4. **主动完成跨层同步**：不能只改一层；凡是新增命令、字段、配置或返回结构，必须把上下游一起补齐。
5. **按改动范围执行最小充分验证**：先跑必要校验，再决定是否补跑高成本测试，避免无差别全量执行。
6. **交付时给结论，不灌水**：总结已完成项、验证结果、剩余风险和下一步建议，不重复输出大段过程性描述。

### 6.3 Copilot 自定义资产与调用

* **仓库级总规则**：根 `AGENTS.md` 继续作为仓库规范与协作约束的总入口；Copilot 的路径级行为约束下沉到 `.github/instructions/*.instructions.md`，角色化工作流放到 `.github/agents`、`.github/skills`、`.github/hooks` 与 `.github/scripts`。
* **Path instructions**：前端命中 `.github/instructions/frontend-stack.instructions.md`；Tauri / transport 命中 `.github/instructions/tauri-rpc.instructions.md`；Rust gateway / core 命中 `.github/instructions/rust-gateway.instructions.md`。
* **Custom agents**：
  * `codexmanager-autoloop`：VS Code Agent Mode 的主入口；负责读取上下文、实施最小改动、触发验证、调用 reviewer、决定是否继续下一轮。默认不主动播报代码完成进度，而是以验证与审查证据驱动收敛。
  * `code-reviewer`：全仓分片审查协调者；负责把仓库拆成固定分片、汇总 findings，并给出是否继续迭代的结论。
  * `loop-operator`：当验证反复失败、review findings 重复出现或修复范围持续扩张时介入，帮助缩小步长并恢复收敛。
  * `review-frontend`、`review-tauri`、`review-core`、`review-service`、`review-meta`：隐藏分片 reviewer，只通过 `code-reviewer` 调用。
* **Skills 分层**：
  * `sp-*`：主骨架技能，承载 `brainstorming -> writing-plans -> implement -> verify -> review -> decide-next-loop` 主链路。
  * `ecc-*`：ECC 辅助技能，只负责循环控制、验证辅助与仓库检索，不取代主骨架。
  * `pro-*`：可扩展专业技能层；`pro-ui-ux-pro-max` 是当前首个 UI/UX 专业技能，未来可继续增加 `pro-security-*`、`pro-api-*` 等。
* **Hooks / Scripts / State**：
  * `.github/hooks/autoloop.json` 负责轻量触发与约束。
  * `.github/scripts/verify/*` 负责最小充分验证矩阵。
  * `.github/scripts/review/*` 负责审查分片、上下文准备与结果聚合。
  * `.github/scripts/loop/*` 负责脏状态记录与下一步判定。
  * `.github/review-state/*` 仅保存会话期验证、审查与决策状态，不作为长期文档。
* **当前方案不引入 MCP**：不要再依赖 `.vscode/mcp.json`、`context7Docs/*`、`uiTesting/*` 或其他用户级 MCP 作为这套闭环的前提条件。

### 6.4 仓库级硬约束

* **前端约束**：交互组件必须正确标记 `"use client"`；复杂业务逻辑下沉到自定义 Hook；避免嵌套 `<button>`；保持 12 个主题与 Glassmorphism 设计语言一致；`body.low-transparency` 启用时必须关闭模糊与渐变并回退纯色。
* **IPC / Tauri 约束**：桌面端通信统一通过 `@/lib/api/transport` 中的 `invoke` / `invokeFirst` 发起；面向已启动服务的 RPC 命令默认经 `withAddr()` 注入地址，启动、连接、初始化等生命周期命令按场景显式传递 `addr`；只有需要兼容 Web fallback 或浏览器环境的命令，才同步 `apps/src/lib/api/transport.ts` 中的 `WEB_COMMAND_MAP`；新增 Tauri 命令时必须同步 `apps/src-tauri/src/commands/registry.rs`、对应的 `*-client.ts`，以及必要的 `normalize.ts` / 类型定义；Tauri 命令优先统一返回 `Result<..., String>`，既有轻量同步命令可保留当前风格，新增或重构时按阻塞模型选择同步或异步实现，长耗时任务使用 `spawn_blocking`，禁止在命令链路里 `panic!`、`unwrap()` 和直接 `fetch()`。
* **Rust 核心 / 服务约束**：涉及账号池、平台 Key、网关转发、监听地址、SQLite、配置读写、OpenAI/Codex 兼容接口、认证鉴权、日志脱敏、错误传播和资源释放时，必须先检查现有实现与相关测试；敏感信息不得明文落库或明文日志；新增敏感字段要同步加密路径；配置改动要同时核对快照值与 effective 值；状态流转、协议兼容和日志链路不能被静默破坏。

### 6.5 验证策略

* **默认必做**：前端页面、组件、`lib/api` 或静态导出相关改动后，在 `apps/` 目录执行 `pnpm run build:desktop`。
* **按需补充**：前端局部修改可先执行 `pnpm run lint`；Tauri 桥接层、命令注册、`rpc_client` 或 `service_runtime` 改动在 `apps/src-tauri/` 执行 `cargo test`；`crates/core` 或 `crates/service` 改动至少在仓库根执行 `cargo build -p codexmanager-core -p codexmanager-service`；涉及服务逻辑、协议、配置、账号或密钥行为时，再执行 `cargo test -p codexmanager-service --quiet`；若同时改动前端与 Tauri，两侧校验都要执行。
* **协议专项验证**：涉及网关转发、OpenAI/Codex 协议兼容、流式响应、tool calls 或探针行为时，优先运行 `scripts/tests/gateway_regression_suite.ps1`。
* **高成本命令默认不主动运行**：`cargo test --all` 和各类 release 脚本仅在用户明确要求、做全量回归或发布前再使用。
* **网络命令**：在 Windows 上执行任何联网操作前，先继承与系统一致的代理环境变量，避免 TLS 握手失败。

### 6.6 审查与沉淀

* **默认自审**：修改完成后，先以严格代码审查标准自查，优先识别真实缺陷、功能回归、协议兼容性、安全风险、边界条件遗漏、状态一致性问题、错误处理缺失和构建风险，而不是样式问题。
* **输出规则**：当用户请求 review 或任务本身要求审查时，结果必须先列 findings，并按严重级别排序；每条包含文件路径、行号、问题原因、潜在影响和建议修复；若无明确问题，明确写出 `no findings`，再补充剩余风险、验证盲区和建议补测项。
* **审查记录**：当执行全量审查且拥有文件写入权限时，将审查结果保存到 `docs/CodeReview/` 下，按已有文档数字顺序递增创建新文件。
* **注释要求**：仅在用户明确要求注释治理，或当前改动触及复杂逻辑且确实需要解释时，才补充或转换中文注释；不要为未触及文件做大规模注释清扫。

### 6.7 安装边界

* **`.github/agents`**：放角色化 agent，`codexmanager-autoloop`、`code-reviewer`、`loop-operator` 为主入口；隐藏 reviewer 仅做分片审查。
* **`.github/skills`**：放可复用工作流，目录名与 `SKILL.md` 的 `name` 保持一致；按 `sp-*`、`ecc-*`、`pro-*` 分层扩展。
* **`.github/instructions`**：放 path-specific instructions，用 `applyTo` 精确命中，不滥用 `**`。
* **`.github/hooks`**：放轻量 hook 配置，只做触发、守卫和状态推进。
* **`.github/scripts`**：放 hook、验证、审查和循环控制脚本；复杂逻辑放脚本，不塞进 hook JSON。
* **`.github/review-state`**：放会话期 JSON 状态与分片审查结果，并通过 `.gitignore` 忽略运行时产物。
* **根 `AGENTS.md`**：继续保留仓库级总规则与优先级，不再引入额外 workspace-level MCP 安装依赖。

## 7. 已知问题

* **代理**：在 Windows 系统上执行任何涉及网络的操作时，应当先设置与系统代理相同的环境变量，避免出现TLS握手失败的情况。
