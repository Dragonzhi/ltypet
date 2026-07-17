/**
 * P1-0 适配器：封装 @svgedit/svgcanvas。
 *
 * 关键改进：
 * - 统一使用 inspectSvgForImport() 作为唯一安全门
 * - precisionPivotInPartLocal() 使用 getCTM() 换算 pivot 到 Part 局部坐标
 * - applyPreviewTransform() 使用 bindMatrix × authored 的 matrix() 形式
 */

// @ts-ignore — 无内置类型声明
import SvgCanvas from "@svgedit/svgcanvas";
import { inspectSvgForImport } from "../import/inspectSvgForImport";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface ImportedPartRef {
  partId: string;
  inkscapeLabel: string;
  sourceElementId: string;
  element: SVGElement;
}

export interface Diagnostic {
  severity: "error" | "warn" | "info";
  message: string;
}

export interface ImportResult {
  parts: ImportedPartRef[];
  pivotLocal: Map<string, { x: number; y: number }>;
  diagnostics: Diagnostic[];
}

export interface PreviewTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export interface StageAdapter {
  mount(container: HTMLElement): void;
  getVersion(): string;
  loadSvg(source: string): ImportResult;
  selectPart(partId: string): boolean;
  applyPreviewTransform(partId: string, transform: PreviewTransform): void;
  restoreBindPose(partId: string): void;
  getSerializedPreview(): string;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 辅助：矩阵
// ---------------------------------------------------------------------------

interface Mat6 {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

function identityMatrix(): Mat6 {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrix(l: Mat6, r: Mat6): Mat6 {
  return {
    a: l.a * r.a + l.c * r.b,
    b: l.b * r.a + l.d * r.b,
    c: l.a * r.c + l.c * r.d,
    d: l.b * r.c + l.d * r.d,
    e: l.a * r.e + l.c * r.f + l.e,
    f: l.b * r.e + l.d * r.f + l.f,
  };
}

function inverseMatrix(m: Mat6): Mat6 | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-10) return null;
  return {
    a: m.d / det,  b: -m.b / det,
    c: -m.c / det, d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

function composeAroundPivot(tx: number, ty: number, rot: number, sx: number, sy: number, px: number, py: number): Mat6 {
  // T(p) × R(rot) × S(sx, sy) × T(-p) × T(tx, ty)
  const rad = rot * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const t1: Mat6 = { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
  const tPos: Mat6 = { a: 1, b: 0, c: 0, d: 1, e: px, f: py };
  const tNeg: Mat6 = { a: 1, b: 0, c: 0, d: 1, e: -px, f: -py };
  const rotM: Mat6 = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const scaleM: Mat6 = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };

  let m = multiplyMatrix(tPos, rotM);
  m = multiplyMatrix(m, scaleM);
  m = multiplyMatrix(m, tNeg);
  m = multiplyMatrix(m, t1);
  return m;
}

function matrixToString(m: Mat6): string {
  return `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
}

// ---------------------------------------------------------------------------
// 实现
// ---------------------------------------------------------------------------

export class SvgCanvasAdapter implements StageAdapter {
  private canvas: any = null;
  private partIndex = new Map<string, ImportedPartRef>();
  /** partId → bind matrix (6-element tuple) */
  private bindMatrices = new Map<string, Mat6>();
  /** partId → pivot in part-local coordinates */
  private pivotLocal = new Map<string, { x: number; y: number }>();

  mount(container: HTMLElement): void {
    if (this.canvas) throw new Error("SvgCanvas 已挂载");
    this.canvas = new SvgCanvas(container, {
      show_outside_canvas: true,
      initFill: { color: "transparent", opacity: 0 },
      initStroke: { width: 0, opacity: 0 },
    });
  }

  getVersion(): string {
    return "7.4.2";
  }

  loadSvg(source: string): ImportResult {
    if (!this.canvas) throw new Error("SvgCanvas 未初始化");
    this.partIndex.clear();
    this.bindMatrices.clear();
    this.pivotLocal.clear();

    const diags: ImportResult["diagnostics"] = [];

    // ---- 统一安全门 ----
    const insp = inspectSvgForImport(source);
    diags.push(...insp.diagnostics);

    const resolvedParts: ImportedPartRef[] = [];

    if (insp.hasError) {
      diags.unshift({
        severity: "error",
        message: "安全导入拒绝：存在错误，未载入 svgcanvas",
      });
      return { parts: resolvedParts, pivotLocal: new Map(), diagnostics: diags };
    }

    // ---- 载入 svgcanvas ----
    this.canvas.setSvgString(source);
    const svgCanvasRoot = this.canvas.getSvgRoot() as SVGSVGElement | null;
    if (!svgCanvasRoot) {
      diags.push({ severity: "error", message: "svgcanvas 根节点获取失败" });
      return { parts: resolvedParts, pivotLocal: new Map(), diagnostics: diags };
    }

    // ---- 解析部件 ----
    for (const p of insp.parts) {
      const el = svgCanvasRoot.querySelector(
        `[id="${p.sourceElementId}"]`,
      ) as SVGElement | null;

      if (el) {
        const ref: ImportedPartRef = {
          partId: p.partId,
          inkscapeLabel: p.inkscapeLabel,
          sourceElementId: p.sourceElementId,
          element: el,
        };
        resolvedParts.push(ref);
        this.partIndex.set(p.partId, ref);

        // 记录 bind matrix（DOMMatrix → tuple）
        const ctm = (el as any).getCTM?.();
        if (ctm) {
          this.bindMatrices.set(p.partId, {
            a: ctm.a, b: ctm.b, c: ctm.c,
            d: ctm.d, e: ctm.e, f: ctm.f,
          });
        }
      } else {
        diags.push({
          severity: "warn",
          message: `部件 "${p.partId}" (DOM id: ${p.sourceElementId}) 在 svgcanvas 中未找到`,
        });
      }
    }

    // ---- Pivot 局部坐标换算 ----
    // pivotLocal = inverse(partWorldMatrix) × pivotWorldPoint
    for (const [partId, pivotInfo] of insp.pivotMap) {
      const ref = this.partIndex.get(partId);
      if (!ref) continue;

      // 在 svgcanvas DOM 中找到 pivot 元素
      const pivotEl = svgCanvasRoot.querySelector(
        `[id="${pivotInfo.sourceElementId}"]`,
      ) as SVGElement | null;
      if (!pivotEl) {
        diags.push({
          severity: "warn",
          message: `pivot "${partId}" 元素 (#${pivotInfo.sourceElementId}) 在 svgcanvas 中未找到`,
        });
        continue;
      }

      const partCtm = (ref.element as any).getCTM?.() as DOMMatrix | null;
      const pivotCtm = (pivotEl as any).getCTM?.() as DOMMatrix | null;

      if (!partCtm || !pivotCtm) {
        diags.push({
          severity: "warn",
          message: `无法获取 "${partId}" 或其 pivot 的 CTM`,
        });
        continue;
      }

      // pivotWorldPoint = pivotCtm × local_cx/local_cy
      const pwpx = pivotCtm.a * pivotInfo.x + pivotCtm.c * pivotInfo.y + pivotCtm.e;
      const pwpy = pivotCtm.b * pivotInfo.x + pivotCtm.d * pivotInfo.y + pivotCtm.f;

      // inverse(partWorldMatrix)
      const partM: Mat6 = {
        a: partCtm.a, b: partCtm.b, c: partCtm.c,
        d: partCtm.d, e: partCtm.e, f: partCtm.f,
      };
      const inv = inverseMatrix(partM);
      if (!inv) {
        diags.push({
          severity: "error",
          message: `部件 "${partId}" 的 CTM 不可逆，无法换算 pivot`,
        });
        continue;
      }

      const plx = inv.a * pwpx + inv.c * pwpy + inv.e;
      const ply = inv.b * pwpx + inv.d * pwpy + inv.f;

      if (!Number.isFinite(plx) || !Number.isFinite(ply)) {
        diags.push({
          severity: "error",
          message: `部件 "${partId}" 的换算 pivot 非有限`,
        });
        continue;
      }

      this.pivotLocal.set(partId, { x: plx, y: ply });
      diags.push({
        severity: "info",
        message: `pivot "${partId}" 换算: (${plx.toFixed(2)}, ${ply.toFixed(2)}) part-local`,
      });
    }

    diags.push({
      severity: "info",
      message: `导入完成: ${resolvedParts.length} 个部件, ${this.pivotLocal.size} 个 pivot 已换算`,
    });

    return { parts: resolvedParts, pivotLocal: this.pivotLocal, diagnostics: diags };
  }

  selectPart(partId: string): boolean {
    if (!this.canvas) return false;
    const ref = this.partIndex.get(partId);
    if (!ref || !ref.element) return false;
    try {
      this.canvas.selectOnly([ref.element], true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 使用 bindMatrix × authored 组合预览变换。
   * authored = composeAroundPivot(x, y, rotation, scaleX, scaleY, pivot.x, pivot.y)
   * previewLocal = bindMatrix × authored
   */
  applyPreviewTransform(partId: string, transform: PreviewTransform): void {
    if (!this.canvas) return;
    const ref = this.partIndex.get(partId);
    if (!ref || !ref.element) return;

    const bindM = this.bindMatrices.get(partId) ?? identityMatrix();
    const pivot = this.pivotLocal.get(partId);
    const px = pivot?.x ?? 0;
    const py = pivot?.y ?? 0;

    const authored = composeAroundPivot(
      transform.x,
      transform.y,
      transform.rotation,
      transform.scaleX,
      transform.scaleY,
      px,
      py,
    );

    const previewLocal = multiplyMatrix(bindM, authored);
    const tStr = matrixToString(previewLocal);

    try {
      // @ts-ignore
      this.canvas.changeSelectedAttributeNoUndo("transform", tStr);
    } catch {
      // ignore
    }
  }

  /**
   * 恢复 bind pose：
   * 使用 matrix(a b c d e f) 写回原始 bind 值。
   * 原节点无 transform → 写入 identity matrix。
   */
  restoreBindPose(partId: string): void {
    if (!this.canvas) return;
    const ref = this.partIndex.get(partId);
    if (!ref || !ref.element) return;

    const bindM = this.bindMatrices.get(partId) ?? identityMatrix();
    const tStr = matrixToString(bindM);

    try {
      // @ts-ignore
      this.canvas.changeSelectedAttributeNoUndo("transform", tStr);
    } catch {
      // ignore
    }
  }

  /** 获取 pivot 在 part-local 坐标系的已换算坐标 */
  getPivotLocal(partId: string): { x: number; y: number } | null {
    return this.pivotLocal.get(partId) ?? null;
  }

  getSerializedPreview(): string {
    if (!this.canvas) return "";
    try {
      return this.canvas.getSvgString() ?? "";
    } catch {
      return "";
    }
  }

  dispose(): void {
    for (const partId of this.partIndex.keys()) {
      this.restoreBindPose(partId);
    }
    this.bindMatrices.clear();
    this.pivotLocal.clear();
    this.partIndex.clear();
    this.canvas = null;
  }
}
