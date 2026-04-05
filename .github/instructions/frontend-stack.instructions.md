---
applyTo: "apps/src/**/*.ts,apps/src/**/*.tsx,apps/src/**/*.css,apps/src/**/*.scss,apps/package.json,apps/components.json,apps/next.config.ts,apps/eslint.config.mjs,apps/tsconfig.json"
---

# 前端栈约束

- 优先保持 Next.js App Router 现有模式，静态布局优先服务端组件；只有交互边界才加 `"use client"`。
- 复杂业务逻辑继续下沉到自定义 Hook 或 `lib` 层，不要把状态编排塞回页面组件。
- 桌面端前后端通信统一复用 `@/lib/api/transport` 中的 `invoke` / `invokeFirst`；不要在桌面链路里直接 `fetch()`。
- 保持现有 Glassmorphism 与 12 主题设计语言；`body.low-transparency` 启用时必须回退纯色并禁用模糊/渐变。
- 避免嵌套 `<button>`；沿用现有 shadcn / Base UI 触发器模式保证可访问性。
- 改动前端、组件、`lib/api` 或桌面静态导出相关内容后，优先执行 `apps/` 下的 `pnpm run build:desktop`；局部改动可先补 `pnpm run lint`。
