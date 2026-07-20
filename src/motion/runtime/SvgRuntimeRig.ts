import {
  composeAroundPivot,
  multiply,
  sampleMotionClip,
  type AffineMatrix,
  type CharacterRigV1,
  type MotionClipV1,
  type RigPartV1,
  type SourceBinding,
  type TransformValue,
} from "@ltypet/character-motion";

interface RuntimePart {
  definition: RigPartV1;
  source: SVGGraphicsElement;
  authored: SVGGElement;
  slotNode: SVGGraphicsElement;
  originalSlotParent: Node;
  originalSlotNextSibling: Node | null;
  originalSourceTransform: string | null;
  currentSlot: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const INTERACTION_IDS = new Set([
  "arm-left-follow",
  "arm-right-follow",
  "hair-tail-left-head-follow",
  "hair-tail-right-head-follow",
]);
const PROCEDURAL_SUFFIX = "-motion";

const matrixAttribute = (matrix: AffineMatrix) =>
  `matrix(${matrix.map((value) => Number(value.toFixed(8))).join(" ")})`;

const isIdentity = (matrix: AffineMatrix) =>
  matrix.every((value, index) => Math.abs(value - [1, 0, 0, 1, 0, 0][index]) < 1e-12);

const bindingMatches = (element: Element, binding: SourceBinding) => {
  if (binding.kind === "inkscapeLabel") {
    return element.getAttribute("inkscape:label") === binding.value ||
      element.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label") === binding.value;
  }
  if (binding.kind === "dataPart") return element.getAttribute("data-part") === binding.value;
  return element.id === binding.value;
};

const findUniqueSource = (
  svg: SVGSVGElement,
  part: RigPartV1,
): SVGGraphicsElement => {
  const matches = Array.from(svg.querySelectorAll<SVGGraphicsElement>("g,path,rect,circle,ellipse,polygon,polyline,line,use"))
    .filter((element) => bindingMatches(element, part.sourceBinding));
  if (matches.length !== 1) {
    throw new Error(`Part ${part.id} 的 sourceBinding 命中 ${matches.length} 个节点`);
  }
  return matches[0];
};

const findPartLayers = (source: SVGGraphicsElement) => {
  const procedural =
    source.parentElement instanceof SVGGElement &&
    source.parentElement.id.endsWith(PROCEDURAL_SUFFIX)
      ? source.parentElement
      : source;
  const potentialInteraction = procedural.parentElement;
  const interaction =
    potentialInteraction instanceof SVGGElement && INTERACTION_IDS.has(potentialInteraction.id)
      ? potentialInteraction
      : null;
  return { procedural, interaction };
};

export class SvgRuntimeRig {
  private readonly svg: SVGSVGElement;
  private readonly rig: CharacterRigV1;
  private readonly parts = new Map<string, RuntimePart>();
  private readonly slotContainers = new Map<string, SVGGElement>();
  private disposed = false;

  constructor(svg: SVGSVGElement, rig: CharacterRigV1) {
    this.svg = svg;
    this.rig = rig;
    this.build();
  }

  private build() {
    const character = this.svg.querySelector<SVGGElement>("#character");
    if (!character) throw new Error("正式素材缺少 character 图层");

    for (const slot of this.rig.renderSlots) {
      const container = document.createElementNS(SVG_NS, "g");
      container.id = `runtime-slot-${slot}`;
      container.dataset.runtimeSlot = slot;
      if (slot === "back") character.insertBefore(container, character.firstChild);
      else character.appendChild(container);
      this.slotContainers.set(slot, container);
    }

    for (const definition of this.rig.parts) {
      const source = findUniqueSource(this.svg, definition);
      if (this.svg.querySelector(`[data-runtime-part="${definition.id}"]`)) {
        throw new Error(`Part ${definition.id} 已存在 runtime wrapper`);
      }
      const { procedural, interaction } = findPartLayers(source);
      const authored = document.createElementNS(SVG_NS, "g");
      authored.id = `${definition.id.replace(/_/g, "-")}-authored`;
      authored.dataset.runtimePart = definition.id;

      const parent = procedural.parentNode;
      if (!parent) throw new Error(`Part ${definition.id} 没有可包装的父节点`);
      parent.insertBefore(authored, procedural);
      authored.appendChild(procedural);

      const originalSourceTransform = source.getAttribute("transform");
      if (originalSourceTransform && !isIdentity(definition.bindMatrix)) {
        source.removeAttribute("transform");
      }
      authored.setAttribute("transform", matrixAttribute(definition.bindMatrix));

      const slotNode = interaction ?? authored;
      const originalSlotParent = slotNode.parentNode;
      if (!originalSlotParent) throw new Error(`Part ${definition.id} 没有 slot 父节点`);
      this.parts.set(definition.id, {
        definition,
        source,
        authored,
        slotNode,
        originalSlotParent,
        originalSlotNextSibling: slotNode.nextSibling,
        originalSourceTransform,
        currentSlot: definition.defaultRenderSlot,
      });
    }
  }

  applyFrame(clip: MotionClipV1, frame: number) {
    if (this.disposed) return;
    const pose = sampleMotionClip(clip, frame, this.rig);
    for (const track of clip.tracks) {
      const runtimePart = this.parts.get(track.partId);
      const transform = pose.transforms.get(track.partId);
      if (!runtimePart || !transform) continue;
      this.applyTransform(runtimePart, transform);
      this.applyRenderSlot(
        runtimePart,
        pose.renderSlots.get(track.partId) ?? runtimePart.definition.defaultRenderSlot,
      );
    }
  }

  private applyTransform(part: RuntimePart, value: TransformValue) {
    const pivot = part.definition.pivot;
    const authored = composeAroundPivot(
      value.x,
      value.y,
      value.rotation,
      value.scaleX,
      value.scaleY,
      pivot.x,
      pivot.y,
    );
    part.authored.setAttribute(
      "transform",
      matrixAttribute(multiply(part.definition.bindMatrix, authored)),
    );
    part.authored.setAttribute("opacity", String(value.opacity));
  }

  private applyRenderSlot(part: RuntimePart, slot: string) {
    if (slot === part.currentSlot) return;
    if (slot === part.definition.defaultRenderSlot) {
      this.restoreSlot(part);
    } else {
      const container = this.slotContainers.get(slot);
      if (!container) throw new Error(`未知 renderSlot: ${slot}`);
      container.appendChild(part.slotNode);
    }
    part.currentSlot = slot;
  }

  private restoreSlot(part: RuntimePart) {
    const reference = part.originalSlotNextSibling?.parentNode === part.originalSlotParent
      ? part.originalSlotNextSibling
      : null;
    part.originalSlotParent.insertBefore(part.slotNode, reference);
  }

  restore() {
    if (this.disposed) return;
    for (const part of this.parts.values()) {
      part.authored.setAttribute("transform", matrixAttribute(part.definition.bindMatrix));
      part.authored.removeAttribute("opacity");
      if (part.currentSlot !== part.definition.defaultRenderSlot) {
        this.restoreSlot(part);
        part.currentSlot = part.definition.defaultRenderSlot;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.restore();
    for (const part of Array.from(this.parts.values()).reverse()) {
      const parent = part.authored.parentNode;
      if (parent) {
        while (part.authored.firstChild) {
          parent.insertBefore(part.authored.firstChild, part.authored);
        }
        part.authored.remove();
      }
      if (part.originalSourceTransform !== null) {
        part.source.setAttribute("transform", part.originalSourceTransform);
      }
    }
    for (const container of this.slotContainers.values()) container.remove();
    this.parts.clear();
    this.slotContainers.clear();
    this.disposed = true;
  }
}
