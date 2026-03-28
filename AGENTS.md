# 前端工程规范

本文档说明了 Next.js 前端的架构约束与编码规范。

## 1. 技术栈

* **框架**：Next.js 14+（App Router）
* **语言**：TypeScript（严格模式）
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
* **主题**：通过 `next-themes` 支持全部 11 个核心主题（如 Enterprise Blue、Pure Black、Dark One 等）。

## 3. 组件规范

* **逻辑分离**：保持组件“无业务逻辑化”，将复杂逻辑抽离到自定义 Hook 中（例如 `useAccounts`、`useDashboardStats`）。
* **语义化 HTML**：避免嵌套 `<button>` 元素。对于触发器（如 `DropdownMenuTrigger`），使用 `render={<span />}` 和 `nativeButton={false}`，以在不破坏 HTML 规范的前提下保持可访问性。
* **客户端组件**：交互式组件请标记 `"use client"`。静态布局优先使用服务端组件。

## 4. API 与 IPC 规范

* **传输方式**：使用 `@/lib/api/transport` 中集中封装的 `invoke` 和 `invokeFirst` 辅助方法。
* **参数寻址**：始终使用 `withAddr()` 包装 IPC 参数，确保后端服务地址被正确注入。
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

## 6. 开发工作流

* **验证**：每一次重要改动都必须通过 `pnpm run build:desktop` 进行验证，以确保静态导出兼容性。
* **同步**：所有新的后端命令都必须添加到 `lib/api/` 中，并正确处理下划线命名与驼峰命名之间的映射。
* **审查**：作为此项目的严格代码审查者进行 review：这是一个基于 Rust workspace（`crates/core`、`crates/service`、`crates/start`、`crates/web`）+ Next.js 14 App Router + TypeScript 严格模式 + Tailwind CSS v4 + shadcn/ui + Zustand + TanStack Query v5 + Tauri v2 的本地桌面端与服务进程一体化 Codex 账号管理器和 OpenAI 兼容网关，请优先关注真实缺陷、功能回归、协议兼容性、安全风险、边界条件遗漏、状态一致性、错误处理缺失、测试不足、构建/发布风险，而不是代码风格；检查前端是否遵守项目规范：交互组件正确标记 `"use client"`、复杂业务逻辑已抽离到自定义 hooks、避免嵌套 `<button>`、涉及桌面端通信时必须统一使用 `@/lib/api/transport` 中的 `invoke`/`invokeFirst` 且 IPC 参数必须经 `withAddr()` 包装、禁止使用 `fetch()` 调用桌面后端、传输层是否统一解包业务错误并保持一致 toast 行为、是否兼容既有 11 个主题与 Glassmorphism 设计语言、`body.low-transparency` 启用时是否彻底关闭模糊与渐变并回退纯色、是否破坏现有可访问性与视觉一致性；重点检查后端与 Rust 侧是否正确处理账号池、平台 Key、网关转发、监听地址、代理、SQLite/配置读写、OpenAI/Codex 兼容接口、认证鉴权、输入校验、日志脱敏、错误传播、资源释放与异常场景；同时核对新增后端命令是否同步接入 `lib/api/` 并正确处理下划线与驼峰映射，是否违反不可变数据原则、是否引入硬编码或秘密泄露、是否影响静态导出与 Tauri 桌面构建，并结合项目要求关注 `pnpm run build:desktop` 可通过性；输出时请先列出 findings 并按严重级别排序，每条都包含文件路径、行号、问题原因、潜在影响和建议修复，若没有明确问题则明确写出 `no findings`，并补充剩余风险、验证盲区和建议补测项；在Windows 系统上执行任何涉及网络的操作时，应当先设置与系统代理相同的环境变量，避免出现TLS握手失败的情况。使用中文说明审查结果。确保全量审查所有代码，而不仅仅是某次变更。


## 7. 已知部分问题

* **代理**：在 Windows 系统上执行任何涉及网络的操作时，应当先设置与系统代理相同的环境变量，避免出现TLS握手失败的情况。