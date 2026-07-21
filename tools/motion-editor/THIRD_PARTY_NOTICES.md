# 第三方声明

本文件描述 Animation Studio 工具代码的依赖边界，不授予角色素材的再分发权。

## 主要组件

| 组件 | 版本来源 | 许可证 |
|---|---|---|
| SVG-Edit SVGCanvas | `@svgedit/svgcanvas@7.4.2` | MIT |
| React / React DOM | `package-lock.json` | MIT |
| Tauri JavaScript API | `package-lock.json` | Apache-2.0 OR MIT |
| Vite / Vitest / TypeScript | `package-lock.json` | 各包声明，主要为 MIT / Apache-2.0 |
| Tauri / rfd / serde 等 Rust crates | `src-tauri/Cargo.lock` | 各 crate metadata 声明 |

完整的 npm 与 Rust 依赖名称、锁定版本及 SPDX 风格许可证声明记录在 `THIRD_PARTY_LICENSES.generated.json`。使用 `npm run notices:generate` 从两份 lockfile 重新生成；出现 `UNKNOWN` 时发布必须暂停并人工核实。各许可证全文随依赖源码提供，发布者应按对应许可证要求随包分发。

## 项目自有内容与素材边界

- Animation Studio、桌宠运行时代码及项目自有测试的许可由仓库所有者另行决定，本文件不改变其权利状态。
- 小洛宝/洛天依角色图、服装、名称和相关视觉素材不是 SVG-Edit 示例素材，也不因工具使用开源依赖而变成开源素材。
- 发布示例不得默认携带无明确再分发授权的角色素材；内部开发包与公开工具包必须分别审计。
- 当前字体使用系统/UI fallback，不在工具包内分发第三方字体文件；图标来自本仓库 Tauri 图标资源，公开发布前仍需由项目所有者确认来源授权。

