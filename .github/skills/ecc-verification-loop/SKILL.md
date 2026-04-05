---
name: ecc-verification-loop
description: "当主 sp-* 骨架需要重复执行检查、修复、再检查的节奏，并在完成后把控制权交回主流程时，作为辅助验证循环使用。"
---

# ECC 验证循环

当某项改动需要反复执行“验证、修复、再验证”的节奏时，使用此技能。

## 工作流

1. 对当前改动范围，用 `.github/scripts/verify/run.ps1` 执行最小相关验证。
2. 在继续编辑更多文件之前，先解释清楚失败原因。
3. 每修完一轮，都重新执行验证。
4. 将 `.github/review-state/verify-summary.json` 以清晰的通过/失败状态回传给主 `codexmanager-autoloop` 流程。

## 约束

- 仅作辅助：不要替代 `sp-*` 主骨架。
- 证据不完整时不要继续往前推进。
- 不要通过切换到无关工作来掩盖失败。
- 让循环始终锚定在仓库自身的检查上，之后再把控制权交回主 autoloop。
