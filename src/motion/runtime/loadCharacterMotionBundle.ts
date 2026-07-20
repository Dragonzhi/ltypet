import {
  sha256CanonicalText,
  validateMotionLibrary,
  validateRig,
  type CharacterRigV1,
  type SourceBinding,
} from "@ltypet/character-motion";
import type {
  RuntimeDiagnostic,
  ValidatedMotionBundle,
} from "./types";

interface MotionBundleInput {
  artworkText: string;
  artworkSource: string;
  rigJson: unknown;
  motionsJson: unknown;
  requireWave?: boolean;
}

export class MotionBundleValidationError extends Error {
  readonly diagnostics: RuntimeDiagnostic[];

  constructor(diagnostics: RuntimeDiagnostic[]) {
    super(diagnostics.map((item) => item.message).join("；"));
    this.name = "MotionBundleValidationError";
    this.diagnostics = diagnostics;
  }
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const countSourceBindingMatches = (
  artworkText: string,
  binding: SourceBinding,
): number => {
  const attribute =
    binding.kind === "inkscapeLabel"
      ? "inkscape:label"
      : binding.kind === "dataPart"
        ? "data-part"
        : "id";
  const pattern = new RegExp(
    `\\s${escapeRegExp(attribute)}=(?:"${escapeRegExp(binding.value)}"|'${escapeRegExp(binding.value)}')`,
    "g",
  );
  return artworkText.match(pattern)?.length ?? 0;
};

const readViewBox = (artworkText: string): [number, number, number, number] | null => {
  const match = artworkText.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!match) return null;
  const values = match[1].trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite)
    ? (values as [number, number, number, number])
    : null;
};

const equalViewBox = (
  actual: [number, number, number, number] | null,
  expected: CharacterRigV1["artwork"]["viewBox"],
) =>
  actual !== null &&
  actual.every((value, index) => Math.abs(value - expected[index]) < 1e-6);

export async function loadCharacterMotionBundle({
  artworkText,
  artworkSource,
  rigJson,
  motionsJson,
  requireWave = true,
}: MotionBundleInput): Promise<ValidatedMotionBundle> {
  const diagnostics: RuntimeDiagnostic[] = [];
  const rigResult = validateRig(rigJson);
  if (!rigResult.ok) {
    diagnostics.push(
      ...rigResult.issues.map((issue) => ({
        code: "invalid-rig" as const,
        message: issue.message,
        path: issue.path,
        severity: "error" as const,
      })),
    );
    throw new MotionBundleValidationError(diagnostics);
  }

  const rig = rigResult.value;
  if (rig.artwork.source !== artworkSource) {
    diagnostics.push({
      code: "artwork-source-mismatch",
      message: `rig 绑定 ${rig.artwork.source}，实际加载 ${artworkSource}`,
      path: "/artwork/source",
      severity: "error",
    });
  }

  const fingerprint = await sha256CanonicalText(artworkText);
  if (fingerprint !== rig.artwork.fingerprint) {
    diagnostics.push({
      code: "artwork-fingerprint-mismatch",
      message: `素材指纹不匹配：期望 ${rig.artwork.fingerprint}，实际 ${fingerprint}`,
      path: "/artwork/fingerprint",
      severity: "error",
    });
  }

  if (!equalViewBox(readViewBox(artworkText), rig.artwork.viewBox)) {
    diagnostics.push({
      code: "artwork-viewbox-mismatch",
      message: "素材 viewBox 与 rig 不一致",
      path: "/artwork/viewBox",
      severity: "error",
    });
  }

  for (const part of rig.parts) {
    const matches = countSourceBindingMatches(artworkText, part.sourceBinding);
    if (matches === 0) {
      diagnostics.push({
        code: "missing-source-binding",
        message: `Part ${part.id} 未命中素材节点`,
        path: `/parts/${part.id}/sourceBinding`,
        severity: "error",
      });
    } else if (matches > 1) {
      diagnostics.push({
        code: "duplicate-source-binding",
        message: `Part ${part.id} 命中 ${matches} 个素材节点`,
        path: `/parts/${part.id}/sourceBinding`,
        severity: "error",
      });
    }
  }

  const motionsResult = validateMotionLibrary(motionsJson, rig);
  if (!motionsResult.ok) {
    diagnostics.push(
      ...motionsResult.issues.map((issue) => ({
        code: "invalid-motions" as const,
        message: issue.message,
        path: issue.path,
        severity: "error" as const,
      })),
    );
  }

  if (diagnostics.some((item) => item.severity === "error")) {
    throw new MotionBundleValidationError(diagnostics);
  }
  if (!motionsResult.ok) throw new MotionBundleValidationError(diagnostics);

  const clips = new Map(motionsResult.value.clips.map((clip) => [clip.id, clip]));
  if (requireWave && !clips.has("wave")) {
    throw new MotionBundleValidationError([
      {
        code: "missing-wave",
        message: "生产动作库缺少 wave Clip",
        path: "/clips",
        severity: "error",
      },
    ]);
  }

  return {
    artworkText,
    rig,
    motions: motionsResult.value,
    clips,
    warnings: [],
  };
}
