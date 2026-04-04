# Copilot 仓库级自主迭代安装设计

日期：2026-04-05  
仓库：`D:\Github\CodexManager\CodexManager`  
状态：已完成头脑风暴阶段设计确认，等待用户审阅

## 目标

为本仓库安装一套仓库级 GitHub Copilot 工作流，使其在 VS Code Agent Mode 与 Copilot CLI 中能够实现单次会话内的自主迭代，具体采用：

- `superpowers` 作为主工作流骨架
- `everything-claude-code`（ECC）作为循环控制与验证辅助层
- `ui-ux-pro-max` 作为第一批专业领域技能，并纳入可扩展的 `pro-*` 技能层

系统应在单次会话内持续循环完成：

1. 设计与计划
2. 实施改动
3. 执行验证
4. 全仓并行审查
5. 根据结果继续下一轮修复

只有当验证与审查都表明已经收敛，或者命中显式循环安全停止条件时，才允许结束。

## 硬约束

- 仅做仓库级安装：所有新增可复用资产均放在 `.github/` 下，只有 GitHub Copilot 预期的入口 `AGENTS.md` 保留在仓库根目录。
- 不依赖 MCP。
- 不要求任何用户目录级安装，例如 `~/.codex`、`~/.claude`、`~/.agents`，也不要求 IDE 全局配置。
- 不引入仓库外的后台守护进程、观察器或会话服务。
- 主智能体不得用“主观完成度描述”替代真实证据。
- 每一轮修改后都必须触发：
  - 验证
  - `code-reviewer` 的全仓审查
  - 基于证据的下一步决策

## 官方支持边界

本设计严格限制在 GitHub Copilot 已文档化支持的仓库定制范围内：

- 根目录 `AGENTS.md`：仓库级 agent 指令入口
- `.github/agents/*.agent.md`：自定义 agent
- `.github/skills/<skill>/SKILL.md`：agent skills 及其本地辅助文件
- `.github/instructions/*.instructions.md`：路径级 instructions
- `.github/hooks/*.json`：Copilot hooks

已于 2026-04-05 对照 GitHub 与 VS Code 官方文档核实：

- GitHub Docs：自定义 agents
  - <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents>
  - <https://docs.github.com/en/copilot/reference/custom-agents-configuration>
- GitHub Docs：自定义 instructions
  - <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions>
  - <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-reusable-instructions>
- GitHub Docs：skills
  - <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills>
- GitHub Docs：hooks
  - <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks>
  - <https://docs.github.com/en/copilot/reference/hooks-configuration>
- VS Code Docs：Copilot customization 与 custom agents
  - <https://code.visualstudio.com/docs/copilot/customization/overview>
  - <https://code.visualstudio.com/docs/copilot/customization/custom-agents>
  - <https://code.visualstudio.com/docs/copilot/agents/background-agents>

### 重要澄清

本仓库不应依赖 `.vscode/mcp.json`、`.github/mcp.json` 或任何 MCP 专属工作流。本设计明确移除这些依赖。

另外，GitHub Copilot 当前并不存在名为 `pre-final-response` 的 hook 事件。因此，对“最终回复前必须具备验证证据”这一约束，必须通过以下方式实现：

- agent 指令
- `agentStop` 与 `subagentStop` hook 检查
- 审查与验证状态文件

而不是依赖一个并不存在的 hook 阶段。

## 目标架构

整套系统分为五层。

### 1. 根目录 `AGENTS.md`

用途：

- 建立仓库级自主迭代规则
- 定义 agents 与 skills 的执行优先级
- 禁止无证据的“伪完成”声明
- 定义何时升级为循环安全处理

设计要求：

- 保持简洁、高密度、常驻可读
- 将大量过程细节从当前文件中移出
- 路径相关规则迁入 `.github/instructions`
- 可复用工作流迁入 `.github/skills`

### 2. `.github/instructions/`

用途：

- 仅承载窄范围、路径相关的规则
- 保持命中精确，便于维护

计划文件：

- `.github/instructions/frontend-stack.instructions.md`
- `.github/instructions/tauri-rpc.instructions.md`
- `.github/instructions/rust-gateway.instructions.md`
- 可选的 `.github/instructions/repo-review.instructions.md`，用于约束 review 输出格式

规则：

- 使用精确的 `applyTo` 范围
- 除非没有稳定边界，否则不要使用过宽的兜底 glob

### 3. `.github/skills/`

用途：

- 作为主工作流层
- 同时容纳骨架型 workflow skills 与可选的专业型 skills

命名约定：

- `sp-*`：基于 superpowers 的骨架工作流
- `ecc-*`：基于 ECC 的循环与辅助工作流
- `pro-*`：领域型专业技能

### 4. `.github/agents/`

用途：

- 定义入口 agent、审查 agent 与循环安全 agent
- 控制 picker 规模，避免角色过多

计划 agent：

- `codexmanager-autoloop.agent.md`
- `code-reviewer.agent.md`
- `loop-operator.agent.md`

### 5. `.github/hooks/` 与 `.github/scripts/`

用途：

- 在 hooks 中表达轻量触发逻辑
- 在 scripts 中承载真正的编排逻辑
- 在仓库内持久化循环状态与审查证据

## 目标目录结构

```text
AGENTS.md
.github/
  agents/
    codexmanager-autoloop.agent.md
    code-reviewer.agent.md
    loop-operator.agent.md
  hooks/
    session-start.json
    post-tool-use.json
    agent-stop.json
    subagent-stop.json
  instructions/
    frontend-stack.instructions.md
    tauri-rpc.instructions.md
    rust-gateway.instructions.md
  review-state/
    verify-summary.json
    review-summary.json
    review-shards/
  scripts/
    loop/
      mark-dirty.ps1
      decide-next-step.ps1
    review/
      partition.ps1
      prepare-shard.ps1
      aggregate.ps1
    verify/
      classify-changes.ps1
      run.ps1
  skills/
    sp-brainstorming/
      SKILL.md
    sp-writing-plans/
      SKILL.md
    sp-requesting-code-review/
      SKILL.md
    sp-verification-before-completion/
      SKILL.md
    sp-systematic-debugging/
      SKILL.md
    sp-test-driven-development/
      SKILL.md
    ecc-continuous-agent-loop/
      SKILL.md
    ecc-verification-loop/
      SKILL.md
    ecc-search-first/
      SKILL.md
    pro-ui-ux-pro-max/
      SKILL.md
      scripts/
      data/
```

## 单次会话自主迭代状态机

目标循环为：

1. 接收任务
2. 设计或计划选择
3. 实施改动
4. 执行验证
5. 全仓审查
6. 决定下一步
7. 要么继续下一轮，要么输出收敛总结

### 状态定义

#### 接收任务

主智能体读取：

- 根目录 `AGENTS.md`
- 命中的 `.github/instructions/*.instructions.md`
- 相关 `.github/skills/*/SKILL.md`

决策规则：

- 如果请求涉及新增能力或行为变更，则先进入 `sp-brainstorming`
- 设计获批后进入 `sp-writing-plans`
- 如果任务足够直接且规格已经非常明确，只有在 `AGENTS.md` 明确允许快捷路径时，骨架流程才可跳过 brainstorming；否则仍应严格遵循骨架流程

#### 实施改动

主智能体在以下约束下执行最小必要改动：

- 仓库级 instructions
- 命中的骨架 skill
- 如有需要，再命中的专业或辅助 skill

它不得基于主观判断宣布完成。

#### 执行验证

每轮修改后都必须运行“仓库感知”的验证矩阵，而不是直接照搬 ECC 中通用的命令模板。

#### 全仓审查

每次验证结束后，主智能体必须调用 `code-reviewer.agent.md`。

该 reviewer 负责：

- 每轮都做全仓审查
- 使用固定分片策略
- 输出按严重级别排序的 findings
- 给出收敛判断

#### 决定下一步

下一步完全由证据决定：

- 验证失败 -> 修复并重新验证
- 验证通过但审查有问题 -> 修复 findings
- 连续出现同类失败 -> 调用 `loop-operator`
- 验证与审查都表明收敛 -> 输出总结并结束

## Skill 层设计

### 来自 Superpowers 的骨架技能

这些技能应改写为 Copilot 原生仓库级 skills，而不是直接原样复制。

#### `sp-brainstorming`

来源：

- `C:\Users\Administrator\.codex\superpowers\skills\brainstorming\SKILL.md`

保留：

- 先理解项目上下文再设计的纪律
- 一次只问一个关键问题的澄清方式
- 先设计、后实现的规则
- 先写 spec 的工作流

调整：

- 移除特定 harness 的工具引用
- 改写为适配 Copilot custom skills 的表述
- 将 spec 落到本仓库的 docs 结构

#### `sp-writing-plans`

保留：

- 面向执行的细化实现计划
- 依赖顺序分析
- 验证意识

调整：

- 面向 CodexManager 的跨层影响分析
- 将计划中的验证命令映射到本仓库真实命令

#### `sp-requesting-code-review`

保留：

- 尽早审查的原则
- 基于子智能体的 review handoff 思路

调整：

- 将审查改为“每轮编辑后都必须执行”，而不是只在阶段性里程碑后执行
- 目标从 diff 审查提升为全仓审查
- 与 `.github/review-state` 集成

#### `sp-verification-before-completion`

保留：

- “没有证据，就不能宣称完成”

调整：

- 消费 `verify-summary.json`
- 最终停止前必须同时具备 review summary

#### `sp-systematic-debugging`

保留：

- 根因优先的调试方式
- 反对随机试错式修复

使用场景：

- verify/review 循环卡住时

#### `sp-test-driven-development`

保留，但需调整：

- 将 TDD 作为新增功能与 bugfix 的优先模式

但需明确：

- 不应为了形式正确而强行制造低价值测试
- 必须与仓库现有测试模式保持一致

### ECC 辅助技能

只迁入与循环直接相关的思想。

#### `ecc-continuous-agent-loop`

来源：

- `d:\Github\_tmp_ecc\skills\continuous-agent-loop\SKILL.md`

保留：

- 循环安全控制
- 失败模式识别
- 恢复策略

移除：

- ECC 专属外部依赖与命名工作流链条

#### `ecc-verification-loop`

来源：

- `d:\Github\_tmp_ecc\.agents\skills\verification-loop\SKILL.md`

保留：

- 对 build、lint、type、test、安全、diff review 的验证纪律

调整：

- 用 CodexManager 专属验证矩阵替换通用 `npm build` 假设

#### `ecc-search-first`

保留：

- 先搜仓库、再搜生态、再决定复用还是自写的纪律

调整：

- 去掉 MCP 分支
- 优先使用本地 `rg` 与仓库现有模式复用

### 专业技能层

#### `pro-ui-ux-pro-max`

来源：

- `C:\Users\Administrator\.codex\skills\ui-ux-pro-max`

保留：

- 设计系统生成流程
- 面向技术栈的 UI 指南
- UI 交付检查清单

调整：

- 将脚本与数据一起迁入 `.github/skills/pro-ui-ux-pro-max`
- 将脚本路径改写为相对仓库内 skill 目录的本地路径
- 明确声明：该 skill 绝不能覆盖骨架主循环

### 明确不迁入的 skill 类型

第一波设计中不应迁入：

- 依赖 MCP 才成立的 skills
- 依赖用户主目录 bootstrap/install 的 skills
- 只适用于 ECC 自身仓库 conventions 的 skills
- 依赖长驻观察器或守护进程的 skills
- 核心价值依赖外部服务或全局机器状态的 skills

## Agent 层设计

### `codexmanager-autoloop.agent.md`

用途：

- VS Code Agent Mode 与 Copilot CLI 的主入口 agent

职责：

- 选择并调用 skills
- 实施改动
- 运行验证
- 调用审查
- 持续循环直到收敛或命中循环停止条件

强制行为：

- 不得基于自我判断报告完成
- 每轮改动后都必须：
  - 标记 repo 状态为 dirty
  - 运行验证
  - 调用 review
  - 决定下一步
- 只有证据允许停止时，才能输出总结

建议工具：

- read/search
- edit
- terminal/execute
- agents
- todo/task tracking

### `code-reviewer.agent.md`

基础来源：

- `C:\Users\Administrator\.codex\superpowers\agents\code-reviewer.md`

关键重设计：

- 每轮都审全仓，但排除生成物与构建产物目录
- 按稳定分片边界切仓
- 环境支持 agent delegation 时并行审片
- 不支持时顺序降级
- 默认保持只读

分片建议：

- `apps/src`
- `apps/src-tauri`
- `crates/core`
- `crates/service`
- `scripts` 与 `.github`
- docs 与配置层

输出契约：

- findings 优先
- 按严重级别排序
- 包含文件引用
- 说明影响
- 提供修复建议
- 给出收敛判断
- 标出剩余盲区

### `loop-operator.agent.md`

灵感来源：

- `d:\Github\_tmp_ecc\agents\loop-operator.md`

用途：

- 识别循环抖动与停滞
- 当主循环重复同类动作时主动缩小 scope
- 给出更安全的下一轮策略

调用时机：

- 连续出现同类验证失败
- 连续多轮 reviewer 给出同类 findings
- 两轮内没有实质进展

## Hooks 与 Scripts 设计

### Hook 设计原则

Hooks 负责触发与卡口，Scripts 负责真正执行。

### Hook 事件

根据 GitHub 当前文档化 hook 系统，相关事件包括：

- `SessionStart`
- `PostToolUse`
- `AgentStop`
- `SubagentStop`

最终文件名与 JSON 结构应遵循 GitHub 当下的 hook schema，但逻辑职责按照下文划分。

### 计划中的 Hook 职责

#### Session start hook

- 初始化 `.github/review-state`
- 必要时清理上一轮残留状态
- 写入本次会话元数据

#### Post-tool-use hook

- 检测是否执行了会产生修改的工具
- 若已发生修改，则标记本轮必须验证
- 不在 hook 内直接执行高成本验证与审查

#### Agent-stop hook

- 检查当前会话是否仍为 dirty
- 若 dirty，则确认验证与 review 产物是否存在
- 若缺少产物，则发出“继续循环”而不是“可以结束”的约束信号

#### Subagent-stop hook

- 收集各审查分片输出
- 当预期分片结果齐备时，触发聚合逻辑

## 审查与验证脚本设计

### `.github/scripts/loop/mark-dirty.ps1`

写入轻量状态：

- 是否已发生代码编辑
- 时间戳
- 如可获得，则记录本轮触碰文件

### `.github/scripts/verify/classify-changes.ps1`

根据变更文件判断受影响层级：

- frontend
- tauri bridge
- core
- service
- scripts/config/docs

### `.github/scripts/verify/run.ps1`

运行本仓库的最小充分验证矩阵。

规则：

- frontend 改动 -> 优先跑 `apps/` 下构建链
- Tauri 改动 -> 跑 Tauri tests
- core/service 改动 -> 跑定向 Rust build 或 tests
- protocol/gateway 改动 -> 在适用时跑 gateway regression 脚本

输出：

- `.github/review-state/verify-summary.json`

### `.github/scripts/review/partition.ps1`

每轮生成稳定的审查分片。

### `.github/scripts/review/prepare-shard.ps1`

为每个分片生成上下文包：

- 分片路径范围
- 最近相关改动
- 命中的 instructions
- 验证状态

### `.github/scripts/review/aggregate.ps1`

消费多个分片审查输出，并生成：

- 去重后的 findings
- 各严重级别计数
- 跨轮未消除的重复问题
- 收敛建议

输出：

- `.github/review-state/review-summary.json`

### `.github/scripts/loop/decide-next-step.ps1`

读取验证与 review 产物，并输出以下之一：

- `continue-fixing`
- `rerun-verification`
- `invoke-loop-operator`
- `ready-to-summarize`

## CodexManager 专属验证矩阵

ECC 通用验证流程不足以直接覆盖本仓库。本仓库验证必须绑定当前 `AGENTS.md` 中已有规则。

### 默认验证

- frontend 页面、组件、`lib` 改动 -> 在 `apps/` 下执行 `pnpm run build:desktop`
- 仅在有帮助且成本更低时补跑局部 lint

### Tauri bridge 改动

- 在 `apps/src-tauri/` 执行 `cargo test`

### Rust core/service 改动

- 在根工作区定向构建 `codexmanager-core` 与 `codexmanager-service`
- 如果变更涉及 gateway、config、account、key 或 protocol 逻辑，再补跑 service tests

### 协议专项改动

- gateway/protocol/tool-call/streaming 兼容性改动时，执行 `scripts/tests/gateway_regression_suite.ps1`

### 高成本命令

- 默认不执行 `cargo test --all`
- 全量高成本回归仅在显式发布前或深度校验时使用

## 全仓审查策略

用户要求是“每轮都全仓审查”。为了让这件事可执行：

- 每轮都审所有稳定分片
- 排除生成物与构建产物目录，例如：
  - `.git`
  - `target`
  - `node_modules`
  - 其它生成输出
- 允许深度偏置：
  - 本轮有改动的分片做最深审查
  - 未改动分片仍执行强制性的规则与风险审查

这样既满足“每轮全仓审查”，又避免把大量时间浪费在生成物上。

## 对现有 `AGENTS.md` 的改造要求

当前文件已经具备较强仓库规则基础，但需要重构。

### 保留

- 仓库特有的编码约束
- 跨层验证规则
- 审查输出规范
- 本设计中的 no-MCP 决策

### 修改

- 不再将根 `AGENTS.md` 视为唯一的定制资产
- 将其收敛为薄层 backbone instruction 文件
- 将操作细节迁移到 `.github/skills`、`.github/agents`、`.github/instructions`、`.github/hooks`
- 加入 autoloop 规则组：
  - 没有证据不得自称完成
  - 每轮编辑后必须验证
  - 每轮验证后必须审查
  - 审查 findings 必须回流到下一轮修复

### 新增

- `sp-*`、`ecc-*`、`pro-*` 的优先级规则
- 专业技能执行后必须将控制权交还骨架循环的规则
- `loop-operator` 的显式升级条件

## 迁移计划

### Phase 1：基础层

- 收敛根目录 `AGENTS.md`
- 新增 `.github/instructions`
- 新增 `.github/agents`
- 如需要，增加 `.github/review-state/.gitkeep`

### Phase 2：骨架 skills

- 迁入并改写选定的 `sp-*` skills

### Phase 3：ECC 辅助层

- 迁入并改写 `ecc-*` 循环辅助技能

### Phase 4：专业层

- 迁入 `pro-ui-ux-pro-max`
- 建立未来 `pro-*` 技能的扩展契约

### Phase 5：hooks 与 scripts

- 实现状态、验证、分片准备、聚合与下一步决策脚本
- 通过 hooks 接通整条链路

### Phase 6：干跑验证

- 使用一个模拟任务跑通：
  - 实施
  - 验证
  - reviewer 分片审查
  - 下一步决策

## 验收标准

当满足以下条件时，本设计视为成功：

- 用户可以在 VS Code Agent Mode 或 Copilot CLI 中选择 `codexmanager-autoloop`
- 该 agent 能自然命中仓库内的 skills 与 instructions
- 编辑后会先验证，再决定是否可以继续
- 验证后每轮都会执行全仓审查
- review 输出会持久化到 `.github/review-state`
- 循环会持续，直到验证与审查共同表明收敛
- 将来新增 `pro-*` skills 时，无需重写骨架架构

## 风险与缓解

### 风险：循环成本与延迟过高

缓解：

- 分片审查
- 保持 hooks 轻量
- 持久化 review 状态
- 仅对相关改动层级执行高成本命令

### 风险：custom agents 在 VS Code、CLI、GitHub.com 的表现不一致

缓解：

- 先以 VS Code Agent Mode 与 Copilot CLI 为主目标
- GitHub.com 兼容性视为次级目标
- 避免依赖已知只在部分环境生效的字段

### 风险：专业技能覆盖主流程

缓解：

- 在 `AGENTS.md` 与每个 `pro-*` skill 中明确要求：执行后必须将控制权交回骨架循环

### 风险：仓库级状态文件过于嘈杂

缓解：

- 保持机器可读且尽量精简
- 用覆盖当前轮摘要替代无控制地追加日志

## 推荐决策

建议按以下方案推进：

- 保留根目录 `AGENTS.md`，但收敛为薄层常驻指令
- 新增 `.github/agents`、`.github/skills`、`.github/instructions`、`.github/hooks`、`.github/scripts`
- 以 `superpowers` 为骨架
- 仅把 ECC 的循环与验证模式作为辅助层
- 将 `ui-ux-pro-max` 作为第一批 `pro-*` 技能，并为未来专业技能扩展预留统一契约

这是在不依赖用户级安装与 MCP 的前提下，实现仓库级 Copilot 自主迭代的最兼容方案。
