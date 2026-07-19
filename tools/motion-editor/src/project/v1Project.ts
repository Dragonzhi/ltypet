import type {
  CharacterRigV1,
  MotionClipV1,
  MotionLibraryV1,
  RigPartV1,
  ValidationIssue,
} from "@ltypet/character-motion";
import { validateMotionLibrary, validateRig } from "@ltypet/character-motion";
import type { ImportResult, ImportedPartRef } from "../svgcanvas/SvgCanvasAdapter";

const BODY_PARTS = new Set([
  "arm_left",
  "arm_right",
  "leg_left",
  "leg_right",
  "body",
  "white_cloth",
  "blue_decoration",
  "black_decoration",
  "tie",
  "tie_tail",
]);

function defaultRenderSlot(partId: string): string {
  if (partId.startsWith("hair_tail_")) return "back";
  if (BODY_PARTS.has(partId)) return "body";
  return "head";
}

function buildRigPart(
  part: ImportedPartRef,
  pivotLocal: Map<string, { x: number; y: number }>,
): RigPartV1 {
  const pivot = pivotLocal.get(part.partId) ?? { x: 0, y: 0 };
  return {
    id: part.partId,
    sourceBinding: { kind: "inkscapeLabel", value: part.inkscapeLabel },
    // 当前 glax 素材是扁平绝对坐标。P1 不伪造骨骼父子关系；P2 由 rig UI 显式编辑。
    logicalParentId: null,
    defaultRenderSlot: defaultRenderSlot(part.partId),
    pivot: { x: pivot.x, y: pivot.y, space: "partLocal" },
    bindMatrix: [...part.bindMatrix],
    ...(pivotLocal.has(part.partId) ? { tags: ["has_pivot"] } : {}),
  };
}

export function buildRigFromImport(
  imported: ImportResult,
  artwork: { source: string; fingerprint: string },
): CharacterRigV1 {
  const candidate: CharacterRigV1 = {
    schemaVersion: 1,
    rigId: "xiaoluobao",
    artwork: {
      source: artwork.source,
      fingerprint: artwork.fingerprint,
      viewBox: [...imported.viewBox],
    },
    renderSlots: ["back", "body", "head", "front"],
    parts: imported.parts.map((part) => buildRigPart(part, imported.pivotLocal)),
  };

  const validation = validateRig(candidate);
  if (!validation.ok) {
    throw new Error(`生成的 rig 无效：${formatValidationIssues(validation.issues)}`);
  }
  return validation.value;
}

export function createWaveExample(rig: CharacterRigV1): MotionLibraryV1 {
  if (!rig.parts.some((part) => part.id === "arm_right")) {
    throw new Error("当前 rig 不包含 arm_right，无法载入挥手示例");
  }
  return {
    schemaVersion: 1,
    rigId: rig.rigId,
    clips: [
      {
        id: "p0-wave",
        fps: 24,
        durationFrames: 24,
        loop: "repeat",
        tracks: [
          {
            partId: "arm_right",
            keyframes: [
              { frame: 0, values: { rotation: 0 }, easing: "easeInOut" },
              { frame: 12, values: { rotation: -55 }, easing: "easeInOut" },
              { frame: 24, values: { rotation: 0 }, easing: "easeInOut" },
            ],
          },
        ],
        events: [],
      },
    ],
  };
}

export function parseMotionLibraryForRig(
  text: string,
  rig: CharacterRigV1,
): MotionLibraryV1 {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const validation = validateMotionLibrary(input, rig);
  if (!validation.ok) {
    throw new Error(`动作文件校验失败：${formatValidationIssues(validation.issues)}`);
  }
  return validation.value;
}

export function firstPlayableTrack(library: MotionLibraryV1): {
  clip: MotionClipV1;
  partId: string;
} | null {
  for (const clip of library.clips) {
    const track = clip.tracks[0];
    if (track) return { clip, partId: track.partId };
  }
  return null;
}

function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.path} [${issue.code}] ${issue.message}`).join("；");
}
