---
name: ecc-continuous-agent-loop
description: "当需要通过停止条件、重复问题识别、next-loop 决策和范围控制来维持 sp-* 循环推进时，作为 ECC 辅助技能使用。"
---

# ECC 持续智能体循环

当迭代循环可能需要继续、缩小或停止时，将此技能作为辅助层使用。

## 工作流

1. 跟踪当前循环是否真的在推进。
2. 如果同类失败反复出现，或 churn 持续升高，优先诊断而不是继续改更多文件。
3. 当验证和审查阶段稳定后，运行 `.github/scripts/loop/decide-next-step.ps1`，写入 `.github/review-state/next-step.json`。
4. 如果决策要求升级，就调用 `loop-operator`，然后把控制权交还给主 `codexmanager-autoloop` 流程。
5. 如果范围在没有证据支撑的情况下不断扩大，就暂停并缩小问题。

## 约束

- 不要为了绕开硬失败而不断扩大范围。
- 不要把“有动作”误当成“有进展”。
- ECC 只作为辅助层存在，不能取代主流程。
