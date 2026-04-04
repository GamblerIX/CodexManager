# Copilot 仓库级自主迭代安装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Github\CodexManager\CodexManager` 中安装一套纯仓库级 GitHub Copilot 自定义资产，使 VS Code Agent Mode 与 Copilot CLI 能围绕 `superpowers` 主骨架自动执行“实现 -> 验证 -> 全仓审查 -> 下一轮修复”的闭环。

**Architecture:** 保留根目录 `AGENTS.md` 作为薄层常驻指令入口，把路径约束放到 `.github/instructions/`，把主工作流放到 `.github/skills/`，把入口与审查角色放到 `.github/agents/`，把自动化触发与状态持久化放到 `.github/hooks/`、`.github/scripts/` 与 `.github/review-state/`。Hooks 只负责轻量触发与卡口，真正的验证、分片审查和下一步决策统一由 PowerShell 脚本完成。

**Tech Stack:** Markdown、YAML frontmatter、JSON hooks、PowerShell 脚本、GitHub Copilot custom agents、GitHub Copilot agent skills、现有 `pnpm` / `cargo` / PowerShell 验证链。

---

> **实现修正说明：** 已批准的设计 spec 中关于 hooks 的两处表述需要在实现时按官方文档修正：
>
> 1. 仓库级 hooks 应实现为 `.github/hooks/` 下“任意命名的 JSON 配置文件”，而不是每个事件一个固定文件名。
> 2. 当前文档化支持的仓库级 hook 事件是 `sessionStart`、`sessionEnd`、`userPromptSubmitted`、`preToolUse`、`postToolUse`、`errorOccurred`，而不是 `agentStop` / `subagentStop`。
>
> 实现时以官方事件名与 `.github/hooks/autoloop.json` 为准，并在最后同步回写设计文档。

## File Structure

### Existing files to modify

- `AGENTS.md`
  - 收敛为薄层常驻指令，移除已弃用的 MCP 依赖描述与过细工作流细节，明确 `sp-*` / `ecc-*` / `pro-*` 优先级和 autoloop 硬约束。

### New instructions files

- `.github/instructions/frontend-stack.instructions.md`
  - 前端、主题、App Router、Tailwind、Hook 下沉、客户端组件等路径规则。
- `.github/instructions/tauri-rpc.instructions.md`
  - Tauri 命令、transport、`withAddr()`、`registry.rs`、`rpc_client` 同步规则。
- `.github/instructions/rust-gateway.instructions.md`
  - Rust core/service、网关协议、配置与日志安全规则。

### New agent files

- `.github/agents/codexmanager-autoloop.agent.md`
  - 用户可见的主入口 agent。
- `.github/agents/code-reviewer.agent.md`
  - 用户可见的全仓审查编排 agent。
- `.github/agents/loop-operator.agent.md`
  - 用户可见的循环卡顿处理 agent。
- `.github/agents/review-frontend.agent.md`
  - 隐藏的前端审查 shard agent。
- `.github/agents/review-tauri.agent.md`
  - 隐藏的 Tauri/transport 审查 shard agent。
- `.github/agents/review-core.agent.md`
  - 隐藏的 core 存储与 RPC 类型审查 shard agent。
- `.github/agents/review-service.agent.md`
  - 隐藏的 gateway/service 审查 shard agent。
- `.github/agents/review-meta.agent.md`
  - 隐藏的 scripts / docs / config 审查 shard agent。

### New skill files

- `.github/skills/sp-brainstorming/SKILL.md`
- `.github/skills/sp-writing-plans/SKILL.md`
- `.github/skills/sp-requesting-code-review/SKILL.md`
- `.github/skills/sp-verification-before-completion/SKILL.md`
- `.github/skills/sp-systematic-debugging/SKILL.md`
- `.github/skills/sp-test-driven-development/SKILL.md`
- `.github/skills/ecc-continuous-agent-loop/SKILL.md`
- `.github/skills/ecc-verification-loop/SKILL.md`
- `.github/skills/ecc-search-first/SKILL.md`
- `.github/skills/pro-ui-ux-pro-max/SKILL.md`
- `.github/skills/pro-ui-ux-pro-max/scripts/{core.py,design_system.py,search.py}`
- `.github/skills/pro-ui-ux-pro-max/data/*.csv`
- `.github/skills/pro-ui-ux-pro-max/data/stacks/*.csv`

### New state, hook, and script files

- `.github/review-state/.gitignore`
  - 保留目录但忽略运行时状态产物。
- `.github/hooks/autoloop.json`
  - 仓库级 hooks 配置，挂接 `sessionStart` / `preToolUse` / `postToolUse` / `sessionEnd` / `errorOccurred`。
- `.github/scripts/loop/mark-dirty.ps1`
  - 标记当前会话已发生修改。
- `.github/scripts/loop/decide-next-step.ps1`
  - 读取验证与 review 状态，给出下一步决策。
- `.github/scripts/verify/classify-changes.ps1`
  - 按变更路径分类前端 / Tauri / core / service / docs-config 范围。
- `.github/scripts/verify/run.ps1`
  - 运行最小充分验证矩阵并写出 `verify-summary.json`。
- `.github/scripts/review/partition.ps1`
  - 生成固定审查分片清单。
- `.github/scripts/review/prepare-shard.ps1`
  - 为每个分片准备上下文包。
- `.github/scripts/review/aggregate.ps1`
  - 汇总审查分片输出为 `review-summary.json`。

## Task 1: 收敛根 `AGENTS.md` 并建立路径级 instructions

**Files:**
- Modify: `AGENTS.md`
- Create: `.github/instructions/frontend-stack.instructions.md`
- Create: `.github/instructions/tauri-rpc.instructions.md`
- Create: `.github/instructions/rust-gateway.instructions.md`

- [ ] **Step 1: 先确认当前 `AGENTS.md` 中需要被移除或改写的旧约定仍然存在**

```powershell
rg -n "Context7-Expert|Playwright-UI|MCP 调用|\\.vscode/mcp\\.json|\\.github/skills|\\.github/agents" AGENTS.md
```

Expected: 输出当前旧版 `AGENTS.md` 中关于 MCP、旧 agent 名称和安装边界的命中行，证明这次重构是必要的。

- [ ] **Step 2: 用以下内容整体替换根 `AGENTS.md`，把它收敛成薄层常驻指令**

```markdown
# CodexManager Copilot 仓库指令

## 1. 仓库目标

- 本仓库默认目标是让 GitHub Copilot 在一次会话内自主完成：扫描上下文、实施改动、执行验证、全仓审查、继续下一轮修复，直到验证与审查共同表明收敛。
- 主智能体不得用主观完成度替代真实证据。

## 2. 自定义资产优先级

- 根 `AGENTS.md`：薄层 always-on 指令
- `.github/instructions/*.instructions.md`：路径级规则
- `.github/skills/sp-*`：主骨架技能
- `.github/skills/ecc-*`：循环控制与验证辅助技能
- `.github/skills/pro-*`：专业技能层
- `.github/agents/*.agent.md`：角色化 agent

## 3. 主循环规则

- 任何产生代码或行为变化的任务，默认先命中 `sp-brainstorming`，设计确认后再命中 `sp-writing-plans`。
- 实施阶段不得主动汇报“已完成多少进度”。
- 每一轮编辑后必须执行验证。
- 每一轮验证后必须执行全仓审查。
- 只有当验证结果与审查结果都表明收敛时，才允许输出总结。

## 4. 代码与架构硬约束

- 前端交互组件必须正确标记 `"use client"`。
- 复杂业务逻辑下沉到自定义 Hook。
- 避免嵌套 `<button>`。
- 保持 12 个主题与 Glassmorphism 设计语言一致。
- `body.low-transparency` 启用时必须关闭模糊与渐变并回退纯色。
- 桌面端通信统一通过 `@/lib/api/transport` 的 `invoke` / `invokeFirst`。
- 已启动服务的 RPC 默认通过 `withAddr()` 注入地址。
- 新增 Tauri 命令必须同步 `registry.rs`、对应 client 与必要的 normalize / 类型定义。
- Tauri 命令链路禁止 `panic!`、`unwrap()` 和直接 `fetch()`。
- Rust 核心 / 服务改动必须检查账号池、平台 Key、协议兼容、日志脱敏、配置读写与资源释放是否被破坏。

## 5. 验证矩阵

- 前端页面、组件、`lib/api` 改动后：在 `apps/` 执行 `pnpm run build:desktop`
- Tauri 桥接层、命令注册、`rpc_client`、`service_runtime` 改动后：在 `apps/src-tauri/` 执行 `cargo test`
- `crates/core` 或 `crates/service` 改动后：在仓库根执行 `cargo build -p codexmanager-core -p codexmanager-service`
- 涉及服务逻辑、协议、配置、账号或密钥行为时：再执行 `cargo test -p codexmanager-service --quiet`
- 涉及网关转发、OpenAI/Codex 兼容、流式响应、tool calls 或探针行为时：优先运行 `scripts/tests/gateway_regression_suite.ps1`
- 默认不主动运行 `cargo test --all`

## 6. 审查输出规则

- findings 必须优先于总结
- findings 按严重级别排序
- 每条 finding 必须包含：文件路径、问题原因、潜在影响、建议修复
- 若无明确问题，必须写出 `no findings`
- 当前任务要求的是每轮全仓审查，而不是只审 diff

## 7. 安装边界

- 自定义 agents 放在 `.github/agents/`
- skills 放在 `.github/skills/`
- path instructions 放在 `.github/instructions/`
- hooks 放在 `.github/hooks/`
- runtime 状态放在 `.github/review-state/`
- 不引入 MCP，不依赖 `.vscode/mcp.json`
```

- [ ] **Step 3: 创建前端 instructions 文件**

```markdown
---
applyTo: "apps/src/**/*.{ts,tsx,css}"
description: 前端 App Router、主题、Tailwind、Hook 下沉与组件约束
---

- 交互组件必须正确标记 `"use client"`。
- 优先保持组件无业务逻辑化，复杂逻辑下沉到自定义 Hook。
- 避免嵌套 `<button>`，触发器优先沿用现有 `render={<span />}` 与 `nativeButton={false}` 模式。
- 保持 12 个主题与 Glassmorphism 视觉语言一致。
- `body.low-transparency` 启用时必须关闭模糊与渐变并回退纯色。
- 命中 UI 任务时，优先激活最具体的 `pro-*` skill；执行完成后控制权必须回到主骨架循环。
```

- [ ] **Step 4: 创建 Tauri / transport instructions 文件**

```markdown
---
applyTo: "{apps/src-tauri/**/*.{rs},apps/src/lib/api/**/*.{ts,tsx},apps/src/lib/runtime/**/*.{ts,tsx}}"
description: Tauri 命令、transport、withAddr、registry 与 rpc_client 同步规则
---

- 桌面端通信统一通过 `@/lib/api/transport` 中的 `invoke` / `invokeFirst` 发起。
- 面向已启动服务的 RPC 调用默认通过 `withAddr()` 注入地址。
- 新增或修改 Tauri 命令时，必须同步：
  - `apps/src-tauri/src/commands/registry.rs`
  - 对应 `*-client.ts`
  - 必要的 normalize / 类型定义
- 新增长耗时命令时优先使用异步实现或 `spawn_blocking`。
- 禁止在 Tauri 命令链路中 `panic!`、`unwrap()` 和直接 `fetch()`。
```

- [ ] **Step 5: 创建 Rust gateway / core instructions 文件**

```markdown
---
applyTo: "{crates/core/**/*.rs,crates/service/**/*.rs,crates/start/**/*.rs,crates/web/**/*.rs}"
description: Rust core/service、网关协议、配置与日志安全规则
---

- 涉及账号池、平台 Key、网关转发、监听地址、SQLite、配置读写、OpenAI/Codex 协议兼容、认证鉴权、日志脱敏、错误传播和资源释放时，必须优先检查现有实现与相关测试。
- 敏感信息不得明文落库或明文日志。
- 新增敏感字段时必须同步加密路径。
- 配置改动要同时核对 persisted 值与 effective 值。
- 不得静默破坏状态流转、协议兼容和日志链路。
```

- [ ] **Step 6: 验证新指令文件已可被发现**

```powershell
rg -n "^applyTo:|^description:|sp-|autoloop|不引入 MCP" AGENTS.md .github/instructions
```

Expected: `AGENTS.md` 与三个 `.instructions.md` 文件全部命中对应规则。

- [ ] **Step 7: 提交本任务**

```bash
git add AGENTS.md .github/instructions/frontend-stack.instructions.md .github/instructions/tauri-rpc.instructions.md .github/instructions/rust-gateway.instructions.md
git commit -m "docs: reshape Copilot instructions backbone"
```

## Task 2: 创建主入口 agent 与循环安全 agent

**Files:**
- Create: `.github/agents/codexmanager-autoloop.agent.md`
- Create: `.github/agents/loop-operator.agent.md`

- [ ] **Step 1: 先运行一个“文件不存在”检查，确保本任务从零开始**

```powershell
Test-Path .github/agents/codexmanager-autoloop.agent.md
Test-Path .github/agents/loop-operator.agent.md
```

Expected: 两个命令都输出 `False`。

- [ ] **Step 2: 创建主入口 `codexmanager-autoloop.agent.md`**

```markdown
---
name: codexmanager-autoloop
description: 作为主入口驱动仓库级自主迭代，负责命中 skills、实施改动、验证、全仓审查和下一轮决策
tools: ["read", "search", "edit", "execute", "agent", "todo"]
agents: ["code-reviewer", "loop-operator"]
argument-hint: 描述目标或问题；该 agent 会自行扫描、改动、验证并继续迭代，直到验证与审查收敛
disable-model-invocation: true
handoffs:
  - label: 进入全仓审查
    agent: code-reviewer
    prompt: 基于当前工作树执行全仓分块审查，先给 findings，再给收敛判断。
    send: false
  - label: 进入循环诊断
    agent: loop-operator
    prompt: 当前循环可能出现卡顿或重复失败，请识别 churn 模式并给出缩 scope 建议。
    send: false
---

你是 CodexManager 的主入口自主迭代 agent。

工作顺序固定如下：

1. 读取根 `AGENTS.md`、命中的 `.github/instructions/*.instructions.md` 与相关 `.github/skills/*/SKILL.md`
2. 需要设计时先命中 `sp-brainstorming`
3. 设计确认后命中 `sp-writing-plans`
4. 进入实施，不主动汇报完成进度
5. 每轮编辑后都必须运行 `.github/scripts/verify/run.ps1`
6. 每轮验证后都必须调用 `code-reviewer`
7. 读取 `.github/review-state/review-summary.json` 与 `.github/review-state/verify-summary.json`
8. 继续下一轮，直到两者共同表明收敛

绝对禁止：

- 用主观完成度替代真实证据
- 跳过验证
- 仅以 diff 审查替代全仓审查
- 在专业技能执行后丢失主循环控制权
```

- [ ] **Step 3: 创建 `loop-operator.agent.md`**

```markdown
---
name: loop-operator
description: 当自主迭代出现重复失败、重复 findings 或无实质进展时，负责识别 churn 并缩小下一轮范围
tools: ["read", "search", "execute", "todo", "agent"]
disable-model-invocation: true
---

你是 CodexManager 的循环安全 agent。

你的职责：

- 判断当前循环是否出现重复失败或重复 findings
- 对照 `.github/review-state/verify-summary.json` 与 `.github/review-state/review-summary.json` 识别是否无实质进展
- 当循环卡住时，优先建议：
  - 缩小到单一失败分片
  - 暂停扩大改动面
  - 先修验证失败，再回到全仓审查

输出要求：

- 先给出你识别到的 churn 模式
- 再给出下一轮最小安全范围
- 最后给出“继续 / 暂停 / 先缩 scope”结论
```

- [ ] **Step 4: 验证 agent frontmatter 关键字段存在**

```powershell
rg -n "^name:|^description:|^tools:|^agents:|^argument-hint:|^handoffs:|^disable-model-invocation:" .github/agents/codexmanager-autoloop.agent.md .github/agents/loop-operator.agent.md
```

Expected: 两个文件都能命中对应的 frontmatter 关键字段。

- [ ] **Step 5: 提交本任务**

```bash
git add .github/agents/codexmanager-autoloop.agent.md .github/agents/loop-operator.agent.md
git commit -m "feat: add autoloop and loop-operator agents"
```

## Task 3: 创建全仓审查编排 agent 与隐藏分片 reviewer agents

**Files:**
- Create: `.github/agents/code-reviewer.agent.md`
- Create: `.github/agents/review-frontend.agent.md`
- Create: `.github/agents/review-tauri.agent.md`
- Create: `.github/agents/review-core.agent.md`
- Create: `.github/agents/review-service.agent.md`
- Create: `.github/agents/review-meta.agent.md`

- [ ] **Step 1: 先确认当前仓库还没有 reviewer agent 文件**

```powershell
Get-ChildItem .github/agents -Filter "*review*.agent.md" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
```

Expected: 当前不应出现上述 reviewer agent 文件名。

- [ ] **Step 2: 创建可见的 `code-reviewer.agent.md` 编排 agent**

```markdown
---
name: code-reviewer
description: 编排前端、Tauri、core、service 与 meta 分片的全仓审查，聚合 findings 并判断是否收敛
tools: ["read", "search", "execute", "agent"]
agents: ["review-frontend", "review-tauri", "review-core", "review-service", "review-meta"]
argument-hint: 基于当前工作树执行全仓分块审查；先给 findings，再给收敛判断
disable-model-invocation: true
---

你是 CodexManager 的全仓审查编排 agent。

每次被调用时都必须：

1. 读取 `.github/scripts/review/partition.ps1` 生成的固定分片
2. 将当前工作树按以下维度审查：
   - apps/src
   - apps/src-tauri
   - crates/core
   - crates/service
   - scripts / docs / .github
3. 优先调用分片 reviewer agents；如果当前环境无法并行调用，则顺序降级
4. 调用 `.github/scripts/review/aggregate.ps1` 生成统一 summary

输出规则：

- findings 优先
- 按严重级别排序
- 每条必须包含路径、问题原因、潜在影响、建议修复
- 若无问题，明确写出 `no findings`
- 最后附上“是否收敛”的判断
```

- [ ] **Step 3: 创建隐藏的前端 reviewer**

```markdown
---
name: review-frontend
description: 审查 apps/src 下的页面、组件、主题、Hook 与前端 API 接入
tools: ["read", "search", "execute"]
user-invocable: false
disable-model-invocation: true
---

只审查 `apps/src` 范围。

重点检查：

- `"use client"` 与服务端组件边界
- 业务逻辑是否应继续下沉到 Hook
- Glassmorphism / 主题一致性
- 交互组件是否出现嵌套按钮或无障碍倒退
- `@/lib/api/transport` 使用是否符合约束
```

- [ ] **Step 4: 创建隐藏的 Tauri reviewer**

```markdown
---
name: review-tauri
description: 审查 apps/src-tauri 与前端 transport / runtime 的桥接一致性
tools: ["read", "search", "execute"]
user-invocable: false
disable-model-invocation: true
---

只审查 `apps/src-tauri`、`apps/src/lib/api` 与 `apps/src/lib/runtime`。

重点检查：

- `registry.rs`、client、normalize 与命令实现是否同步
- `withAddr()` 与显式 `addr` 传参是否正确
- 命令链路是否出现 `panic!`、`unwrap()` 或直接 `fetch()`
- 阻塞任务是否需要 `spawn_blocking`
```

- [ ] **Step 5: 创建隐藏的 core reviewer**

```markdown
---
name: review-core
description: 审查 crates/core 的存储、共享类型与核心约束
tools: ["read", "search", "execute"]
user-invocable: false
disable-model-invocation: true
---

只审查 `crates/core`。

重点检查：

- 共享类型与上游调用是否一致
- 存储层改动是否破坏兼容性
- 敏感字段处理是否遗漏
- 测试是否覆盖新增边界
```

- [ ] **Step 6: 创建隐藏的 service reviewer**

```markdown
---
name: review-service
description: 审查 crates/service 的网关、协议兼容、配置与状态流转
tools: ["read", "search", "execute"]
user-invocable: false
disable-model-invocation: true
---

只审查 `crates/service`、`crates/start` 与 `crates/web`。

重点检查：

- 网关转发与 OpenAI/Codex 协议兼容是否被破坏
- 配置 persisted 值与 effective 值是否仍一致
- 日志脱敏、错误传播与资源释放是否回退
- 状态流转是否出现静默破坏
```

- [ ] **Step 7: 创建隐藏的 meta reviewer**

```markdown
---
name: review-meta
description: 审查 scripts、docs、.github 资产与配置类变更
tools: ["read", "search", "execute"]
user-invocable: false
disable-model-invocation: true
---

只审查 `scripts`、`docs`、`.github` 与根配置文件。

重点检查：

- hooks、skills、agents、instructions 是否互相矛盾
- 文档是否与官方支持边界一致
- 脚本是否引用了不存在的路径
- 运行时状态目录是否被误提交
```

- [ ] **Step 8: 验证 reviewer 编排链与隐藏 agents 都已生成**

```powershell
rg -n "^name:|^user-invocable:|^agents:" .github/agents/code-reviewer.agent.md .github/agents/review-*.agent.md
```

Expected: `code-reviewer` 命中 `agents:`；分片 agents 命中 `user-invocable: false`。

- [ ] **Step 9: 提交本任务**

```bash
git add .github/agents/code-reviewer.agent.md .github/agents/review-frontend.agent.md .github/agents/review-tauri.agent.md .github/agents/review-core.agent.md .github/agents/review-service.agent.md .github/agents/review-meta.agent.md
git commit -m "feat: add full-repo reviewer agents"
```

## Task 4: 迁入规划型骨架 skills

**Files:**
- Create: `.github/skills/sp-brainstorming/SKILL.md`
- Create: `.github/skills/sp-writing-plans/SKILL.md`

- [ ] **Step 1: 先确认技能目录为空**

```powershell
Get-ChildItem .github/skills -ErrorAction SilentlyContinue
```

Expected: 当前 `.github/skills` 应为空或不存在。

- [ ] **Step 2: 创建 `sp-brainstorming/SKILL.md`**

```markdown
---
name: sp-brainstorming
description: 在新增功能、行为变更或复杂改造前，先理解上下文、逐步澄清、产出设计并获得确认
---

使用场景：

- 新增功能
- 修改现有行为
- 会影响多个目录或多层链路的任务

工作顺序：

1. 先扫描仓库现状与相关实现
2. 一次只问一个关键问题
3. 先提出 2-3 种方案与取舍
4. 给出推荐方案
5. 把确认后的设计写入 `docs/superpowers/specs/`
6. 在设计获批后，切换到 `sp-writing-plans`

禁止事项：

- 还未形成设计就直接开始实现
- 一次抛出多个大问题让用户选择
- 在没有读代码的情况下做结构假设
```

- [ ] **Step 3: 创建 `sp-writing-plans/SKILL.md`**

```markdown
---
name: sp-writing-plans
description: 基于已批准的设计文档，生成面向执行的多任务实现计划，明确文件、验证和提交顺序
---

使用场景：

- 已经存在获批 spec
- 即将开始多步实现

要求：

- 先列出将修改或创建的文件及职责
- 任务拆分要细，优先 2-5 分钟一步
- 明确每个任务的验证命令
- 计划文件写入 `docs/superpowers/plans/`
- 计划完成后，给出执行方式选择

重点：

- 对 CodexManager 要特别标注前端、Tauri、core、service、scripts 的联动点
- 计划中的验证矩阵必须使用仓库真实命令，而不是通用模板
```

- [ ] **Step 4: 验证 skills 的基础结构符合官方要求**

```powershell
rg -n "^name:|^description:" .github/skills/sp-brainstorming/SKILL.md .github/skills/sp-writing-plans/SKILL.md
```

Expected: 两个 `SKILL.md` 文件都命中 `name` 和 `description` frontmatter。

- [ ] **Step 5: 提交本任务**

```bash
git add .github/skills/sp-brainstorming/SKILL.md .github/skills/sp-writing-plans/SKILL.md
git commit -m "feat: add planning backbone skills"
```

## Task 5: 迁入执行型骨架 skills

**Files:**
- Create: `.github/skills/sp-requesting-code-review/SKILL.md`
- Create: `.github/skills/sp-verification-before-completion/SKILL.md`
- Create: `.github/skills/sp-systematic-debugging/SKILL.md`
- Create: `.github/skills/sp-test-driven-development/SKILL.md`

- [ ] **Step 1: 创建 `sp-requesting-code-review/SKILL.md`**

```markdown
---
name: sp-requesting-code-review
description: 在每轮编辑与验证后强制调用全仓审查，并根据 findings 决定是否进入下一轮修复
---

规则：

- 每轮编辑后都必须先验证
- 每轮验证后都必须调用 `code-reviewer`
- 审查范围是全仓稳定分片，不是只审 diff
- 审查结果写入 `.github/review-state/review-summary.json`

调用后动作：

1. 读取 `review-summary.json`
2. 若有 critical/high findings，则回到实施阶段
3. 若 findings 重复两轮，则调用 `loop-operator`
4. 只有 `no findings` 或 summary 表明收敛时，才允许进入最终总结
```

- [ ] **Step 2: 创建 `sp-verification-before-completion/SKILL.md`**

```markdown
---
name: sp-verification-before-completion
description: 在宣称任务完成前，强制要求验证结果与审查结果同时存在且表明收敛
---

规则：

- 不允许在没有 `verify-summary.json` 时宣称完成
- 不允许在没有 `review-summary.json` 时宣称完成
- 若 `verify-summary.json` 中 `overallStatus` 不为 `pass`，必须继续修复
- 若 `review-summary.json` 中存在未关闭 findings，必须继续修复
```

- [ ] **Step 3: 创建 `sp-systematic-debugging/SKILL.md`**

```markdown
---
name: sp-systematic-debugging
description: 验证失败、脚本报错或循环卡住时，优先定位根因，而不是随机补丁
---

工作顺序：

1. 先复现错误
2. 记录失败命令、失败路径、失败输出
3. 缩小到单一失败单元
4. 修复根因
5. 重新运行最小验证

禁止事项：

- 一次引入多个猜测性修复
- 不看失败输出就继续改代码
- 在验证失败时切换到新功能开发
```

- [ ] **Step 4: 创建 `sp-test-driven-development/SKILL.md`**

```markdown
---
name: sp-test-driven-development
description: 对新增功能与 bugfix 优先采用 TDD，先写失败验证，再写最小实现，再重构
---

默认顺序：

1. 先写最小失败测试或失败验证命令
2. 运行并确认失败
3. 写最小实现
4. 运行并确认通过
5. 再做必要重构

例外：

- 纯文档、纯 instructions、纯 agent prompt 资产允许使用结构验证代替单元测试
- 对脚本类改动，应至少提供一个可重复的 smoke test 命令
```

- [ ] **Step 5: 运行结构检查**

```powershell
rg -n "^name:|^description:" .github/skills/sp-requesting-code-review/SKILL.md .github/skills/sp-verification-before-completion/SKILL.md .github/skills/sp-systematic-debugging/SKILL.md .github/skills/sp-test-driven-development/SKILL.md
```

Expected: 四个 skill 文件都能命中 `name` 和 `description`。

- [ ] **Step 6: 提交本任务**

```bash
git add .github/skills/sp-requesting-code-review/SKILL.md .github/skills/sp-verification-before-completion/SKILL.md .github/skills/sp-systematic-debugging/SKILL.md .github/skills/sp-test-driven-development/SKILL.md
git commit -m "feat: add execution backbone skills"
```

## Task 6: 迁入 ECC 辅助 skills 与首个专业技能

**Files:**
- Create: `.github/skills/ecc-continuous-agent-loop/SKILL.md`
- Create: `.github/skills/ecc-verification-loop/SKILL.md`
- Create: `.github/skills/ecc-search-first/SKILL.md`
- Create: `.github/skills/pro-ui-ux-pro-max/SKILL.md`
- Create: `.github/skills/pro-ui-ux-pro-max/scripts/core.py`
- Create: `.github/skills/pro-ui-ux-pro-max/scripts/design_system.py`
- Create: `.github/skills/pro-ui-ux-pro-max/scripts/search.py`
- Create: `.github/skills/pro-ui-ux-pro-max/data/*.csv`
- Create: `.github/skills/pro-ui-ux-pro-max/data/stacks/*.csv`

- [ ] **Step 1: 创建三个 ECC 辅助 skill 文件**

```markdown
---
name: ecc-continuous-agent-loop
description: 为自主迭代提供循环停止条件、重复失败识别与缩 scope 策略
---

- 当同类验证失败连续出现两轮时，必须考虑缩 scope。
- 当同类 findings 连续出现两轮时，必须考虑调用 `loop-operator`。
- 不允许无限扩大改动面来“顺手修完别的问题”。
```

```markdown
---
name: ecc-verification-loop
description: 提供 build、lint、type、test、安全与 diff review 的验证纪律，并映射到本仓库验证矩阵
---

- 每轮改动都必须运行 `.github/scripts/verify/run.ps1`
- 验证结果必须写入 `.github/review-state/verify-summary.json`
- 验证失败时禁止跳过进入总结
```

```markdown
---
name: ecc-search-first
description: 在新增能力前优先搜索仓库现有实现与可复用模式，再决定复用、扩展还是新写
---

- 先用 `rg` 搜索仓库同类实现
- 再检查已有 scripts、tests、docs 与配置约定
- 仅在没有合适模式时才新建抽象
```

- [ ] **Step 2: 复制 `ui-ux-pro-max` 的脚本与数据到仓库内专业技能目录**

```powershell
New-Item -ItemType Directory -Force -Path .github/skills/pro-ui-ux-pro-max/scripts | Out-Null
New-Item -ItemType Directory -Force -Path .github/skills/pro-ui-ux-pro-max/data | Out-Null
Copy-Item 'C:\Users\Administrator\.codex\skills\ui-ux-pro-max\scripts\core.py' '.github/skills/pro-ui-ux-pro-max/scripts/core.py' -Force
Copy-Item 'C:\Users\Administrator\.codex\skills\ui-ux-pro-max\scripts\design_system.py' '.github/skills/pro-ui-ux-pro-max/scripts/design_system.py' -Force
Copy-Item 'C:\Users\Administrator\.codex\skills\ui-ux-pro-max\scripts\search.py' '.github/skills/pro-ui-ux-pro-max/scripts/search.py' -Force
Copy-Item 'C:\Users\Administrator\.codex\skills\ui-ux-pro-max\data' '.github/skills/pro-ui-ux-pro-max\' -Recurse -Force
```

Expected: `.github/skills/pro-ui-ux-pro-max/scripts/` 下出现 3 个 Python 文件，`data/` 与 `data/stacks/` 目录被完整复制。

- [ ] **Step 3: 创建 `pro-ui-ux-pro-max/SKILL.md`，并把路径全部改成 repo-local**

```markdown
---
name: pro-ui-ux-pro-max
description: 为 UI / UX 任务提供设计系统建议、配色与栈建议；只在命中界面任务时介入，执行后必须交回主循环
---

使用场景：

- 页面设计
- 组件视觉改造
- 主题与设计系统调整
- UI 质量审查

工作方式：

1. 先分析产品类型、行业、风格关键词、技术栈
2. 运行本 skill 目录内的 `scripts/search.py` 生成设计系统建议
3. 需要更细粒度建议时，再按 domain 或 stack 运行附加搜索
4. 输出界面建议后，将控制权交回 `codexmanager-autoloop`

命令示例：

`python .github/skills/pro-ui-ux-pro-max/scripts/search.py "desktop dashboard gateway management" --design-system -f markdown`
```

- [ ] **Step 4: smoke test 该专业技能的本地脚本路径**

```powershell
python .github/skills/pro-ui-ux-pro-max/scripts/search.py "desktop dashboard gateway management" --design-system -f markdown | Select-Object -First 20
```

Expected: 输出 Markdown 风格的设计系统建议；如果 Python 不可用，则记录该前置条件并先只提交 skill 与资源文件。

- [ ] **Step 5: 提交本任务**

```bash
git add .github/skills/ecc-continuous-agent-loop/SKILL.md .github/skills/ecc-verification-loop/SKILL.md .github/skills/ecc-search-first/SKILL.md .github/skills/pro-ui-ux-pro-max
git commit -m "feat: add helper and professional skills"
```

## Task 7: 建立 review-state 与循环决策脚本

**Files:**
- Create: `.github/review-state/.gitignore`
- Create: `.github/scripts/loop/mark-dirty.ps1`
- Create: `.github/scripts/verify/classify-changes.ps1`
- Create: `.github/scripts/loop/decide-next-step.ps1`

- [ ] **Step 1: 创建 review-state 保留目录与忽略规则**

```gitignore
*
!.gitignore
```

- [ ] **Step 2: 先写出 `classify-changes.ps1` 的失败期望命令**

```powershell
pwsh -NoProfile -File .github/scripts/verify/classify-changes.ps1
```

Expected: 当前应失败，提示脚本文件不存在。

- [ ] **Step 3: 实现 `mark-dirty.ps1`**

```powershell
$ErrorActionPreference = "Stop"

$raw = [Console]::In.ReadToEnd()
$event = $null
if (-not [string]::IsNullOrWhiteSpace($raw)) {
    $event = $raw | ConvertFrom-Json
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$sessionPath = Join-Path $stateDir "session-state.json"
$editTools = @("edit", "create", "write", "multiedit")
$toolName = ""
if ($event -and $event.PSObject.Properties.Name -contains "toolName") {
    $toolName = ($event.toolName | Out-String).Trim().ToLowerInvariant()
}

$current = @{
    dirty = ($editTools -contains $toolName)
    toolName = $toolName
    updatedAt = (Get-Date).ToString("o")
}

$current | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $sessionPath
```

- [ ] **Step 4: 实现 `classify-changes.ps1`**

```powershell
param(
    [string[]]$Paths
)

$ErrorActionPreference = "Stop"

if (-not $Paths -or $Paths.Count -eq 0) {
    $Paths = git status --short | ForEach-Object {
        if ($_.Length -ge 4) { $_.Substring(3).Trim() }
    }
}

$paths = @($Paths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

$result = [ordered]@{
    changedFiles = $paths
    frontend = $false
    tauri = $false
    core = $false
    service = $false
    gateway = $false
    docsConfig = $false
}

foreach ($path in $paths) {
    if ($path -like "apps/src/*") { $result.frontend = $true }
    if ($path -like "apps/src-tauri/*" -or $path -like "apps/src/lib/api/*" -or $path -like "apps/src/lib/runtime/*") { $result.tauri = $true }
    if ($path -like "crates/core/*") { $result.core = $true }
    if ($path -like "crates/service/*" -or $path -like "crates/start/*" -or $path -like "crates/web/*") { $result.service = $true }
    if ($path -like "crates/service/src/gateway/*" -or $path -like "scripts/tests/*gateway*") { $result.gateway = $true }
    if ($path -like ".github/*" -or $path -like "docs/*" -or $path -like "scripts/*" -or $path -eq "AGENTS.md") { $result.docsConfig = $true }
}

$result | ConvertTo-Json -Depth 5
```

- [ ] **Step 5: 实现 `decide-next-step.ps1`**

```powershell
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$stateDir = Join-Path $root ".github\review-state"
$verifyPath = Join-Path $stateDir "verify-summary.json"
$reviewPath = Join-Path $stateDir "review-summary.json"

if (-not (Test-Path $verifyPath)) {
    "rerun-verification"
    exit 0
}

$verify = Get-Content -Raw $verifyPath | ConvertFrom-Json
if ($verify.overallStatus -ne "pass") {
    "continue-fixing"
    exit 0
}

if (-not (Test-Path $reviewPath)) {
    "continue-fixing"
    exit 0
}

$review = Get-Content -Raw $reviewPath | ConvertFrom-Json
$blocking = @($review.findings | Where-Object { $_.severity -in @("critical", "high") }).Count
$repeatCount = 0
if ($review.PSObject.Properties.Name -contains "recurringFindings") {
    $repeatCount = @($review.recurringFindings).Count
}

if ($repeatCount -ge 2) {
    "invoke-loop-operator"
    exit 0
}

if ($blocking -gt 0) {
    "continue-fixing"
    exit 0
}

"ready-to-summarize"
```

- [ ] **Step 6: 运行 smoke tests**

```powershell
pwsh -NoProfile -Command "& '.github/scripts/verify/classify-changes.ps1' -Paths @('apps/src/app/page.tsx','crates/service/src/gateway/mod.rs','AGENTS.md')"
```

Expected: 输出 JSON，且 `frontend`、`service`、`gateway`、`docsConfig` 都为 `true`。

```powershell
New-Item -ItemType Directory -Force -Path .github/review-state | Out-Null
@{ overallStatus = 'pass' } | ConvertTo-Json | Set-Content .github/review-state/verify-summary.json
@{ findings = @(); recurringFindings = @() } | ConvertTo-Json -Depth 5 | Set-Content .github/review-state/review-summary.json
pwsh -NoProfile -File .github/scripts/loop/decide-next-step.ps1
```

Expected: 输出 `ready-to-summarize`。

- [ ] **Step 7: 提交本任务**

```bash
git add .github/review-state/.gitignore .github/scripts/loop/mark-dirty.ps1 .github/scripts/verify/classify-changes.ps1 .github/scripts/loop/decide-next-step.ps1
git commit -m "feat: add loop state and decision scripts"
```

## Task 8: 实现审查分片准备与聚合脚本

**Files:**
- Create: `.github/scripts/review/partition.ps1`
- Create: `.github/scripts/review/prepare-shard.ps1`
- Create: `.github/scripts/review/aggregate.ps1`

- [ ] **Step 1: 先写出分片脚本的失败期望命令**

```powershell
pwsh -NoProfile -File .github/scripts/review/partition.ps1
```

Expected: 当前应失败，提示文件不存在。

- [ ] **Step 2: 实现 `partition.ps1`**

```powershell
$ErrorActionPreference = "Stop"

$shards = @(
    @{ name = "frontend"; paths = @("apps/src") }
    @{ name = "tauri"; paths = @("apps/src-tauri", "apps/src/lib/api", "apps/src/lib/runtime") }
    @{ name = "core"; paths = @("crates/core") }
    @{ name = "service"; paths = @("crates/service", "crates/start", "crates/web") }
    @{ name = "meta"; paths = @(".github", "scripts", "docs", "AGENTS.md") }
)

$shards | ConvertTo-Json -Depth 5
```

- [ ] **Step 3: 实现 `prepare-shard.ps1`**

```powershell
param(
    [Parameter(Mandatory = $true)]
    [string]$Name
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$classification = & (Join-Path $root ".github/scripts/verify/classify-changes.ps1") | ConvertFrom-Json
$shards = & (Join-Path $root ".github/scripts/review/partition.ps1") | ConvertFrom-Json
$target = $shards | Where-Object { $_.name -eq $Name }

if (-not $target) {
    throw "Unknown shard: $Name"
}

$instructions = switch ($Name) {
    "frontend" { @(".github/instructions/frontend-stack.instructions.md") }
    "tauri"    { @(".github/instructions/tauri-rpc.instructions.md") }
    "core"     { @(".github/instructions/rust-gateway.instructions.md") }
    "service"  { @(".github/instructions/rust-gateway.instructions.md") }
    default    { @() }
}

$changed = @($classification.changedFiles | Where-Object {
    $path = $_
    $target.paths | Where-Object { $prefix = $_.TrimEnd('/'); $path -eq $prefix -or $path.StartsWith("$prefix/") }
})

[ordered]@{
    name = $Name
    paths = @($target.paths)
    changedFiles = @($changed)
    instructions = $instructions
    verifySummaryPath = ".github/review-state/verify-summary.json"
    reviewOutputPath = ".github/review-state/review-shards/$Name.json"
} | ConvertTo-Json -Depth 6
```

- [ ] **Step 4: 实现 `aggregate.ps1`**

```powershell
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$stateDir = Join-Path $root ".github\review-state"
$shardDir = Join-Path $stateDir "review-shards"
New-Item -ItemType Directory -Force -Path $shardDir | Out-Null

$files = Get-ChildItem $shardDir -Filter *.json -ErrorAction SilentlyContinue
$findings = @()

foreach ($file in $files) {
    $data = Get-Content -Raw $file.FullName | ConvertFrom-Json
    if ($data.PSObject.Properties.Name -contains "findings") {
        $findings += @($data.findings)
    }
}

$deduped = @{}
foreach ($finding in $findings) {
    $key = "$($finding.path)|$($finding.severity)|$($finding.title)"
    if (-not $deduped.Contains($key)) {
        $deduped[$key] = $finding
    }
}

$ordered = @($deduped.Values | Sort-Object @{ Expression = {
    switch ($_.severity) {
        "critical" { 0 }
        "high" { 1 }
        "medium" { 2 }
        default { 3 }
    }
}}, path, title)

$summary = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    findings = $ordered
    recurringFindings = @()
    shardCount = $files.Count
    converged = ($ordered.Count -eq 0)
}

$outPath = Join-Path $stateDir "review-summary.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $outPath
$summary | ConvertTo-Json -Depth 8
```

- [ ] **Step 5: 运行 smoke tests**

```powershell
pwsh -NoProfile -File .github/scripts/review/partition.ps1
```

Expected: 输出 `frontend`、`tauri`、`core`、`service`、`meta` 五个固定分片。

```powershell
New-Item -ItemType Directory -Force -Path .github/review-state/review-shards | Out-Null
@{ findings = @(@{ severity = 'high'; path = 'apps/src/app/page.tsx'; title = 'Missing use client'; impact = 'client boundary regression'; fix = 'restore use client' }) } | ConvertTo-Json -Depth 8 | Set-Content .github/review-state/review-shards/frontend.json
@{ findings = @(@{ severity = 'high'; path = 'apps/src/app/page.tsx'; title = 'Missing use client'; impact = 'client boundary regression'; fix = 'restore use client' }) } | ConvertTo-Json -Depth 8 | Set-Content .github/review-state/review-shards/meta.json
pwsh -NoProfile -File .github/scripts/review/aggregate.ps1
```

Expected: `review-summary.json` 中只保留 1 条去重后的 high finding，且 `converged` 为 `false`。

- [ ] **Step 6: 提交本任务**

```bash
git add .github/scripts/review/partition.ps1 .github/scripts/review/prepare-shard.ps1 .github/scripts/review/aggregate.ps1
git commit -m "feat: add review partition and aggregation scripts"
```

## Task 9: 实现验证 runner 与仓库级 hooks

**Files:**
- Create: `.github/scripts/verify/run.ps1`
- Create: `.github/hooks/autoloop.json`

- [ ] **Step 1: 先写出验证 runner 的失败期望命令**

```powershell
pwsh -NoProfile -File .github/scripts/verify/run.ps1
```

Expected: 当前应失败，提示文件不存在。

- [ ] **Step 2: 实现 `run.ps1`**

```powershell
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$classification = & (Join-Path $root ".github/scripts/verify/classify-changes.ps1") | ConvertFrom-Json
$stateDir = Join-Path $root ".github\review-state"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$results = New-Object System.Collections.Generic.List[object]

function Invoke-Step {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command
    )

    Push-Location $WorkingDirectory
    try {
        Invoke-Expression $Command
        $results.Add([pscustomobject]@{ name = $Name; status = "pass"; command = $Command })
    } catch {
        $results.Add([pscustomobject]@{ name = $Name; status = "fail"; command = $Command; error = $_.Exception.Message })
    } finally {
        Pop-Location
    }
}

if ($classification.frontend) {
    Invoke-Step -Name "frontend-build" -WorkingDirectory (Join-Path $root "apps") -Command "pnpm run build:desktop"
}

if ($classification.tauri) {
    Invoke-Step -Name "tauri-tests" -WorkingDirectory (Join-Path $root "apps/src-tauri") -Command "cargo test"
}

if ($classification.core -or $classification.service) {
    Invoke-Step -Name "rust-build" -WorkingDirectory $root -Command "cargo build -p codexmanager-core -p codexmanager-service"
}

if ($classification.service) {
    Invoke-Step -Name "service-tests" -WorkingDirectory $root -Command "cargo test -p codexmanager-service --quiet"
}

if ($classification.gateway) {
    Invoke-Step -Name "gateway-regression" -WorkingDirectory $root -Command "powershell -ExecutionPolicy Bypass -File scripts/tests/gateway_regression_suite.ps1"
}

$overallStatus = if ($results.Where({ $_.status -eq "fail" }).Count -gt 0) { "fail" } else { "pass" }
$summary = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    changedFiles = @($classification.changedFiles)
    overallStatus = $overallStatus
    steps = $results
}

$outPath = Join-Path $stateDir "verify-summary.json"
$summary | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $outPath
$summary | ConvertTo-Json -Depth 8

if ($overallStatus -eq "fail") {
    exit 1
}
```

- [ ] **Step 3: 创建 `.github/hooks/autoloop.json`**

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "type": "command",
        "powershell": "New-Item -ItemType Directory -Force -Path .github/review-state/review-shards | Out-Null; @{ dirty = $false; updatedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content .github/review-state/session-state.json",
        "cwd": ".",
        "timeoutSec": 10
      }
    ],
    "preToolUse": [
      {
        "type": "command",
        "powershell": "$input = [Console]::In.ReadToEnd() | ConvertFrom-Json; if ($input.toolName -eq 'edit' -or $input.toolName -eq 'create' -or $input.toolName -eq 'write') { $pathArg = '' + $input.toolArgs.path; if ($pathArg -like 'target/*' -or $pathArg -like '.git/*' -or $pathArg -like 'node_modules/*' -or $pathArg -like '.github/review-state/*') { @{ permissionDecision = 'deny'; permissionDecisionReason = 'Do not edit generated directories or runtime review state.' } | ConvertTo-Json -Compress } }",
        "cwd": ".",
        "timeoutSec": 10
      }
    ],
    "postToolUse": [
      {
        "type": "command",
        "powershell": ".\\.github\\scripts\\loop\\mark-dirty.ps1",
        "cwd": ".",
        "timeoutSec": 10
      }
    ],
    "sessionEnd": [
      {
        "type": "command",
        "powershell": "$decision = .\\.github\\scripts\\loop\\decide-next-step.ps1; Add-Content -Path .github/review-state/session-end.log -Value $decision",
        "cwd": ".",
        "timeoutSec": 10
      }
    ],
    "errorOccurred": [
      {
        "type": "command",
        "powershell": "$input = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Content -Path .github/review-state/errors.log -Value ('[' + (Get-Date).ToString('o') + '] ' + $input.error.name + ': ' + $input.error.message)",
        "cwd": ".",
        "timeoutSec": 10
      }
    ]
  }
}
```

- [ ] **Step 4: 运行 runner 的最小 smoke test**

```powershell
@{ changedFiles = @('AGENTS.md'); overallStatus = 'pass'; steps = @() } | ConvertTo-Json -Depth 8 | Set-Content .github/review-state/verify-summary.json
Get-Content .github/hooks/autoloop.json | ConvertFrom-Json | Out-Null
```

Expected: JSON 解析通过，无异常。

- [ ] **Step 5: 对 hooks 的关键路径与脚本引用做一次静态检查**

```powershell
rg -n "review-state|mark-dirty|decide-next-step|permissionDecision|errorOccurred" .github/hooks/autoloop.json .github/scripts
```

Expected: hooks 配置中的每个引用路径都能在脚本目录中找到对应实现。

- [ ] **Step 6: 提交本任务**

```bash
git add .github/scripts/verify/run.ps1 .github/hooks/autoloop.json
git commit -m "feat: add verification runner and autoloop hooks"
```

## Task 10: 对齐设计文档、做一次端到端干跑，并留出执行入口

**Files:**
- Modify: `docs/superpowers/specs/2026-04-05-copilot-autoloop-github-install-design.md`

- [ ] **Step 1: 将设计文档中的 hook 命名与目录约定同步为官方实现**

```markdown
- 将 `agentStop` / `subagentStop` 的表述统一替换为当前官方支持的 `sessionEnd` / `errorOccurred` / `postToolUse`
- 将 `.github/hooks/session-start.json` 等逐事件文件改写为 `.github/hooks/autoloop.json`
```

- [ ] **Step 2: 运行端到端干跑命令，确认最小链路已闭环**

```powershell
pwsh -NoProfile -File .github/scripts/review/partition.ps1 | Out-Null
pwsh -NoProfile -Command "& '.github/scripts/review/prepare-shard.ps1' -Name 'frontend'" | Out-Null
@{ findings = @() ; recurringFindings = @() ; converged = $true } | ConvertTo-Json -Depth 8 | Set-Content .github/review-state/review-summary.json
@{ overallStatus = 'pass'; steps = @() } | ConvertTo-Json -Depth 8 | Set-Content .github/review-state/verify-summary.json
pwsh -NoProfile -File .github/scripts/loop/decide-next-step.ps1
```

Expected: 最终输出 `ready-to-summarize`。

- [ ] **Step 3: 在 VS Code 中手工确认工作区自定义资产可发现**

```text
1. 打开 Agents 下拉，确认出现 `codexmanager-autoloop`、`code-reviewer`、`loop-operator`
2. 打开 Chat Customizations / Diagnostics，确认 `.github/instructions`、`.github/skills`、`.github/hooks/autoloop.json` 被识别
3. 在 Agent Mode 里选择 `codexmanager-autoloop`，输入一句简短任务，确认它能引用仓库级规则
```

Expected: UI 能发现 workspace custom agents / skills / instructions；如果 hooks 仅在 CLI 或特定版本生效，记录差异但不要移除 repo-level 配置。

- [ ] **Step 4: 提交本任务**

```bash
git add docs/superpowers/specs/2026-04-05-copilot-autoloop-github-install-design.md .github/review-state .github/hooks/autoloop.json .github/scripts .github/agents .github/skills .github/instructions AGENTS.md
git commit -m "feat: install repo-level Copilot autoloop workflow"
```

## Spec Coverage Check

- `AGENTS.md` 薄层化与无 MCP 约束：Task 1
- `.github/instructions`：Task 1
- 主入口 agent：Task 2
- reviewer 与分片全仓审查：Task 3、Task 8
- `superpowers` 主骨架：Task 4、Task 5
- ECC 辅助循环：Task 6
- 可扩展专业技能层：Task 6
- review-state、验证与决策脚本：Task 7、Task 8、Task 9
- hooks：Task 9
- 干跑验证与文档回写：Task 10

## Self-Review

- 已补上官方 hooks 事件与 `.github/hooks/autoloop.json` 的实现修正，避免继续沿用设计草案中的非官方事件名。
- 计划中未使用待补充类占位词。
- 所有脚本文件、agent 文件、skill 文件和 hook 文件都给出了明确路径与最小内容骨架。
- `code-reviewer` 的“并行分块审查”通过隐藏 shard reviewer agents 实现，避免依赖自引用 subagent 设置。
- `pro-ui-ux-pro-max` 明确要求回到主循环，未让专业技能覆盖骨架约束。
