/**
 * svgcanvas 舞台适配器。
 *
 * DOM/svgcanvas 只负责素材载入、选择和坐标测量；矩阵组合使用共享核心，保证编辑器
 * 与未来桌宠运行时遵循同一语义。
 */

import SvgCanvas from "@svgedit/svgcanvas";
import {
  composeAroundPivot,
  computePivotInPartLocal,
  identity,
  multiply,
} from "@ltypet/character-motion";
import type { AffineMatrix } from "@ltypet/character-motion";
import { inspectSvgForImport } from "../import/inspectSvgForImport";

export interface ImportedPartRef {
  partId: string;
  inkscapeLabel: string;
  sourceElementId: string;
  element: SVGElement;
  bindMatrix: AffineMatrix;
  originalTransform: string | null;
  originalOpacity: string | null;
}

export interface Diagnostic {
  severity: "error" | "warn" | "info";
  message: string;
}

export interface ImportResult {
  parts: ImportedPartRef[];
  pivotLocal: Map<string, { x: number; y: number }>;
  viewBox: [number, number, number, number];
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
  getPivotLocal(partId: string): { x: number; y: number } | null;
  getSerializedPreview(): string;
  dispose(): void;
}

const DEFAULT_VIEW_BOX: [number, number, number, number] = [0, 0, 1, 1];

function matrixToString(matrix: AffineMatrix): string {
  return `matrix(${matrix.join(" ")})`;
}

function domMatrixToTuple(matrix: DOMMatrix): AffineMatrix {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
}

function readViewBox(root: SVGSVGElement): [number, number, number, number] {
  const baseVal = root.viewBox?.baseVal;
  if (
    baseVal &&
    Number.isFinite(baseVal.x) &&
    Number.isFinite(baseVal.y) &&
    Number.isFinite(baseVal.width) &&
    Number.isFinite(baseVal.height) &&
    baseVal.width > 0 &&
    baseVal.height > 0
  ) {
    return [baseVal.x, baseVal.y, baseVal.width, baseVal.height];
  }

  const raw = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (
    raw?.length === 4 &&
    raw.every(Number.isFinite) &&
    raw[2] > 0 &&
    raw[3] > 0
  ) {
    return raw as [number, number, number, number];
  }

  return DEFAULT_VIEW_BOX;
}

/** Read only the element's own SVG transform, never its world CTM. */
function readLocalBindMatrix(
  element: SVGElement,
  partId: string,
  diagnostics: Diagnostic[],
): AffineMatrix {
  const rawTransform = element.getAttribute("transform");
  if (!rawTransform) return identity();

  const graphicsElement = element as SVGGraphicsElement;
  const consolidated = graphicsElement.transform?.baseVal?.consolidate();
  if (consolidated) return domMatrixToTuple(consolidated.matrix);

  diagnostics.push({
    severity: "error",
    message: `部件 "${partId}" 的局部 transform 无法解析，已拒绝生成 rig`,
  });
  return identity();
}

export class SvgCanvasAdapter implements StageAdapter {
  private canvas: SvgCanvas | null = null;
  private readonly partIndex = new Map<string, ImportedPartRef>();
  private readonly pivotLocal = new Map<string, { x: number; y: number }>();

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
    this.restoreAllBindPoses();
    this.partIndex.clear();
    this.pivotLocal.clear();

    const inspection = inspectSvgForImport(source);
    const diagnostics: Diagnostic[] = [...inspection.diagnostics];
    if (inspection.hasError) {
      diagnostics.unshift({ severity: "error", message: "安全导入拒绝：SVG 未进入 svgcanvas" });
      return { parts: [], pivotLocal: new Map(), viewBox: DEFAULT_VIEW_BOX, diagnostics };
    }

    if (!this.canvas.setSvgString(source)) {
      throw new Error("svgcanvas 拒绝载入 SVG");
    }
    const root = this.canvas.getSvgRoot();
    const parts: ImportedPartRef[] = [];

    for (const part of inspection.parts) {
      const element = root.ownerDocument.getElementById(part.sourceElementId);
      if (!(element instanceof SVGElement)) {
        diagnostics.push({
          severity: "error",
          message: `部件 "${part.partId}" (#${part.sourceElementId}) 在 svgcanvas 中未找到`,
        });
        continue;
      }

      const ref: ImportedPartRef = {
        partId: part.partId,
        inkscapeLabel: part.inkscapeLabel,
        sourceElementId: part.sourceElementId,
        element,
        bindMatrix: readLocalBindMatrix(element, part.partId, diagnostics),
        originalTransform: element.getAttribute("transform"),
        originalOpacity: element.getAttribute("opacity"),
      };
      parts.push(ref);
      this.partIndex.set(part.partId, ref);
    }

    for (const [partId, pivotInfo] of inspection.pivotMap) {
      const part = this.partIndex.get(partId);
      if (!part) continue;

      const pivotElement = root.ownerDocument.getElementById(pivotInfo.sourceElementId);
      if (!(pivotElement instanceof SVGGraphicsElement)) {
        diagnostics.push({ severity: "error", message: `pivot "${partId}" 在 svgcanvas 中未找到` });
        continue;
      }

      const partCtm = (part.element as SVGGraphicsElement).getCTM();
      const pivotCtm = pivotElement.getCTM();
      if (!partCtm || !pivotCtm) {
        diagnostics.push({ severity: "error", message: `无法测量 "${partId}" 的 pivot CTM` });
        continue;
      }

      const pivotWorld = {
        x: pivotCtm.a * pivotInfo.x + pivotCtm.c * pivotInfo.y + pivotCtm.e,
        y: pivotCtm.b * pivotInfo.x + pivotCtm.d * pivotInfo.y + pivotCtm.f,
      };
      const local = computePivotInPartLocal(domMatrixToTuple(partCtm), pivotWorld);
      if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) {
        diagnostics.push({ severity: "error", message: `部件 "${partId}" 的 pivot 无法换算` });
        continue;
      }

      this.pivotLocal.set(partId, local);
      diagnostics.push({
        severity: "info",
        message: `pivot "${partId}": (${local.x.toFixed(4)}, ${local.y.toFixed(4)}) part-local`,
      });
    }

    diagnostics.push({
      severity: "info",
      message: `导入完成: ${parts.length} 个部件, ${this.pivotLocal.size} 个 pivot`,
    });

    return {
      parts,
      pivotLocal: new Map(this.pivotLocal),
      viewBox: readViewBox(root),
      diagnostics,
    };
  }

  selectPart(partId: string): boolean {
    const part = this.partIndex.get(partId);
    if (!this.canvas || !part) return false;
    this.canvas.selectOnly([part.element], true);
    return true;
  }

  applyPreviewTransform(partId: string, transform: PreviewTransform): void {
    const part = this.partIndex.get(partId);
    if (!part) return;

    const pivot = this.pivotLocal.get(partId) ?? { x: 0, y: 0 };
    const authored = composeAroundPivot(
      transform.x,
      transform.y,
      transform.rotation,
      transform.scaleX,
      transform.scaleY,
      pivot.x,
      pivot.y,
    );
    part.element.setAttribute("transform", matrixToString(multiply(part.bindMatrix, authored)));
    part.element.setAttribute("opacity", String(transform.opacity));
  }

  restoreBindPose(partId: string): void {
    const part = this.partIndex.get(partId);
    if (!part) return;

    if (part.originalTransform === null) part.element.removeAttribute("transform");
    else part.element.setAttribute("transform", part.originalTransform);

    if (part.originalOpacity === null) part.element.removeAttribute("opacity");
    else part.element.setAttribute("opacity", part.originalOpacity);
  }

  getPivotLocal(partId: string): { x: number; y: number } | null {
    return this.pivotLocal.get(partId) ?? null;
  }

  getSerializedPreview(): string {
    return this.canvas?.getSvgString() ?? "";
  }

  dispose(): void {
    this.restoreAllBindPoses();
    this.partIndex.clear();
    this.pivotLocal.clear();
    this.canvas = null;
  }

  private restoreAllBindPoses(): void {
    for (const partId of this.partIndex.keys()) this.restoreBindPose(partId);
  }
}
