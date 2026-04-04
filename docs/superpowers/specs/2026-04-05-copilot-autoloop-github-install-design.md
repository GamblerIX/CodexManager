# Copilot Repo-Level Autoloop Design

Date: 2026-04-05
Repo: `D:\Github\CodexManager\CodexManager`
Status: Draft approved in brainstorming, pending user review

## Goal

Install a repo-level GitHub Copilot workflow for this repository that enables one-session autonomous iteration in VS Code Agent Mode and Copilot CLI, using:

- `superpowers` as the primary workflow backbone
- `everything-claude-code` (ECC) as a loop-control and verification helper layer
- `ui-ux-pro-max` as the first professional domain skill in an extensible `pro-*` layer

The system should keep iterating within one session through:

1. design and planning
2. implementation
3. verification
4. full-repository parallelized review
5. next-round fixes

It should stop only when verification and review both indicate convergence, or when an explicit loop-safety stop condition is hit.

## Hard Constraints

- Repo-level only: all new reusable assets live under `.github/`, except the root `AGENTS.md` entrypoint that GitHub Copilot expects at repository root.
- No MCP dependency.
- No user-profile installation requirements such as `~/.codex`, `~/.claude`, `~/.agents`, or IDE-global configuration.
- No background daemons, observers, or session services outside the repo.
- The main agent must not proactively narrate completion progress as a substitute for evidence.
- Every modification round must trigger:
  - verification
  - full-repository review by `code-reviewer`
  - a next-step decision based on evidence

## Official Support Boundary

This design stays inside GitHub Copilot's documented repository customization surfaces:

- Root `AGENTS.md` for repository agent instructions
- `.github/agents/*.agent.md` for custom agents
- `.github/skills/<skill>/SKILL.md` for agent skills and their local helper files
- `.github/instructions/*.instructions.md` for path-specific instructions
- `.github/hooks/*.json` for Copilot hooks

Validated against GitHub and VS Code documentation on 2026-04-05:

- GitHub Docs: custom agents
  - <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents>
  - <https://docs.github.com/en/copilot/reference/custom-agents-configuration>
- GitHub Docs: custom instructions
  - <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions>
  - <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-reusable-instructions>
- GitHub Docs: skills
  - <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills>
- GitHub Docs: hooks
  - <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks>
  - <https://docs.github.com/en/copilot/reference/hooks-configuration>
- VS Code Docs: customization and custom agents
  - <https://code.visualstudio.com/docs/copilot/customization/overview>
  - <https://code.visualstudio.com/docs/copilot/customization/custom-agents>
  - <https://code.visualstudio.com/docs/copilot/agents/background-agents>

### Important Clarification

The repo should not rely on `.vscode/mcp.json`, `.github/mcp.json`, or any MCP-specific workflow. This design deliberately removes those dependencies.

Also, there is no GitHub Copilot hook named `pre-final-response`. Final-response discipline must therefore be enforced through:

- agent instructions
- `agentStop` and `subagentStop` hook checks
- review and verification state files

not through a non-existent hook phase.

## Target Architecture

The system is split into five layers.

### 1. Root `AGENTS.md`

Purpose:

- establish repo-wide autonomous iteration rules
- define the execution order for agents and skills
- prohibit fake completion claims without evidence
- define when to escalate to loop-safety handling

Design:

- keep this file concise and high-signal
- remove large procedural detail from the current version
- move path-specific content to `.github/instructions`
- move reusable workflows to `.github/skills`

### 2. `.github/instructions/`

Purpose:

- hold narrow, path-specific rules only
- keep routing precise and maintainable

Planned files:

- `.github/instructions/frontend-stack.instructions.md`
- `.github/instructions/tauri-rpc.instructions.md`
- `.github/instructions/rust-gateway.instructions.md`
- optional `.github/instructions/repo-review.instructions.md` for review-output formatting rules

Rule:

- use precise `applyTo` scopes
- avoid broad catch-all globs unless there is no narrower stable boundary

### 3. `.github/skills/`

Purpose:

- act as the primary workflow surface
- contain both backbone workflow skills and optional domain-specialist skills

Naming convention:

- `sp-*` for superpowers-based backbone workflows
- `ecc-*` for ECC loop and support workflows
- `pro-*` for domain-specific specialist skills

### 4. `.github/agents/`

Purpose:

- define the entry agent and the review/safety agents
- keep the picker small and purposeful

Planned agents:

- `codexmanager-autoloop.agent.md`
- `code-reviewer.agent.md`
- `loop-operator.agent.md`

### 5. `.github/hooks/` plus `.github/scripts/`

Purpose:

- encode lightweight triggers in hooks
- keep real orchestration in scripts
- persist loop state and review evidence inside the repo

## Desired Repository Layout

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

## One-Session Autoloop State Machine

The intended loop is:

1. intake
2. design or plan selection
3. implement
4. verify
5. full-repo review
6. decide next step
7. either iterate again or summarize

### State Definitions

#### Intake

The main agent reads:

- root `AGENTS.md`
- matching `.github/instructions/*.instructions.md`
- relevant `.github/skills/*/SKILL.md`

Decision rules:

- if the request changes behavior or adds capability, start with `sp-brainstorming`
- after design approval, use `sp-writing-plans`
- if the task is straightforward and already explicitly specified, the backbone may skip brainstorming only if `AGENTS.md` explicitly allows that shortcut; otherwise follow the backbone strictly

#### Implement

The main agent performs minimal necessary edits, following:

- repo instructions
- selected backbone skill
- selected specialist skill if applicable

It does not declare success based on subjective progress.

#### Verify

Every edit round must run a repository-aware verification matrix rather than a generic ECC command list.

#### Full-Repo Review

After each verification pass, the main agent must invoke `code-reviewer.agent.md`.

This reviewer performs:

- full-repository review every round
- fixed shard partitioning
- severity-ranked findings
- convergence assessment

#### Decide

The next step is chosen from evidence:

- verification failed -> fix and re-verify
- verification passed but review found issues -> fix findings
- repeated same-class failures -> invoke `loop-operator`
- verification and review converge -> summarize and stop

## Skill Layer Design

### Backbone Skills from Superpowers

These should be ported into Copilot-native repo skills, not copied blindly.

#### `sp-brainstorming`

Source:

- `C:\Users\Administrator\.codex\superpowers\skills\brainstorming\SKILL.md`

Keep:

- project-context-first design discipline
- one-question-at-a-time clarification style
- design-before-implementation rule
- spec-first workflow

Change:

- remove harness-specific tool references
- adapt wording for Copilot custom skills
- write spec files to this repo's docs structure

#### `sp-writing-plans`

Keep:

- detailed, execution-oriented implementation planning
- dependency ordering
- verification awareness

Adapt:

- CodexManager cross-layer impact analysis
- planned verification commands mapped to actual repo commands

#### `sp-requesting-code-review`

Keep:

- review-early principle
- subagent-based review handoff

Adapt:

- make review mandatory after every edit round, not just task milestones
- target repo-wide review instead of diff-only review
- integrate with `.github/review-state`

#### `sp-verification-before-completion`

Keep:

- "no evidence, no completion claim"

Adapt:

- consume `verify-summary.json`
- require review summary before final stop

#### `sp-systematic-debugging`

Keep:

- root-cause-first debugging
- non-random failure investigation

Use:

- when verify/review loops stall

#### `sp-test-driven-development`

Keep with adaptation:

- TDD as preferred mode for new behavior and bugfixes

But:

- do not force fake or low-value tests where repo constraints make that counterproductive
- align with the repo's existing testing patterns

### ECC Helper Skills

Only port loop-relevant ideas.

#### `ecc-continuous-agent-loop`

Source:

- `d:\Github\_tmp_ecc\skills\continuous-agent-loop\SKILL.md`

Keep:

- loop safety
- failure mode recognition
- recovery options

Remove:

- ECC-specific external dependencies and named pipelines

#### `ecc-verification-loop`

Source:

- `d:\Github\_tmp_ecc\.agents\skills\verification-loop\SKILL.md`

Keep:

- verification discipline across build, lint, type, tests, security, diff review

Adapt:

- replace generic `npm build` assumptions with CodexManager-specific matrix

#### `ecc-search-first`

Keep:

- repo-first and ecosystem-first reuse discipline

Adapt:

- no MCP branch
- prioritize local `rg` scans and repo pattern reuse

### Professional Skill Layer

#### `pro-ui-ux-pro-max`

Source:

- `C:\Users\Administrator\.codex\skills\ui-ux-pro-max`

Keep:

- design-system generation flow
- stack-aware UI guidance
- implementation checklist

Adapt:

- relocate scripts and data into the skill directory under `.github/skills/pro-ui-ux-pro-max`
- rewrite script paths to be repo-local and relative
- clearly state that this skill never overrides the backbone loop

### Explicitly Excluded Skill Types

Do not port these into the first design wave:

- MCP-dependent skills
- user-home bootstrap/install skills
- ECC conventions tied only to the ECC repo itself
- long-running observer or daemon skills
- skills whose core value depends on external servers or global machine state

## Agent Layer Design

### `codexmanager-autoloop.agent.md`

Purpose:

- primary entry agent for VS Code Agent Mode and Copilot CLI

Responsibilities:

- choose and invoke skills
- implement changes
- run verification
- invoke review
- continue until convergence or loop stop

Required behavior:

- do not report completion based on self-assessment
- after every edit round:
  - mark repo state dirty
  - run verification
  - invoke review
  - decide next step
- summarize only when evidence says to stop

Suggested tools:

- read/search
- edit
- terminal/execute
- agents
- todo/task tracking

### `code-reviewer.agent.md`

Base source:

- `C:\Users\Administrator\.codex\superpowers\agents\code-reviewer.md`

Key redesign:

- review the whole repo every round, excluding generated/build directories
- partition the repo into stable review shards
- run shard reviews in parallel when the environment supports agent delegation
- degrade to sequential shard review when needed
- remain read-only by default

Review shards:

- `apps/src`
- `apps/src-tauri`
- `crates/core`
- `crates/service`
- `scripts` and `.github`
- docs and config

Output contract:

- findings first
- severity order
- file references
- impact
- recommended fix
- convergence assessment
- residual blind spots

### `loop-operator.agent.md`

Base inspiration:

- `d:\Github\_tmp_ecc\agents\loop-operator.md`

Purpose:

- detect churn and stalled loops
- reduce scope when the main loop is repeating
- recommend a safer next cycle

When invoked:

- repeated verification failures with the same class of error
- repeated reviewer findings across consecutive rounds
- no measurable progress across two cycles

## Hook and Script Design

### Hook Philosophy

Hooks should trigger and gate. Scripts should do the work.

### Hook Events

Per GitHub's documented hook system, the relevant events are:

- `SessionStart`
- `PostToolUse`
- `AgentStop`
- `SubagentStop`

The final file names and JSON shape should follow GitHub's current hook schema, but logically they serve these roles.

### Planned Hook Responsibilities

#### Session start hook

- initialize `.github/review-state`
- clear stale state from previous sessions if needed
- stamp session metadata

#### Post-tool-use hook

- detect that edit-producing tools ran
- mark the session as requiring verification
- avoid running heavy review directly inside the hook

#### Agent-stop hook

- check whether the session is dirty
- if dirty, confirm verification and review artifacts exist
- if artifacts are missing, emit an instruction to continue the loop instead of treating the stop as converged

#### Subagent-stop hook

- collect shard review outputs
- trigger aggregation when all expected shard outputs exist

## Review and Verification Scripts

### `.github/scripts/loop/mark-dirty.ps1`

Writes lightweight state:

- whether code edits happened
- timestamp
- files touched if available

### `.github/scripts/verify/classify-changes.ps1`

Determines impacted layers from changed files:

- frontend
- tauri bridge
- core
- service
- scripts/config/docs

### `.github/scripts/verify/run.ps1`

Runs the minimum sufficient matrix for this repo.

Rules:

- frontend changes -> `apps/` build path first
- Tauri changes -> Tauri tests
- core/service changes -> targeted Rust build or tests
- protocol/gateway changes -> gateway regression scripts when applicable

Outputs:

- `.github/review-state/verify-summary.json`

### `.github/scripts/review/partition.ps1`

Produces stable review shards every round.

### `.github/scripts/review/prepare-shard.ps1`

Builds a shard context package:

- scope paths
- relevant recent file changes
- matching instructions
- verification status

### `.github/scripts/review/aggregate.ps1`

Consumes shard outputs and produces:

- deduplicated findings
- severity totals
- unchanged recurring findings
- convergence recommendation

Outputs:

- `.github/review-state/review-summary.json`

### `.github/scripts/loop/decide-next-step.ps1`

Reads verification and review artifacts and returns one of:

- `continue-fixing`
- `rerun-verification`
- `invoke-loop-operator`
- `ready-to-summarize`

## CodexManager-Specific Verification Matrix

The generic ECC workflow is not enough for this repo. Verification should be tied to existing repo guidance in `AGENTS.md`.

### Default verification

- frontend page/component/lib changes -> `pnpm run build:desktop` in `apps/`
- targeted frontend lint only when helpful and lower-cost

### Tauri bridge changes

- `cargo test` in `apps/src-tauri/`

### Rust core/service changes

- root workspace targeted build for `codexmanager-core` and `codexmanager-service`
- service tests when gateway, config, account, key, or protocol logic changed

### Protocol-specific changes

- `scripts/tests/gateway_regression_suite.ps1` for gateway/protocol/tool-call/streaming compatibility changes

### High-cost commands

- do not default to `cargo test --all`
- reserve full heavy regression for explicit release or deep validation work

## Full-Repository Review Policy

The user requirement is full-repo review every round. To make that feasible:

- always review all stable shards every round
- exclude generated/build directories such as:
  - `.git`
  - `target`
  - `node_modules`
  - other generated outputs
- allow depth bias:
  - changed shards get deepest attention
  - unchanged shards still get mandatory policy and risk review

This keeps the policy "full repo every round" while preventing pointless review of generated artifacts.

## Changes Required to the Existing `AGENTS.md`

The current file already contains strong repository policy, but it needs restructuring.

### Keep

- repo-specific coding constraints
- cross-layer verification rules
- review-output expectations
- no-MCP decision for this design

### Change

- do not treat root `AGENTS.md` as the only customization asset
- slim it down into a backbone instruction file
- move operational detail into `.github/skills`, `.github/agents`, `.github/instructions`, and `.github/hooks`
- add the autoloop rule set:
  - no self-declared completion without evidence
  - every edit round must verify
  - every verify round must review
  - review findings feed the next round

### Add

- clear priority order for `sp-*`, `ecc-*`, and `pro-*` skills
- explicit rule that specialist skills return control to the backbone loop
- explicit escalation rule for `loop-operator`

## Migration Plan

### Phase 1: Foundation

- slim root `AGENTS.md`
- add `.github/instructions`
- add `.github/agents`
- add empty `.github/review-state/.gitkeep` if needed

### Phase 2: Backbone skills

- port and rewrite the selected `sp-*` skills

### Phase 3: ECC helper layer

- port and rewrite `ecc-*` loop helpers

### Phase 4: Professional layer

- port `pro-ui-ux-pro-max`
- establish the extension contract for future `pro-*` skills

### Phase 5: Hooks and scripts

- implement state, verification, shard prep, aggregation, and decision scripts
- wire them through hooks

### Phase 6: Dry-run validation

- run a simulated task through:
  - implementation
  - verification
  - reviewer shards
  - next-step decision

## Acceptance Criteria

The design is successful when:

- a user can select `codexmanager-autoloop` in VS Code Agent Mode or Copilot CLI
- the agent naturally uses repo-local skills and instructions
- after edits, it verifies before claiming success
- after verification, it invokes repo-wide review every round
- review outputs are persisted under `.github/review-state`
- the loop continues until review and verification converge
- `pro-*` skills can be added later without rewriting the backbone architecture

## Risks and Mitigations

### Risk: loop cost and latency become too high

Mitigation:

- shard the review
- keep hooks lightweight
- persist review state
- reserve deep expensive commands for relevant change classes only

### Risk: custom agents behave differently across VS Code, CLI, and GitHub.com

Mitigation:

- target VS Code Agent Mode and Copilot CLI first
- treat GitHub.com compatibility as secondary
- avoid depending on properties that are known to be ignored outside IDEs

### Risk: specialist skills override core workflow

Mitigation:

- enforce in `AGENTS.md` and each `pro-*` skill that control returns to the backbone loop

### Risk: repo-level state files become noisy

Mitigation:

- keep them machine-readable and small
- overwrite current-cycle summaries instead of appending uncontrolled logs

## Recommended Decision

Proceed with:

- root `AGENTS.md` retained as the thin always-on instruction layer
- `.github/agents`, `.github/skills`, `.github/instructions`, `.github/hooks`, and `.github/scripts` added
- `superpowers` as the backbone
- ECC loop/verification patterns as helper layer only
- `ui-ux-pro-max` as the first `pro-*` skill in an extensible professional skill tier

This is the most compatible way to get repo-level Copilot autonomy without relying on unsupported user-level or MCP-only machinery.
