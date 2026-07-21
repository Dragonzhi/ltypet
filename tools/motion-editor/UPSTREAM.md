# SVGCanvas 上游锁定记录

Animation Studio 只把 SVG-Edit 的画布内核作为编辑器依赖；生产桌宠不依赖 SVGCanvas。

## 当前锁定

- npm 包：`@svgedit/svgcanvas@7.4.2`
- 上游仓库：`https://github.com/SVG-Edit/svgedit`
- npm tarball：`https://registry.npmjs.org/@svgedit/svgcanvas/-/svgcanvas-7.4.2.tgz`
- SRI：`sha512-18PixrbaGstEsZfijYeF+y69LDOfP/c68aVKR+Hh8S/YckbhxT4VpKJFf5Ang/Zd/Vvy63jPuf9O4pEDc4Gv+A==`
- 许可证：MIT

该版本的 npm metadata 与 tarball 没有发布 `gitHead`，上游仓库也没有与包版本一一对应、可离线证明的 commit 标识。因此当前以精确版本、registry URL、SRI 和纳入版本控制的 `package-lock.json` 共同标识输入，不伪造 commit hash。升级时若新包提供 `gitHead`，必须把它补入本文件。

## 本项目 patch 清单

- 没有修改 `node_modules/@svgedit/svgcanvas` 中的上游文件。
- `src/svgcanvas/SvgCanvasAdapter.ts` 是项目自有适配层，隔离公开/兼容 API、语义 Part 映射、安全导入和预览变换。
- `src/import/` 是项目自有的 SVG 安全检查，不属于上游 patch。
- 不允许通过手改 `node_modules` 修复问题；确需 patch 时必须提交可复现 patch 文件、原因和对应回归测试。

## 升级流程

1. 在独立分支只升级一个上游版本，并重新生成 lockfile 和第三方许可证清单。
2. 对原始 Inkscape SVG、`.glax.svg` 和正式 `artwork.svg` 执行导入/结构/视觉回归。
3. 执行 Part 选择、pivot、Gizmo、时间轴、撤销/重做、保存重开和 canonical 导出回归。
4. 比较编辑器 bundle 大小和 `npm run perf:baseline`；生产 bundle 必须继续不含 `svgcanvas`。
5. 完成 100%、150%、200% DPI 的真实 Windows 人工验收后才能更新本记录。

