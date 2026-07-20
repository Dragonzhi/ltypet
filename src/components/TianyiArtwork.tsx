import artworkSource from "../assets/character/xiaoluobao/artwork.svg?raw";
import rigJson from "../assets/character/xiaoluobao/rig.v1.json";
import { validateRig } from "@ltypet/character-motion";
import { memo, useLayoutEffect, useRef } from "react";
import { SvgRuntimeRig } from "../motion/runtime/SvgRuntimeRig";

export type PetExpression = "normal" | "blink" | "speak" | "sleep";
interface TianyiArtworkProps {
  expression: PetExpression;
  onMotionTargetReady?: (target: SvgRuntimeRig | null) => void;
}

const validatedRig = validateRig(rigJson);
if (!validatedRig.ok) {
  throw new Error(`生产 rig 无效：${validatedRig.issues.map((issue) => issue.message).join("；")}`);
}
const productionRig = validatedRig.value;

const animatedLayerLabels = [
  "character",
  "hair_tail_left",
  "hair_tail_right",
  "arm_left",
  "arm_right",
  "leg_left",
  "leg_right",
  "body",
  "white_cloth",
  "blue_decoration",
  "black_decoration",
  "tie",
  "head",
  "hair_back",
  "braided_hair",
  "celestial_updo",
  "hair_accessory",
  "face",
  "ears",
  "ear_left",
  "ear_right",
  "rouge",
  "eye_left",
  "eye_right",
  "mouth",
  "eyebrow_left",
  "eyebrow_right",
  "hair_front",
  "fringe",
  "temple_left",
  "temple_right",
  "blue_hair_accessory_left",
  "blue_hair_accessory_right",
  "white_hair_accessory_left",
  "white_hair_accessory_right",
  "pivot_arm_left",
  "pivot_arm_right",
  "pivot_leg_left",
  "pivot_leg_right",
  "pivot_head",
  "pivot_hair_tail_left",
  "pivot_hair_tail_right",
  "pivot_fringe",
  "pivot_temple_left",
  "pivot_temple_right",
  "pivot_blue_hair_accessory_left",
  "pivot_blue_hair_accessory_right",
  "pivot_white_hair_accessory_left",
  "pivot_white_hair_accessory_right",
] as const;

const prepareArtwork = () => {
  let svg = artworkSource
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sheight="[^"]*"/, "");

  for (const label of animatedLayerLabels) {
    const semanticId = label.replace(/_/g, "-");
    const layerPattern = new RegExp(
      `(<(?:g|ellipse|circle|rect)\\b[^>]*?)id="[^"]+"([^>]*?inkscape:label="${label}"[^>]*>)`,
    );
    svg = svg.replace(layerPattern, `$1id="${semanticId}"$2`);
  }

  svg = svg
    .replace(
      /<svg\b/,
      '<svg class="tianyi-svg" aria-hidden="true" focusable="false"',
    )
    .replace(/(<svg\b[^>]*>)/, '$1<g id="motion-root" class="pet-breathe">')
    .replace(/<\/svg>\s*$/, "</g></svg>");

  return svg;
};

// 本地、受版本控制的 SVG 在构建时内联，以便 CSS 直接控制各动画图层。
const artworkMarkup = prepareArtwork();

// SVG DOM 必须在眨眼等表情更新时保持不变，否则持续动画会从头开始。
const StaticArtwork = memo(() => (
  <div
    className="tianyi-svg-host"
    dangerouslySetInnerHTML={{ __html: artworkMarkup }}
  />
));

const TianyiArtwork = ({
  expression,
  onMotionTargetReady,
}: TianyiArtworkProps) => {
  const artworkElement = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = artworkElement.current;
    const svg = host?.querySelector<SVGSVGElement>(".tianyi-svg");
    const character = svg?.querySelector<SVGGElement>("#character");
    const arm = svg?.querySelector<SVGGElement>("#arm-right");
    const pivot = svg?.querySelector<SVGGraphicsElement>("#pivot-arm-right");
    const leftArm = svg?.querySelector<SVGGElement>("#arm-left");
    const leftPivot = svg?.querySelector<SVGGraphicsElement>("#pivot-arm-left");
    const head = svg?.querySelector<SVGGElement>("#head");
    const headPivot = svg?.querySelector<SVGGraphicsElement>("#pivot-head");
    const leftEar = svg?.querySelector<SVGGElement>("#ear-left");
    const rightEar = svg?.querySelector<SVGGElement>("#ear-right");
    if (!svg || !character || !arm || !pivot || !arm.parentNode) return;

    const originalParent = arm.parentNode;
    const originalNextSibling = arm.nextSibling;
    const svgNamespace = "http://www.w3.org/2000/svg";
    const follow = document.createElementNS(svgNamespace, "g");
    const motion = document.createElementNS(svgNamespace, "g");
    follow.id = "arm-right-follow";
    motion.id = "arm-right-motion";
    motion.style.animation = "none";

    originalParent.insertBefore(follow, arm);
    follow.appendChild(motion);
    motion.appendChild(arm);

    const wrapLayer = (
      layer: SVGGElement | null | undefined,
      id: string,
    ) => {
      if (!layer?.parentNode) return null;
      const parent = layer.parentNode;
      const nextSibling = layer.nextSibling;
      const wrapper = document.createElementNS(svgNamespace, "g");
      wrapper.id = id;
      parent.insertBefore(wrapper, layer);
      wrapper.appendChild(layer);
      return { layer, nextSibling, parent, wrapper };
    };

    const leftArmFollow = wrapLayer(leftArm, "arm-left-follow");
    const leftEarMotion = wrapLayer(leftEar, "ear-left-motion");
    const rightEarMotion = wrapLayer(rightEar, "ear-right-motion");

    const pivotRigDefinitions = [
      ["hair-tail-left", "pivot-hair-tail-left"],
      ["hair-tail-right", "pivot-hair-tail-right"],
      ["fringe", "pivot-fringe"],
      ["temple-left", "pivot-temple-left"],
      ["temple-right", "pivot-temple-right"],
      ["blue-hair-accessory-left", "pivot-blue-hair-accessory-left"],
      ["blue-hair-accessory-right", "pivot-blue-hair-accessory-right"],
      ["white-hair-accessory-left", "pivot-white-hair-accessory-left"],
      ["white-hair-accessory-right", "pivot-white-hair-accessory-right"],
    ] as const;
    const pivotRigs = pivotRigDefinitions.flatMap(([layerId, pivotId]) => {
      const layer = svg.querySelector<SVGGElement>(`#${layerId}`);
      const layerPivot = svg.querySelector<SVGGraphicsElement>(`#${pivotId}`);
      if (!layer || !layerPivot) return [];
      const rig = wrapLayer(layer, `${layerId}-motion`);
      return rig ? [{ ...rig, pivot: layerPivot }] : [];
    });
    const tailHeadFollows = pivotRigs
      .filter((rig) => rig.layer.id.startsWith("hair-tail-"))
      .map((rig) => {
        const wrapper = document.createElementNS(svgNamespace, "g");
        wrapper.id = `${rig.layer.id}-head-follow`;
        rig.parent.insertBefore(wrapper, rig.wrapper);
        wrapper.appendChild(rig.wrapper);
        return { rig, wrapper };
      });

    const measurementRestores: Array<() => void> = [];
    const overrideForMeasurement = (
      element: SVGElement | null | undefined,
      property: string,
      value: string,
    ) => {
      if (!element) return;
      const previousValue = element.style.getPropertyValue(property);
      const previousPriority = element.style.getPropertyPriority(property);
      element.style.setProperty(property, value, "important");
      measurementRestores.push(() => {
        if (previousValue) {
          element.style.setProperty(property, previousValue, previousPriority);
        } else {
          element.style.removeProperty(property);
        }
      });
    };

    // HMR 时 CSS 变量仍保留着当前姿态；测量轴心前必须回到素材原始坐标。
    for (const followLayer of [
      follow,
      leftArmFollow?.wrapper,
      ...pivotRigs.map((rig) => rig.wrapper),
      ...tailHeadFollows.map((followRig) => followRig.wrapper),
    ]) {
      overrideForMeasurement(followLayer, "translate", "0px");
      overrideForMeasurement(followLayer, "rotate", "0deg");
      overrideForMeasurement(followLayer, "transform", "none");
      overrideForMeasurement(followLayer, "transition", "none");
    }
    overrideForMeasurement(leftArm, "animation", "none");
    overrideForMeasurement(leftArm, "transform", "none");
    overrideForMeasurement(head, "transition", "none");
    overrideForMeasurement(head, "transform", "none");
    for (const rig of pivotRigs) {
      overrideForMeasurement(rig.layer, "animation", "none");
      overrideForMeasurement(rig.layer, "translate", "0px");
      overrideForMeasurement(rig.layer, "rotate", "0deg");
      overrideForMeasurement(rig.layer, "transform", "none");
    }

    const setPivotOrigin = (
      layerPivot: SVGGraphicsElement,
      parent: Node,
      targets: SVGElement[],
    ) => {
      const pivotBounds = layerPivot.getBBox();
      const pivotPoint = svg.createSVGPoint();
      pivotPoint.x = pivotBounds.x + pivotBounds.width / 2;
      pivotPoint.y = pivotBounds.y + pivotBounds.height / 2;
      const pivotScreenMatrix = layerPivot.getScreenCTM();
      const parentScreenMatrix = (
        parent as SVGGraphicsElement
      ).getScreenCTM?.();
      if (!pivotScreenMatrix || !parentScreenMatrix) return;

      const parentPoint = pivotPoint
        .matrixTransform(pivotScreenMatrix)
        .matrixTransform(parentScreenMatrix.inverse());
      const viewBox = svg.viewBox.baseVal;
      const originX = ((parentPoint.x - viewBox.x) / viewBox.width) * 100;
      const originY = ((parentPoint.y - viewBox.y) / viewBox.height) * 100;
      for (const target of targets) {
        target.style.transformBox = "view-box";
        target.style.transformOrigin = `${originX}% ${originY}%`;
      }
    };

    // motion 是 character 的子节点，因此 pivot 必须换算到相同的父级坐标系。
    setPivotOrigin(pivot, originalParent, [
      follow,
      motion,
    ]);

    if (leftArmFollow && leftPivot) {
      setPivotOrigin(leftPivot, leftArmFollow.parent, [
        leftArmFollow.wrapper,
      ]);
    }
    motion.style.removeProperty("animation");

    if (head && headPivot && head.parentNode) {
      setPivotOrigin(headPivot, head.parentNode, [head]);
      for (const followRig of tailHeadFollows) {
        setPivotOrigin(headPivot, followRig.rig.parent, [
          followRig.wrapper,
        ]);
      }
    }
    for (const rig of pivotRigs) {
      setPivotOrigin(rig.pivot, rig.parent, [rig.wrapper, rig.layer]);
    }
    measurementRestores.reverse().forEach((restore) => restore());

    let runtimeRig: SvgRuntimeRig | null = null;
    try {
      runtimeRig = new SvgRuntimeRig(svg, productionRig);
      onMotionTargetReady?.(runtimeRig);
    } catch (error) {
      console.error("初始化 SVG 动作 rig 失败:", error);
      onMotionTargetReady?.(null);
    }

    return () => {
      onMotionTargetReady?.(null);
      runtimeRig?.dispose();
      // 相邻图层必须逆序还原：左耳的 nextSibling 是仍在外壳里的右耳。
      for (const rig of [
        leftArmFollow,
        leftEarMotion,
        rightEarMotion,
        ...pivotRigs,
      ].reverse()) {
        if (!rig) continue;
        rig.parent.insertBefore(rig.layer, rig.nextSibling);
        rig.wrapper.remove();
      }
      for (const followRig of tailHeadFollows) {
        followRig.wrapper.remove();
      }
      originalParent.insertBefore(arm, originalNextSibling);
      follow.remove();
    };
  }, [onMotionTargetReady]);

  return (
    <div
      ref={artworkElement}
      aria-hidden="true"
      className={`tianyi-artwork expression-${expression}`}
    >
      <StaticArtwork />
    </div>
  );
};

export default TianyiArtwork;
