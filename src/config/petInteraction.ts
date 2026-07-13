export const PET_INTERACTION_CONFIG = {
  /** 透明窗口的动态点击穿透。距离单位均为 CSS 像素。 */
  clickThrough: {
    // 监听和窗口坐标准备完成后默认启用。
    enabled: true,
    // 从穿透状态进入角色时使用较小容差，减少透明区域误拦截。
    enterPaddingCssPx: 5,
    // 已经可交互时使用更大退出容差，防止角色边缘快速闪烁。
    exitPaddingCssPx: 10,
  },
  /** 非阻塞原生窗口拖动。 */
  windowDrag: {
    // 光标移动超过此距离后才抑制单击动作。
    dragThresholdCssPx: 3,
    // 全局光标样本超过此时间后，按下瞬间改用 MouseEvent.screenX/Y 校准，避免窗口跳变。
    cursorSampleFreshnessMs: 100,
    // 全局松手事件异常丢失时自动结束拖动，避免永久卡在 drag 状态。
    safetyTimeoutMs: 30_000,
  },
} as const;
