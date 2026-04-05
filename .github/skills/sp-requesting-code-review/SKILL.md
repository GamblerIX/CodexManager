---
name: sp-requesting-code-review
description: "当每轮编辑和验证之后都需要由 code-reviewer 执行全仓审查、保留稳定分片证据，并决定是否继续下一轮修复时使用。"
---

# SP 请求代码审查

每一轮编辑后都要使用此技能，而不是只在最后阶段使用。

## 工作流

1. 先运行与当前改动最相关的验证。
2. 调用 `code-reviewer`，对当前这一轮编辑执行全仓审查。
3. 将分片集合固定为 `frontend` / `tauri` / `core` / `service` / `meta`，让 findings 能跨轮次稳定对比。
4. 要求 `.github/review-state/review-shards/` 下存在新鲜分片产物，并把 `.github/review-state/review-summary.json` 作为审查证据读取。
5. 审查聚合完成后，运行 `.github/scripts/loop/decide-next-step.ps1`，让 `.github/review-state/next-step.json` 反映当前轮次。
6. 如果仍有未解决 findings，就修复它们并进入下一轮编辑。
7. 只有当 summary 足够新鲜、足够干净，且下一步决策不再要求继续工作时，才允许向完成态靠近。

## 约束

- 不要把审查当成形式化动作。
- 当仓库级行为可能变化时，不要只看局部 diff 就停止。
- 不要因为前一轮审查通过，就在后一轮跳过审查。
- 只要还有未解决 findings，或审查尚未收敛，就不能宣称完成。
