export const PET_ANIMATION_CONFIG = {
  /** 鼠标位置驱动的分层跟随。所有 maxOffset 均为 CSS 像素。 */
  pointerFollow: {
    // 鼠标位于此点时角色正视屏幕。比例相对 pet-shell，offset 用于素材级微调（CSS px）。
    // 当前 y = 50% + 2px，约等于“小洛宝”双眼正中间。
    neutralPoint: {
      xRatio: 0.5,
      yRatio: 0.5,
      offsetX: 0,
      offsetY: 2,
    },
    // 鼠标距离上述正视锚点达到此值时，对应方向的动作幅度达到上限。
    fullRangeX: 150,
    fullRangeY: 120,
    // CSS 跟随补间时间；越大越柔和，但也会更迟钝。
    transitionMs: 110,
    // 眼睛是最直接的视线反馈。
    eye: { maxOffsetX: 0.6, maxOffsetY: 0.75 },
    // 眉毛、嘴和腮红只做小幅二级视差，避免五官显得僵硬。
    eyebrow: { maxOffsetX: 0.28, maxOffsetY: 0.2 },
    mouth: { maxOffsetX: 0.14, maxOffsetY: 0.1 },
    rouge: { maxOffsetX: 0.1, maxOffsetY: 0.07 },
    // 头部探出幅度最大；上下独立配置，旋转中心使用 SVG 中的 pivot_head。
    head: {
      maxOffsetX: 1.8,
      maxOffsetUp: 0.45,
      maxOffsetDown: 1.5,
      maxRotateDeg: 4,
    },
    // 身体只做克制的倾斜，双腿始终固定不参与跟随。
    body: { maxOffsetX: 0.55, maxOffsetY: 0.3, maxRotateDeg: 0.75 },
    // 双臂使用动作外层跟随；leftRestOffsetY 用于校准素材的静态高度差。
    arm: {
      maxOffsetX: 0.7,
      maxOffsetY: 0.38,
      maxRotateDeg: 0.45,
      leftRestOffsetY: -0.35,
    },
    // 马尾只绕 SVG 中各自的 pivot 转动，不再使用整体位移制造视差。
    hairTail: { maxRotateDeg: 1 },
  },
  /** 基于各 SVG pivot 的头发运动。角度单位 deg，时间单位 ms。 */
  hairMotion: {
    // 各部件的待机摆幅、周期与起始延迟；左右错相避免机械同步。
    idle: {
      tail: {
        maxRotateDeg: 1.2,
        durationMs: 4_400,
        leftDelayMs: 0,
        rightDelayMs: -2_200,
      },
      fringe: { maxRotateDeg: 0.35, durationMs: 3_800, delayMs: -650 },
      temple: {
        maxRotateDeg: 0.55,
        durationMs: 4_200,
        leftDelayMs: -1_100,
        rightDelayMs: -2_800,
      },
      blueAccessory: {
        maxRotateDeg: 0.75,
        durationMs: 3_400,
        leftDelayMs: -350,
        rightDelayMs: -1_850,
      },
      whiteAccessory: {
        maxRotateDeg: 0.55,
        durationMs: 3_800,
        leftDelayMs: -1_250,
        rightDelayMs: -250,
      },
    },
    // 快速拖动时马尾允许达到的最大反向旋转角度。
    maxInertiaRotateDeg: 7,
    // 达到最大惯性幅度所需的鼠标速度；越小越容易甩动。
    velocityForMaxPxPerMs: 1.1,
    // stiffness 越大回弹越快，damping 越大回摆次数越少。
    stiffness: 125,
    damping: 15,
    // 拖动速度停止后，惯性目标每秒衰减速度。
    targetDecayPerSecond: 9,
    // 各部件使用同一弹簧，但按比例降低响应强度。
    inertiaRatio: {
      tailLeft: 1,
      tailRight: 0.9,
      fringe: 0.12,
      temple: 0.22,
      blueAccessory: 0.3,
      whiteAccessory: 0.24,
    },
  },
  /** 双耳同步随机微动；间隔和持续时间单位 ms，位移单位 px。 */
  earTwitch: {
    // 每次动作结束后，在此随机区间内等待下一次微动。
    minDelayMs: 8_000,
    maxDelayMs: 16_000,
    durationMs: 620,
    // 耳朵上提距离和向外转动角度上限。
    maxLiftPx: 0.25,
    maxRotateDeg: 3,
  },
} as const;
