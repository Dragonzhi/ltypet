# 小洛宝 SVG 动画编辑器方案

> 文档状态：P0-P3 已完成，P4/P5 实施边界已冻结
>
> 决策日期：2026-07-16
>
> 上位计划：[`计划.md`](../计划.md) M8
>
> P0 可执行步骤：[`M8-P0实施手册.md`](./M8-P0实施手册.md)
>
> P1 可执行步骤：[`M8-P1实施计划.md`](./M8-P1实施计划.md)
>
> P2 验收：[`M8-P2验收报告.md`](./M8-P2验收报告.md)
>
> P3 验收：[`M8-P3验收报告.md`](./M8-P3验收报告.md)

## 1. 决策摘要

项目继续使用分层 SVG 作为角色生产渲染方案，并开发一套面向桌宠的轻量动画编辑器。编辑器以 [SVG-edit](https://github.com/SVG-Edit/svgedit) 的 `@svgedit/svgcanvas` 为画布和基础编辑能力来源，自行实现接近 Flash/Animate 的图层、轴心、时间轴、关键帧、补间、动作片段和导出流程。

SVG-edit 只承担选择、变换、缩放、画布导航、基础图形编辑和撤销等通用能力。角色 rig、动作数据、时间轴和运行时格式由本项目定义，不把生产数据绑定到 SVG-edit 的私有状态、完整 UI 或扩展内部结构。

编辑器必须作为独立开发工具存在，不能进入 `400×500` 桌宠生产窗口，也不能让 LLM、业务调度器或 Tauri 窗口逻辑依赖编辑器。

## 2. 背景与目标

现有 SVG 运行时已经证明以下能力可行：

- 分层部件、pivot 和纸片关节动画。
- 鼠标视线、头部探出、身体视差和程序化待机动作。
- 马尾、刘海、鬓发和发饰的物理回摆。
- 动作期间的绘制层级切换。
- 透明窗口轮廓命中和点击穿透。

当前瓶颈不是渲染，而是创作方式：继续在 TS/CSS 中手写动作关键帧，难以直观调整节奏、轴心、层级和多部件配合，也不利于后续增加服装和动作。

编辑器的目标是让不依赖代码的动作制作成为主路径：

1. 导入分层 SVG 并识别角色部件与 pivot。
2. 像 Flash 一样在帧时间轴上制作纸片关节动画。
3. 导出稳定、可校验、可版本化的动作数据。
4. 由桌宠 `CharacterRenderer` 播放命名动作。
5. 当前先把小洛宝的动作制作、保存、恢复和生产发布做顺手；未来有第二套服装素材后，再验证跨服装动作复用。

## 3. 非目标

第一阶段明确不做：

- 完整矢量绘图软件或 Inkscape 替代品。
- Live2D 式网格变形、蒙皮和参数化形变。
- Spine 式骨骼权重、IK、约束求解和网格附件。
- 路径节点逐帧变形、复杂遮罩动画和滤镜动画。
- 音频剪辑、视频导出和逐帧位图动画。
- 多人协作、素材市场、云存储和插件市场。
- 在编辑器中直接调用桌宠的 Tauri、LLM 或系统感知能力。

当简单纸片动画无法表达明确需求时，再用真实动作样例决定是否扩展；不能预先把编辑器做成通用动画平台。

## 4. 总体架构

```text
Inkscape / 其他 SVG 绘图工具
            │
            ▼
      分层 artwork.svg
            │
            ▼
┌─────────────────────────────────────┐
│ 小洛宝 Animation Studio            │
│                                     │
│ SVG-edit svgcanvas                  │
│ 选择 / 变换 / 缩放 / 撤销 / 导航   │
│             │                       │
│             ▼                       │
│ Rig 模型 / 时间轴 / 属性面板        │
│ 关键帧 / 补间 / 事件 / 预览         │
└─────────────┬───────────────────────┘
              │
              ▼
     rig.json + motions.json
              │
              ▼
       SvgCharacterRenderer
              │
              ▼
 BehaviorScheduler / Mock Agent / LLM
       只提交 motion.play("wave")
```

编辑器、文件格式和运行时必须分层：

- 编辑器 UI 可以替换，`rig.json` 和 `motions.json` 语义不随之变化。
- 运行时不能导入 SVG-edit，也不能读取编辑器内部对象。
- 动作协议只引用语义部件 ID 和命名动作，不引用 DOM selector。
- 源 SVG 是美术事实；rig 是结构事实；motion 是动作事实。

## 5. 仓库与依赖策略

编辑器当前位于 `tools/motion-editor/`，拥有独立 `package.json`、构建输出和测试配置；SVG-edit 的 UI 依赖不得并入桌宠生产 bundle。P5 再依据发布和维护成本决定继续使用 workspace，还是拆分为独立 `ltypet-motion-editor` 仓库，项目格式和共享核心不能因仓库位置改变。

原因：

- 当前 SVG-edit master 与桌宠使用不同的构建版本和依赖生命周期。
- 编辑器是开发工具，桌宠是面向用户的生产应用，发布边界不同。
- 独立依赖可以固定 SVG-edit 的精确版本或 commit，避免上游更新破坏创作环境。
- 编辑器可能采用完整浏览器窗口，桌宠则必须保持小型透明 Tauri 窗口。

上游管理规则：

1. 记录采用的 SVG-edit tag、commit 和许可证文件。
2. 优先依赖 `@svgedit/svgcanvas` 的公开 API。
3. 必须修改上游时，以少量、可列举的 patch 维护，并保留 upstream remote。
4. 不直接跟随 `master` 自动升级；升级前运行导入回归和交互回归。
5. 分发前保留许可证与第三方 notices，并审计实际打包内容。

## 6. 编辑器核心概念

### 6.1 Project

一次编辑会话对应一个角色项目，包含 SVG、rig、动作片段和编辑器元数据。项目不保存桌宠业务状态。

### 6.2 Part

Part 是可独立变换的语义部件，例如：

- `body`
- `head`
- `arm_left`
- `arm_right`
- `hair_tail_left`
- `hair_tail_right`
- `fringe`
- `accessory_blue_left`

Part 必须有稳定 ID。名称可以本地化，ID 不因改名、服装或编辑器显示顺序变化。

### 6.3 Pivot

Pivot 是 Part 局部坐标系中的旋转/缩放中心。导入时可读取现有 `pivot_<partId>` 标记，编辑器中也可以拖动修改。

Pivot 标记只在编辑器可见；生产渲染和轮廓命中必须排除它。保存时以数值写入 rig，不能要求运行时重新通过 DOM 包围盒猜测轴心。

### 6.4 Motion Clip

Motion Clip 是可命名、可单独播放的动作，例如 `idle`、`wave`、`sleep`、`stretch`。Clip 具有 FPS、总帧数、循环策略、轨道和事件。

### 6.5 Track 与 Keyframe

一个 Part 对应一条或多条属性轨道。第一版支持：

- `x`、`y`
- `rotation`
- `scaleX`、`scaleY`
- `opacity`
- 离散 `renderSlot`

关键帧保存明确数值和补间方式。没有关键帧的属性使用 bind pose，不隐式继承编辑器上一次选择产生的临时值。

### 6.6 Event Marker

事件标记位于指定帧，用于向运行时发出受控事件，例如动作完成提示、脚步落点或口型片段切换。第一版事件必须来自白名单，不允许嵌入 JavaScript、CSS 或 Tauri command。

## 7. Rig 与绘制层级模型

### 7.1 逻辑父级和绘制顺序分离

`logicalParentId` 决定变换继承，`renderSlot` 决定绘制顺序，两者不能再由同一 SVG DOM 嵌套关系隐式表达。

例如：

- 左右马尾的逻辑父级是 `head`，因此头部探出时连接点跟随头部。
- 马尾的默认绘制槽位可以是 `behind-body`，因此不必放进头部 DOM 图层。
- 右手的逻辑父级可以是 `body`，挥到水平位置时把 `renderSlot` 从 `behind-body` 离散切换为 `front-head`。

推荐初始槽位：

```text
behind-body
body-back
body
between-body-head
head
front-head
effects-front
```

槽位名称属于 rig 契约。动作只能选择声明过的槽位，不能写任意 z-index 或 DOM 路径。

### 7.2 Bind Pose

导入时记录每个 Part 的初始局部矩阵、pivot、逻辑父级和绘制槽位，组成 bind pose。现有素材包含镜像、斜切、非统一缩放和多层父级 matrix，因此 bind pose 必须保存完整的 SVG 2D 仿射矩阵 `[a, b, c, d, e, f]`，不能强行分解后只保存 `x/y/rotation/scale`。

如果 rig 的逻辑父级与源 SVG 的 DOM 父级不同，导入器先计算 Part 和逻辑父级的世界矩阵，再换算：

```text
bindMatrix(part) = inverse(worldBind(logicalParent))
                 × sourceWorldMatrix(part)
```

这样可以改变绘制容器和逻辑父级而不改变初始视觉位置。所有动作关键帧保存相对 bind pose 的可编辑增量，既保留复杂原始矩阵，又让时间轴只暴露平移、旋转、缩放和透明度。

运行时的基础矩阵组合为：

```text
world(part) = world(parent)
            × bindMatrix
            × authoredMotion
            × proceduralMotion
            × interactionOffset
```

围绕 pivot 的 authored 变换按固定顺序组合，第一版不提供 skew 关键帧：

```text
authoredMotion = translate(x, y)
               × translate(pivot.x, pivot.y)
               × rotate(rotation)
               × scale(scaleX, scaleY)
               × translate(-pivot.x, -pivot.y)
```

运行时应先计算最终世界矩阵，再把 Part 放入对应 render slot；DOM 中为了绘制层级发生的重排不能参与逻辑继承计算。实际实现可以使用嵌套 wrapper 或矩阵计算，但每个通道必须可独立归零、取消和调试。

### 7.3 动作与程序动画叠加

角色最终表现至少分为三类通道：

| 通道 | 来源 | 示例 |
|---|---|---|
| authored | 编辑器动作 | 招手、睡觉、伸懒腰 |
| procedural | 本地连续动画 | 呼吸、马尾物理、随机耳朵微动 |
| interaction | 用户或 Agent 参数 | 视线、头部探出、鼠标跟随 |

Clip 可以通过声明暂时接管某个通道，例如 `wave` 接管右手 authored 轨道，但不能默认关闭眨眼和头发物理。需要禁止的程序动画必须在 clip 元数据中显式声明，并在结束或中断后恢复。

## 8. 文件格式

第一版使用可读 JSON，便于 diff、测试和手工诊断。建议项目目录：

```text
character-project/
  artwork.svg
  rig.json
  motions.json
  editor.json
```

- `artwork.svg`：原始分层美术；不得嵌入脚本和外部网络资源。
- `rig.json`：部件、轴心、逻辑父级、bind pose、槽位和兼容版本。
- `motions.json`：命名 clip、关键帧、缓动和事件。
- `editor.json`：面板布局、时间轴缩放、折叠状态等非生产数据。

### 8.1 Rig 草案

```ts
interface CharacterRig {
  schemaVersion: 1;
  rigId: string;
  artwork: string;
  viewport: { width: number; height: number };
  renderSlots: string[];
  parts: RigPart[];
}

interface RigPart {
  id: string;
  // 当前 artwork 内的绑定，不是跨服装共享的语义身份。
  sourceElementId: string;
  logicalParentId: string | null;
  defaultRenderSlot: string;
  pivot: { x: number; y: number };
  bindMatrix: AffineMatrix;
  tags?: string[];
}

type AffineMatrix = [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

interface TransformValue {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}
```

`RigPart.id` 是动作、编辑器和不同服装共享的语义 Part ID，例如
`arm_right`；`sourceElementId` 只是某一份 artwork 内定位源节点的绑定，例如
当前素材中的 `layer21`，不同服装可以不同。导入器可优先从唯一的
`inkscape:label` 得到语义 ID，再解析并记录当前 DOM ID。P0 不要求修改源 SVG
加入 `data-part`；是否在派生的运行时 artwork 中生成 `data-part`，由 P1 的绑定
格式验证后再决定。

### 8.2 Motion 草案

```ts
interface MotionLibrary {
  schemaVersion: 1;
  rigId: string;
  clips: MotionClip[];
}

interface MotionClip {
  id: string;
  fps: number;
  durationFrames: number;
  loop: boolean;
  tracks: PartTrack[];
  events: MotionEvent[];
  suppressProceduralChannels?: string[];
}

interface PartTrack {
  partId: string;
  keyframes: MotionKeyframe[];
}

interface MotionKeyframe {
  frame: number;
  values: Partial<TransformValue> & { renderSlot?: string };
  easing?: EasingValue;
}

type EasingValue =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | { cubicBezier: [number, number, number, number] };

interface MotionEvent {
  frame: number;
  type: string;
  payload?: Record<string, string | number | boolean>;
}
```

### 8.3 格式约束

- `schemaVersion`、`rigId`、Part ID 和 Clip ID 必须校验。
- 拒绝重复 ID、未知 Part、未知槽位、非有限数值、负帧和越界帧。
- FPS 第一版默认 24，可选范围暂定 `1..60`。
- `scaleX/scaleY`、opacity、坐标和角度必须设置安全范围。
- 未知字段可以按版本策略忽略或拒绝，但行为必须有测试并保持一致。
- 导出顺序稳定，避免仅因对象遍历顺序产生巨大 diff。
- 编辑器预览与运行时必须共享同一个纯函数插值核心，防止“编辑器里正确、桌宠里不同”。

## 9. Flash 风格交互

### 9.1 布局

```text
┌──────────────┬──────────────────────────┬──────────────┐
│ 图层 / Rig   │                          │ 属性         │
│ Part 树      │          舞台            │ Transform    │
│ 显隐/锁定    │                          │ Pivot/Easing │
├──────────────┴──────────────────────────┴──────────────┤
│ 动作选择 │ 播放控制 │ 帧标尺 │ 轨道与关键帧          │
└───────────────────────────────────────────────────────┘
```

### 9.2 第一版操作

- 单击选择 Part；双击可进入组内编辑，但默认以语义 Part 为选择单位。
- 舞台直接拖动移动，旋转手柄旋转，缩放手柄缩放。
- Pivot 使用独立工具拖动，不能与普通几何选择混淆。
- 时间轴播放头可拖动并实时更新舞台。
- 修改属性时，如果当前帧已有关键帧则更新；没有关键帧时必须明确提示插入，第一版不默认静默自动打帧。
- 支持复制、粘贴、移动和删除关键帧。
- 支持多选关键帧整体平移，但第一版不要求多部件同时自由变换。
- `renderSlot` 使用阶梯/离散轨道，不做数值补间。

### 9.3 建议快捷键

| 快捷键 | 行为 |
|---|---|
| `F6` | 插入或更新关键帧 |
| `Shift+F6` | 删除当前关键帧 |
| `Enter` | 播放/暂停 |
| `,` / `.` | 前一帧/后一帧 |
| `Home` / `End` | 首帧/末帧 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销/重做 |
| `Space + 拖动` | 平移舞台 |
| `Delete` | 删除选中的关键帧或允许删除的编辑对象 |

快捷键必须在文本输入框聚焦时正确让路，并提供菜单或按钮替代路径。

## 10. SVG 导入与安全边界

导入是首个决策门。P0 使用已烘焙复杂 transform 的
`src/assets/小洛宝.glax.svg` 完成可行性验证，并以 `src/assets/小洛宝.svg`
作为 Inkscape 美术源和视觉/结构对照。P3 之后，P4 默认打开的正式资产是
`src/assets/character/xiaoluobao/artwork.svg`，并与同目录的 `rig.v1.json`、
`motions.v1.json` 组成当前生产项目。旧两份 SVG 继续用于来源和回归对照，不能
因为正式版本更容易导入，就跳过 fingerprint、视觉差异和派生可复现性检查。

导入流程：

1. 解析并安全清理 SVG，拒绝脚本、事件属性、`foreignObject` 和外部网络引用。
2. 读取 `viewBox`、稳定 ID、分组、Inkscape label 和 pivot 标记。
3. 显示导入诊断：重复 ID、缺失 ID、不可逆变换、未知引用、pivot 缺失。
4. 建立 rig 草案，但不改写原始 SVG。
5. 在隔离副本中交给 svgcanvas 编辑和预览。
6. 保存前验证 Part 与源元素映射仍然存在。

首个原型必须验证：

- 视觉与 Inkscape 渲染一致。
- 部件 ID、分组层级和 pivot 坐标没有漂移。
- 选择一个 Part 不会意外拆散其内部路径。
- 导入后不修改并保存时，不产生不可解释的大范围结构重写。
- 带父级 matrix、镜像和斜切的部件行为可预测。

如果完整 SVG-edit editor 会重写结构，改为只使用 svgcanvas 的舞台能力，并由项目自己的导入器和序列化器持有源文档；不能通过把全部图形转路径来掩盖生产格式问题。

## 11. 撤销、保存与恢复

- Rig 修改、关键帧修改、动作长度、补间和层级切换必须进入统一命令历史。
- P4 保持 SVG 路径和填色只读，因此统一历史只负责 rig、motion 和编辑会话操作；未来若开放几何编辑，必须先解决它与动作编辑的统一撤销顺序，不能出现两个互不知情的撤销栈。
- 自动保存写入恢复文件，不覆盖用户明确保存的项目。
- 保存使用临时文件加原子替换；失败时保留上一版本。
- 崩溃恢复必须提示恢复来源和时间，不能静默覆盖正式文件。
- `editor.json` 损坏不能阻止打开 artwork、rig 和 motion。

## 12. 运行时接入

编辑器产物通过 `SvgCharacterRenderer` 接入已有语义动作协议：

```ts
await renderer.playMotion("wave", {
  signal,
  blendInMs: 80,
  blendOutMs: 120,
});
```

运行时职责：

- 载入并校验 rig/motion 版本。
- 把归一化播放时间换算到帧并插值。
- 执行离散层级切换和白名单事件。
- 支持完成、中断、超时、恢复和 cleanup。
- 通过 `AbortSignal` 或等价机制响应调度器中断。
- clip 结束后恢复合法的 idle/程序动画状态。
- `prefers-reduced-motion` 下按策略缩短、替代或跳过动作，但必须正确完成 Promise。
- 缺失动作返回稳定的 `unsupported_action` 或 `renderer_unavailable`，不能静默伪装成功。

开发环境应提供热重载动作 JSON 的能力，但热更新不能重建 SVG rig、漂移 pivot 或遗留上一动作的 RAF。

## 13. 多服装兼容（暂缓）

当前尚未准备第二套可用服装素材，因此 P4/P5 不以多服装验证作为通过门槛，也不为了假想素材提前实现复杂重定向、fallback 编辑器或换装 UI。当前工作的主目标是让用户能稳定调整现有小洛宝的动画。

本节保留为未来约束。第二套服装具备独立分层 SVG、可识别语义 Part 和明确授权来源后，再在 M8 后续阶段或 M9 中恢复实施。

动作复用依赖 rig 契约，而不是图形完全相同。

每套服装必须声明：

- `rigVersion`
- 支持的 Part ID
- 支持的 render slot
- 支持的命名动作或降级映射
- 可选的动作修正参数

同一动作在不同服装上的策略：

1. Part 和能力完全匹配：直接播放。
2. 可选装饰 Part 缺失：忽略该轨道并记录诊断。
3. 必需 Part 缺失：使用声明过的 fallback clip。
4. 无 fallback：明确拒绝，不留下半切换角色。

第一版不做任意骨骼重定向。需要复用动作的服装必须遵守统一 Part ID、逻辑父级和轴心约定。

## 14. 分阶段实施

### P0：SVG-edit 可行性尖峰（已完成）

目标：证明现有素材能被可靠导入、选中、变换和保存动画数据。

- [x] 建立独立编辑器 workspace，固定 SVG-edit/svgcanvas 精确版本。
- [x] 打开 `小洛宝.glax.svg` 并生成导入诊断，同时对原始 `小洛宝.svg` 运行对照诊断。
- [x] 验证 ID、分组、pivot 和视觉往返。
- [x] 选中 `arm_right`，在两个时间点旋转并插值预览。
- [x] 输出最小 motion JSON，不修改生产 SVG。
- [x] 记录 SVG-edit 公开 API、不得依赖的 private API 和必要 patch。

通过门槛：可以制作并预览一次右手挥动，重新打开项目后结果一致。若导入、选择模型或序列化无法稳定满足要求，停止扩展 UI，重新评估画布内核。

### P1：格式与纯动画核心（已完成）

- [x] 确定 rig/motion JSON Schema 和版本策略。
- [x] 实现校验器、稳定序列化和错误诊断。
- [x] 实现帧时间、关键帧查询、补间和 cubic bezier。
- [x] 实现 logical parent、bind pose 和 render slot 数学。
- [x] 为插值、边界、无效输入和矩阵组合增加单元测试。

通过门槛：不依赖 React 和 SVG-edit即可用纯测试复现任意帧姿态。

### P2：Flash 风格时间轴 MVP（已完成）

- [x] Part 图层树、锁定、显隐和选择同步。
- [x] 动作列表、时间标尺、播放头和轨道。
- [x] F6 关键帧、删除、复制、粘贴和拖动。
- [x] 属性面板、pivot 工具和基础缓动。
- [x] 播放、暂停、逐帧和循环预览。
- [x] 统一撤销/重做和未保存提示。

通过门槛：用户不修改源码即可制作 `idle`、`wave` 和一个自选动作。

### P3：桌宠运行时接入（已完成）

前置条件：`计划.md` M1-M4 的动作协议、调度器和渲染器适配层具备可用纵向链路。

- [x] `SvgCharacterRenderer.playMotion()` 播放导出 clip。
- [x] authored/procedural/interaction 变换互不覆盖。
- [x] 支持动作中断、结束恢复和 reduced motion。
- [x] 支持离散 render slot 切换且视觉无跳变。
- [x] Mock Agent 可调用命名动作并观察结构化结果。

通过门槛：编辑器制作的 `wave` 在真实 Tauri 窗口播放，拖动、穿透、眨眼、视线和头发物理不退化。

### P4：当前角色动画创作闭环

目标：不再依赖源码和手改 JSON，让用户可以打开当前小洛宝素材，持续调整动作，安全保存工作进度，并把确认后的动作发布到生产桌宠。P4 仍是角色动画编辑器，不扩张成 SVG 路径绘图工具。

#### P4-0：素材与项目打开流程

- [ ] 把现有“载入角色”明确标为“载入内置小洛宝”，保留一键进入示例的快速路径。
- [ ] 增加“打开角色素材”入口，可从文件选择器选择 `artwork.svg`、匹配的 `rig.v1.json`，以及可选的 `motions.v1.json`。
- [ ] 单独选择 SVG 时先运行安全检查和语义诊断；未提供 rig 时，只允许从当前支持的 `inkscape:label`、pivot 标记和默认槽位生成 rig 草案，不猜测复杂骨骼关系。
- [ ] 严格核对文件名、fingerprint、viewBox、Part binding 和 rigId；不匹配时显示可操作的诊断，不静默载入错误角色。
- [ ] 打开新素材或项目会替换当前文档时，必须先处理未保存修改。
- [ ] 当前正式支持范围只有 `xiaoluobao` rig；其他 SVG 可以查看诊断，但不承诺自动成为可生产角色。

#### P4-1：当前角色的 rig 调整

- [ ] 允许调整 Part 的语义 ID、source binding、pivot、logical parent 和 default render slot。
- [ ] rig 修改进入统一撤销历史，并立即更新舞台、时间轴和动作校验结果。
- [ ] source binding 丢失、重复、形成父级循环或矩阵不可逆时禁止发布。
- [ ] 提供“恢复正式 rig”和“对比正式 rig”能力，避免实验修改破坏唯一生产基线。
- [ ] SVG 路径、填色和节点几何继续只读；需要重画时回到 Inkscape，再重新导入并处理 fingerprint 变化。

#### P4-2：动作制作与润色主流程

- [ ] 以当前生产 `wave` 作为首个完整润色对象，支持从生产 motions 载入、修改、预览、导出和重新载入。
- [ ] 增加至少两个当前角色的非循环短动作样例；至少一个动作包含多 Part 协同，至少一个使用离散 render slot 或白名单事件。
- [ ] 提供轨道过滤、关键帧多选、区间缩放、批量移动和数值微调，降低密集动作的操作成本。
- [ ] 播放前、播放中和播放后都能准确显示当前帧数值，不把临时预览姿态写入正式数据。
- [ ] authored 动作只编辑导演型动作；呼吸、鼠标跟随、随机眨眼、耳朵和头发惯性继续由程序动画负责。
- [ ] 提供动作级校验摘要：缺失 Part、空轨道、越界关键帧、非法槽位、未支持事件和程序通道接管情况。

#### P4-3：保存、恢复与生产发布

- [ ] 定义版本化编辑器项目清单，至少引用 artwork、rig、motions，并保存非生产的面板/时间轴会话状态。
- [ ] 实现“新建/打开/保存/另存为/最近项目”；保存采用临时文件加原子替换。
- [ ] 自动保存只写恢复副本，不覆盖用户明确保存或仓库中的正式生产资产。
- [ ] 启动时发现恢复副本，显示来源、时间和与正式文件的差异，由用户决定恢复或丢弃。
- [ ] 导出继续生成独立 canonical `rig.v1.json` 和 `motions.v1.json`；UI 状态不得进入生产文件。
- [ ] 增加明确的“发布到当前小洛宝”流程：发布前完成全量校验、展示目标路径和差异，并要求用户确认；失败时保持上一份生产资产可用。
- [ ] 发布后可一键启动或提示运行桌宠验证，但编辑器不能绕过 `CharacterRenderer` 直接控制生产 SVG。

#### P4-4：可用性与验收

- [ ] 完善快捷键冲突、焦点让路、菜单/按钮替代路径和屏幕阅读语义。
- [ ] 100%、150%、200% DPI 下验证舞台命中、Gizmo、pivot、时间轴拖动和弹窗定位。
- [ ] 错误提示包含问题对象、原因和修复建议；不能只输出控制台堆栈。
- [ ] 编写“打开当前角色 → 修改 wave → 保存项目 → 导出 → 发布 → Tauri 验证”的完整教程。
- [ ] 提供一份不会覆盖生产资产的练习项目。

P4 通过门槛：用户从文件选择器打开当前 `artwork.svg + rig + motions`，在不改源码和 JSON 的情况下润色 `wave`、制作至少两个短动作，关闭并恢复项目，导出后由生产 `SvgCharacterRenderer` 正确播放；错误导入、取消发布或发布失败均不会损坏正式资产。

P4 暂缓项：第二套服装、跨服装兼容报告、动作重定向、fallback motion map、运行时换装和服装选择 UI。具备真实第二套服装后再以实际差异重新规划，不用当前小洛宝的复制品伪造验证。

### P5：开发工具工程化与发布

前置条件：P4 的当前角色创作闭环稳定，项目保存/恢复和生产发布路径已经在日常动作制作中实际使用。P5 不再补核心编辑能力，也不负责第二套服装。

#### P5-0：版本、迁移与可恢复性

- [ ] 为编辑器项目、rig 和 motions 建立明确的兼容矩阵；打开旧版本时先迁移副本，再由用户确认保存。
- [ ] 迁移、自动保存和崩溃恢复均保留上一版本与诊断日志，不允许不可逆原地升级。
- [ ] 建立损坏项目、磁盘写入失败、半写文件和未知 schema 的恢复测试。
- [ ] 发布包与桌宠运行时声明各自支持的 schema 范围，版本不兼容时明确阻止发布。

#### P5-1：上游与供应链

- [ ] 固定 `@svgedit/svgcanvas` 精确版本、上游 commit 和本项目 patch 清单。
- [ ] 审计 SVG-edit、运行时依赖、字体、图标和示例素材许可证，生成第三方 notices。
- [ ] 验证生产桌宠 bundle 不包含 svgcanvas/editor UI；编辑器发布包不包含无关 Tauri、LLM 或密钥能力。
- [ ] 建立依赖升级流程：单独分支、导入回归、时间轴回归、构建体积对比和人工验收。

#### P5-2：构建与 Windows 交付

- [ ] 确定交付形态：仓库内开发命令、Windows 便携包，必要时再增加独立安装包；三者读取同一种项目格式。
- [ ] 构建不依赖某台机器残留的 `dist`、全局 npm 包或未提交资源；在干净目录可复现。
- [ ] 处理单实例、文件关联、最近项目路径失效、中文路径、长路径和只读目录。
- [ ] 发布构建关闭开发入口和调试数据，保留可导出的本地诊断日志。
- [ ] 验证安装、升级、降级、卸载不会删除用户项目和恢复副本。

#### P5-3：稳定性与性能

- [ ] 使用当前小洛宝正式素材建立启动、导入、保存、预览和连续编辑的性能基线。
- [ ] 对长时间轴、密集关键帧和较大 SVG 做压力测试；设定可接受的启动时间、交互延迟和内存上限。
- [ ] 连续打开/关闭项目、播放/停止和撤销/重做后，不递增监听器、RAF、Worker、对象 URL 或 DOM wrapper。
- [ ] Windows 100%、150%、200% DPI，以及多显示器、休眠恢复和显卡/WebView2 差异下完成回归。
- [ ] 崩溃后可以恢复到最近自动保存点，且不会把临时预览姿态误写为正式动作。

#### P5-4：文档与发布门

- [ ] 编写安装、升级、项目备份、素材准备、动作制作、生产发布、故障恢复和隐私说明。
- [ ] 发布示例只使用许可明确的素材；角色 IP、工具代码和第三方依赖分别记录边界。
- [ ] 提供版本号、变更日志、已知问题、schema 兼容范围和回滚步骤。
- [ ] 发布前运行共享核心、编辑器、生产桌宠自动化，以及 P4 当前角色端到端人工验收。

P5 通过门槛：在一台没有仓库开发环境的受支持 Windows 机器上，可以安装或解压编辑器，打开当前小洛宝项目，修改并保存动作，安全恢复异常会话，导出与桌宠兼容的 canonical 资产，并按照文档完成升级和回滚。发布包具备许可证、版本、诊断和数据保留说明。

## 15. 测试与验收

### 自动化测试

- Schema：合法项目、未知版本、重复 ID、未知 Part、越界帧和非有限值。
- 时间：首尾帧、同帧覆盖、空轨道、循环边界和不同 FPS。
- 插值：线性、预设缓动、cubic bezier、角度和离散属性。
- 矩阵：父子继承、pivot、镜像、非统一缩放和负坐标。
- 层级：render slot 切换不改变逻辑父级和世界连接点。
- 序列化：稳定顺序、往返一致和版本迁移。
- 运行时：完成、中断、超时、缺失动作、reduced motion 和 cleanup。
- 项目：打开、另存为、恢复副本、最近项目失效、脏状态替换确认和旧版本迁移。
- 发布：目标差异、取消确认、校验失败、写入失败、原子替换和上一版本回退。
- 安全：脚本、事件属性、外部引用、binding 不匹配和损坏 JSON 均不能进入可发布状态。

### 真实编辑器验收

- 100%、150% 和 200% DPI 下选择框与鼠标位置一致。
- 从文件选择器打开正式 `artwork.svg + rig + motions` 后无部件错位；P0 的 `.glax.svg` 与原始 Inkscape SVG 继续作为视觉回归样本。
- Pivot 拖动后旋转中心稳定，撤销和重开项目后不漂移。
- 拖动播放头时舞台无明显停顿或历史状态泄漏。
- 关键帧密集时仍能选择、移动和撤销。
- 快捷键在舞台、时间轴和文本输入框中行为正确。
- 保存后关闭并重新打开，动作逐帧采样一致；存在恢复副本时不会静默覆盖正式项目。
- 发布前能看到目标和差异，取消或模拟写入失败后正式生产资产字节不变。

### 真实桌宠验收

- `wave` 可由单击、Mock Agent 和调度器触发。
- 动作中拖动窗口可立即打断或按策略并行，不冻结动画。
- 轮廓命中和点击穿透仍与可见 SVG 对齐。
- 头部动作时马尾逻辑连接点跟随，但仍绘制在指定后层。
- 手臂跨越水平位置时切换槽位，不在身体连接处明显跳变。
- 动作结束、异常和 HMR 后没有残留 transform、RAF 或事件监听。
- P4 新增的每个短动作都能通过 DebugConsole 播放、被用户动作中断并恢复程序动画。

## 16. 风险与应对

| 风险 | 应对 |
|---|---|
| SVG-edit 导入会改写复杂 SVG | P0 做视觉、ID、pivot 和结构往返；项目自己持有源文档 |
| 扩展 API 依赖内部实现 | 只用公开 svgcanvas API；隔离 adapter；固定 commit |
| 编辑器预览与桌宠表现不同 | 共享纯插值/矩阵核心和同一 schema 测试向量 |
| authored 与程序动画争抢 transform | 独立 wrapper/矩阵通道，显式接管与恢复 |
| 逻辑父级和绘制层级冲突 | rig 分离 `logicalParentId` 与 `renderSlot` |
| 编辑器范围膨胀 | 严守非目标；新能力必须由真实动作阻塞证明必要性 |
| 尚无第二套服装却提前设计兼容系统 | P4/P5 暂缓多服装；先用当前小洛宝完成真实动作创作闭环，素材具备后再恢复验证 |
| 上游更新破坏工具 | 精确锁定版本、维护少量 patch、升级回归 |
| 许可证或素材无法公开分发 | 独立审计代码依赖与角色 IP，不把二者混为一项结论 |

## 17. 当前动画迁移策略

P3 已把版本化 `wave` 接入生产运行时。后续动画迁移遵循：

- 呼吸、眨眼、耳朵、鼠标跟随和头发物理保留为程序动画。
- 当前生产 `wave` 是第一个 authored clip，也是 P4 首个润色对象。
- 新动作先在编辑器完成 canonical 导出和预览，再通过现有 `CharacterRenderer` 接入；不新增 CSS/组件旁路。
- 每次只发布一个动作变更，发布前保留上一份可用 motions，以文件级回退替代长期维护两套运行实现。
- 不把待机物理全部烘焙成关键帧；编辑器负责有明确导演节奏的动作，程序动画负责持续生命感。

## 18. Agent 交接规则

后续 Agent 实施本方案时：

1. 先查看 `计划.md` M8 状态与 M1-M4 前置条件。
2. P0-P3 已完成；P4 的生产发布仍不得绕过动作协议、调度器和 `CharacterRenderer`。
3. 不因编辑器开发修改桌宠窗口、穿透、拖动和原生菜单模型。
4. 不把“能打开 SVG”写成 P4 导入闭环通过；必须完成匹配 rig、保存、重开、导出和生产播放。
5. 不把未验证的 SVG-edit 私有方法写入长期文件格式或运行时接口。
6. 每完成一个阶段，在 `计划.md` M8 下记录实际结果、验证、风险和下一步；本文件只在技术方案本身变化时更新。
7. 第二套服装素材出现前，不实现或宣称已验证跨服装复用；不得复制当前素材伪造第二套服装验收。
