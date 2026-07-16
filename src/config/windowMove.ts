/**
 * 自主窗口移动的安全参数。
 *
 * 所有距离和坐标均为物理像素，时间单位为毫秒。
 */
export const WINDOW_MOVE_CONFIG = {
  /** 最大移动速度（物理像素/毫秒），防止窗口瞬移。 */
  maxSpeedPxPerMs: 2.5,

  /** 默认动画时长（毫秒），当请求未指定时使用。 */
  defaultDurationMs: 1200,

  /** 动画时长上限（毫秒），防止超长动画。 */
  maxDurationMs: 5000,

  /** 窗口与工作区边缘的最小留白（物理像素）。 */
  boundaryMarginPx: 8,

  /** 两次自主移动之间的最小间隔（毫秒），用于频率限制。 */
  minIntervalMs: 500,

  /** 动画帧间隔（毫秒），用于 requestAnimationFrame 节流。 */
  frameIntervalMs: 16,
} as const;
