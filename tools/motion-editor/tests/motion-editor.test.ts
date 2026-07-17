import { describe, it, expect } from "vitest";
import { inspectSvgForImport } from "../src/import/inspectSvgForImport";
import {
  lerp,
  easeInOut,
  clamp,
  interpolateKeyframes,
} from "../src/motion/interpolate";
import type { MotionKeyframe } from "../src/motion/interpolate";
import { DEFAULT_EXPERIMENTAL_CLIP } from "../src/motion/experimentalMotion";
import {
  serializeProject,
  parseProject,
} from "../src/project/experimentalProject";
import type { ExperimentalProject } from "../src/project/experimentalProject";

// =============================================================================
// P0-B: 诊断测试 (unified inspectSvgForImport)
// =============================================================================

describe("P0-B 诊断", () => {
  it("拒绝 <script> 节点", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.hasError).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === "error" && d.message.includes("script"))).toBe(true);
  });

  it("拒绝 <foreignObject> 节点", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject id="fo"><div xmlns="http://www.w3.org/1999/xhtml"><b>test</b></div></foreignObject></svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.hasError).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === "error" && d.message.toLowerCase().includes("foreignobject"))).toBe(true);
  });

  it("拒绝 onclick 等事件属性", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g onclick="alert(1)" id="test"/></svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.hasError).toBe(true);
    expect(result.diagnostics.some((d) => d.severity === "error" && d.message.includes("on"))).toBe(true);
  });

  it("检测重复 ID", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><circle id="a" cx="1" cy="1" r="1"/><rect id="a" x="1" y="1" width="1" height="1"/></svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.hasError).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes("重复 ID"))).toBe(true);
  });

  it("检测孤立 pivot（pivot 存在但无对应部件）", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <ellipse inkscape:label="pivot_nonexistent_part" cx="10" cy="10" rx="1" ry="1"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.diagnostics.some((d) => d.message.includes("孤立 pivot"))).toBe(true);
  });

  it("检测部件缺少 pivot", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <g inkscape:label="arm_left" id="arm_left"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.diagnostics.some((d) => d.message.includes("缺少 pivot 标记"))).toBe(true);
  });

  it("拒绝 http: 外部引用（error 级别）", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="http://evil.com/bad.png"/></svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.hasError).toBe(true);
    expect(result.diagnostics.some((d) => d.message.includes("http:"))).toBe(true);
  });
});

// =============================================================================
// P0-C: 部件检测测试 (via inspectSvgForImport)
// =============================================================================

describe("P0-C 部件检测", () => {
  it("从 SVG 发现语义部件", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <g inkscape:label="arm_left" id="arm_left"/>
  <g inkscape:label="arm_right" id="arm_right"/>
  <g inkscape:label="head" id="head"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.parts).toHaveLength(3);
    const ids = result.parts.map((p) => p.partId).sort();
    expect(ids).toEqual(["arm_left", "arm_right", "head"]);
  });

  it("排除容器 label (character)", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <g inkscape:label="character" id="char"/>
  <g inkscape:label="arm_left" id="arm_left"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].partId).toBe("arm_left");
  });

  it("排除容器 label (hair_accessory)", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <g inkscape:label="hair_accessory" id="ha"/>
  <g inkscape:label="arm_left" id="arm_left"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].partId).toBe("arm_left");
  });

  it("排除 pivot_* 前缀 label", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <ellipse inkscape:label="pivot_arm_left" cx="10" cy="10" rx="1" ry="1" id="p1"/>
  <g inkscape:label="arm_left" id="arm_left"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].partId).toBe("arm_left");
    expect(result.pivotMap.has("arm_left")).toBe(true);
    const pivot = result.pivotMap.get("arm_left")!;
    expect(pivot.x).toBe(10);
    expect(pivot.y).toBe(10);
  });

  it("读取 pivot 坐标", () => {
    const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <ellipse inkscape:label="pivot_arm_right" cx="25.5" cy="33.7" rx="1" ry="1" id="par"/>
  <g inkscape:label="arm_right" id="arm_right"/>
</svg>`;
    const result = inspectSvgForImport(svg);
    const pivot = result.pivotMap.get("arm_right")!;
    expect(pivot.x).toBeCloseTo(25.5);
    expect(pivot.y).toBeCloseTo(33.7);
    expect(pivot.sourceElementId).toBe("par");
  });
});

// =============================================================================
// P0-D: 插值测试
// =============================================================================

describe("P0-D 插值", () => {
  describe("lerp", () => {
    it("t=0 返回 a", () => expect(lerp(10, 20, 0)).toBe(10));
    it("t=1 返回 b", () => expect(lerp(10, 20, 1)).toBe(20));
    it("t=0.5 返回中点", () => expect(lerp(10, 20, 0.5)).toBe(15));
    it("负 t 外推", () => expect(lerp(10, 20, -1)).toBe(0));
  });

  describe("easeInOut (smoothstep)", () => {
    it("t=0 → 0", () => expect(easeInOut(0)).toBe(0));
    it("t=1 → 1", () => expect(easeInOut(1)).toBe(1));
    it("t=0.5 → 0.5", () => expect(easeInOut(0.5)).toBe(0.5));
    it("t=0.25 → 0.125", () => expect(easeInOut(0.25)).toBe(0.125));
    it("t=0.75 → ~0.875", () => expect(easeInOut(0.75)).toBeCloseTo(0.875, 10));
    it("不越过 [0,1]", () => {
      for (let i = 0; i <= 100; i++) {
        const v = easeInOut(i / 100);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
    it("输出有限", () => {
      for (let i = -10; i <= 110; i++) {
        expect(Number.isFinite(easeInOut(i / 100))).toBe(true);
      }
    });
  });

  describe("clamp", () => {
    it("值在范围内不变", () => expect(clamp(5, 0, 10)).toBe(5));
    it("低于下限", () => expect(clamp(-5, 0, 10)).toBe(0));
    it("高于上限", () => expect(clamp(15, 0, 10)).toBe(10));
  });

  describe("interpolateKeyframes", () => {
    const kfs: MotionKeyframe[] = [
      { frame: 0, values: { rotation: 0 } },
      { frame: 10, values: { rotation: 90 } },
    ];

    it("首帧之前返回首帧值", () => {
      const r = interpolateKeyframes(kfs, -5);
      expect(r.rotation).toBe(0);
    });
    it("首帧处返回首帧值", () => expect(interpolateKeyframes(kfs, 0).rotation).toBe(0));
    it("末帧处返回末帧值", () => expect(interpolateKeyframes(kfs, 10).rotation).toBe(90));
    it("末帧之后返回末帧值", () => expect(interpolateKeyframes(kfs, 20).rotation).toBe(90));
    it("中间帧线性插值", () => expect(interpolateKeyframes(kfs, 5).rotation).toBeCloseTo(45, 5));

    it("角度插值 (-55° 到 0°)", () => {
      const kf2: MotionKeyframe[] = [
        { frame: 0, values: { rotation: -55 } },
        { frame: 24, values: { rotation: 0 } },
      ];
      expect(interpolateKeyframes(kf2, 0).rotation).toBeCloseTo(-55, 5);
      expect(interpolateKeyframes(kf2, 24).rotation).toBeCloseTo(0, 5);
      expect(interpolateKeyframes(kf2, 12).rotation).toBeCloseTo(-27.5, 5);
    });

    it("空关键帧返回默认值", () => {
      const r = interpolateKeyframes([], 10);
      expect(r.rotation).toBe(0);
      expect(r.scaleX).toBe(1);
      expect(r.opacity).toBe(1);
    });

    it("easeInOut 中间帧与线性不同", () => {
      const linear: MotionKeyframe[] = [
        { frame: 0, values: { rotation: 0 }, easing: "linear" },
        { frame: 10, values: { rotation: 100 } },
      ];
      const eased: MotionKeyframe[] = [
        { frame: 0, values: { rotation: 0 }, easing: "easeInOut" },
        { frame: 10, values: { rotation: 100 } },
      ];
      expect(interpolateKeyframes(linear, 2.5).rotation).toBeCloseTo(25, 5);
      expect(interpolateKeyframes(eased, 2.5).rotation).toBeCloseTo(12.5, 5);
    });
  });
});

// =============================================================================
// P0-E: 往返测试
// =============================================================================

describe("P0-E 项目序列化", () => {
  const validProject: ExperimentalProject = {
    experimentalSchema: "m8-p0@1",
    productionReady: false,
    sourceFingerprint: "abc123def456",
    clip: DEFAULT_EXPERIMENTAL_CLIP,
  };

  it("合法 project 导出再导入深度等价", () => {
    const json = serializeProject(validProject);
    const parsed = parseProject(json);
    expect(parsed.experimentalSchema).toBe("m8-p0@1");
    expect(parsed.productionReady).toBe(false);
    expect(parsed.sourceFingerprint).toBe("abc123def456");
    expect(parsed.clip.id).toBe(validProject.clip.id);
    expect(parsed.clip.partId).toBe(validProject.clip.partId);
    expect(parsed.clip.fps).toBe(validProject.clip.fps);
    expect(parsed.clip.durationFrames).toBe(validProject.clip.durationFrames);
    expect(parsed.clip.keyframes).toHaveLength(validProject.clip.keyframes.length);
    for (let i = 0; i < parsed.clip.keyframes.length; i++) {
      expect(parsed.clip.keyframes[i].frame).toBe(validProject.clip.keyframes[i].frame);
      expect(parsed.clip.keyframes[i].rotation).toBe(validProject.clip.keyframes[i].rotation);
      expect(parsed.clip.keyframes[i].easing).toBe(validProject.clip.keyframes[i].easing);
    }
  });

  it("字段顺序稳定", () => {
    const json = serializeProject(validProject);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(["experimentalSchema", "productionReady", "sourceFingerprint", "clip"]);
  });

  it("拒绝无效 JSON", () => {
    expect(() => parseProject("not json")).toThrow();
    expect(() => parseProject("{broken")).toThrow();
  });

  it("拒绝非 m8-p0@1 schema", () => {
    const bad = { ...validProject, experimentalSchema: "v1" };
    expect(() => parseProject(JSON.stringify(bad))).toThrow("experimentalSchema");
  });

  it("拒绝缺少 sourceFingerprint", () => {
    const bad = { ...validProject, sourceFingerprint: "" };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝 NaN 值", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, fps: null } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝负帧号", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, keyframes: [{ frame: -1, rotation: 0, easing: "linear" }] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝越界帧号", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, durationFrames: 24, keyframes: [{ frame: 99, rotation: 0, easing: "linear" }] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝重复 frame 号", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, keyframes: [{ frame: 0, rotation: 0, easing: "linear" }, { frame: 0, rotation: 10, easing: "linear" }] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝 fps=0", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, fps: 0 } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝 fps=61", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, fps: 61 } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝空 keyframes", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, keyframes: [] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it("拒绝 invalid easing", () => {
    const bad = { ...validProject, clip: { ...validProject.clip, keyframes: [{ frame: 0, rotation: 0, easing: "bounce" }] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });
});
