---
name: sp-verification-before-completion
description: "当准备宣称完成、提交或交接时，如果需要新鲜的验证证据、新鲜的审查证据以及当前 next-step 决策三者一致，就应使用此技能。"
---

# SP 完成前验证

在宣称完成、提交或交接之前，使用此技能。

## 工作流

1. 确认 `.github/review-state/verify-summary.json` 中存在与当前任务相关的验证结果。
2. 确认 `.github/review-state/review-summary.json` 中存在新鲜的审查 summary。
3. 确认 `.github/review-state/next-step.json` 存在，且其中决策为 `ready-to-summarize`。
4. 在结束前检查新鲜度、会话一致性、未解决 findings、重复 findings、聚合错误和收敛状态。
5. 如果决策不是 `ready-to-summarize`，就继续迭代，而不是结束。

## 约束

- 没有新鲜验证、新鲜审查，以及匹配的 `ready-to-summarize` 决策时，不要说任务已完成。
- 当改动跨层时，不要把单个通过的命令误当成完整验证。
- 不要因为最新验证通过，就忽略未解决 findings 或陈旧的会话产物。
