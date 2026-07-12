import artworkSource from "../assets/小洛宝.svg?raw";
import { memo, useEffect, useLayoutEffect, useRef } from "react";
import { PET_ANIMATION_CONFIG } from "../config/petAnimation";

export type PetExpression = "normal" | "blink" | "speak" | "sleep";
export type PetAction = "none" | "wave";

interface TianyiArtworkProps {
  expression: PetExpression;
  action: PetAction;
}

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
  "pivot_arm_left",
  "pivot_arm_right",
  "pivot_leg_left",
  "pivot_leg_right",
  "pivot_head",
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

const TianyiArtwork = ({ expression, action }: TianyiArtworkProps) => {
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
    const foreground = document.createElementNS(svgNamespace, "g");
    const foregroundFollow = document.createElementNS(svgNamespace, "g");
    const foregroundMotion = document.createElementNS(svgNamespace, "g");
    const foregroundArm = arm.cloneNode(true) as SVGGElement;
    follow.id = "arm-right-follow";
    motion.id = "arm-right-motion";
    foreground.id = "action-foreground";
    foregroundFollow.id = "arm-right-foreground-follow";
    foregroundMotion.id = "arm-right-foreground-motion";
    foregroundArm.id = "arm-right-foreground";
    foregroundArm
      .querySelectorAll<SVGElement>("[id]")
      .forEach((element) => element.removeAttribute("id"));
    motion.style.animation = "none";
    foregroundMotion.style.animation = "none";

    originalParent.insertBefore(follow, arm);
    follow.appendChild(motion);
    motion.appendChild(arm);
    foregroundMotion.appendChild(foregroundArm);
    foregroundFollow.appendChild(foregroundMotion);
    foreground.appendChild(foregroundFollow);
    character.appendChild(foreground);

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

    // motion 是 character 的子节点，因此 pivot 必须换算到相同的父级坐标系。
    const pivotBounds = pivot.getBBox();
    const pivotPoint = svg.createSVGPoint();
    pivotPoint.x = pivotBounds.x + pivotBounds.width / 2;
    pivotPoint.y = pivotBounds.y + pivotBounds.height / 2;
    const pivotScreenMatrix = pivot.getScreenCTM();
    const parentScreenMatrix = (
      originalParent as SVGGraphicsElement
    ).getScreenCTM?.();
    if (pivotScreenMatrix && parentScreenMatrix) {
      const screenPoint = pivotPoint.matrixTransform(pivotScreenMatrix);
      const parentPoint = screenPoint.matrixTransform(
        parentScreenMatrix.inverse(),
      );
      const viewBox = svg.viewBox.baseVal;
      const originX = ((parentPoint.x - viewBox.x) / viewBox.width) * 100;
      const originY = ((parentPoint.y - viewBox.y) / viewBox.height) * 100;
      follow.style.transformBox = "view-box";
      follow.style.transformOrigin = `${originX}% ${originY}%`;
      motion.style.transformBox = "view-box";
      motion.style.transformOrigin = `${originX}% ${originY}%`;
      foregroundFollow.style.transformBox = "view-box";
      foregroundFollow.style.transformOrigin = `${originX}% ${originY}%`;
      foregroundMotion.style.transformBox = "view-box";
      foregroundMotion.style.transformOrigin = `${originX}% ${originY}%`;
    }

    if (leftArmFollow && leftPivot) {
      const leftPivotBounds = leftPivot.getBBox();
      const leftPivotPoint = svg.createSVGPoint();
      leftPivotPoint.x = leftPivotBounds.x + leftPivotBounds.width / 2;
      leftPivotPoint.y = leftPivotBounds.y + leftPivotBounds.height / 2;
      const leftPivotMatrix = leftPivot.getScreenCTM();
      const leftParentMatrix = (
        leftArmFollow.parent as SVGGraphicsElement
      ).getScreenCTM?.();
      if (leftPivotMatrix && leftParentMatrix) {
        const parentPoint = leftPivotPoint
          .matrixTransform(leftPivotMatrix)
          .matrixTransform(leftParentMatrix.inverse());
        const viewBox = svg.viewBox.baseVal;
        const originX = ((parentPoint.x - viewBox.x) / viewBox.width) * 100;
        const originY = ((parentPoint.y - viewBox.y) / viewBox.height) * 100;
        leftArmFollow.wrapper.style.transformBox = "view-box";
        leftArmFollow.wrapper.style.transformOrigin = `${originX}% ${originY}%`;
      }
    }
    motion.style.removeProperty("animation");
    foregroundMotion.style.removeProperty("animation");

    if (head && headPivot && head.parentNode) {
      const headPivotBounds = headPivot.getBBox();
      const headPivotPoint = svg.createSVGPoint();
      headPivotPoint.x = headPivotBounds.x + headPivotBounds.width / 2;
      headPivotPoint.y = headPivotBounds.y + headPivotBounds.height / 2;
      const headPivotScreenMatrix = headPivot.getScreenCTM();
      const headParentScreenMatrix = (
        head.parentNode as SVGGraphicsElement
      ).getScreenCTM?.();
      if (headPivotScreenMatrix && headParentScreenMatrix) {
        const screenPoint = headPivotPoint.matrixTransform(
          headPivotScreenMatrix,
        );
        const parentPoint = screenPoint.matrixTransform(
          headParentScreenMatrix.inverse(),
        );
        const viewBox = svg.viewBox.baseVal;
        const originX = ((parentPoint.x - viewBox.x) / viewBox.width) * 100;
        const originY = ((parentPoint.y - viewBox.y) / viewBox.height) * 100;
        head.style.transformBox = "view-box";
        head.style.transformOrigin = `${originX}% ${originY}%`;
      }
    }

    return () => {
      // 相邻图层必须逆序还原：左耳的 nextSibling 是仍在外壳里的右耳。
      for (const rig of [rightEarMotion, leftEarMotion, leftArmFollow]) {
        if (!rig) continue;
        rig.parent.insertBefore(rig.layer, rig.nextSibling);
        rig.wrapper.remove();
      }
      originalParent.insertBefore(arm, originalNextSibling);
      follow.remove();
      foreground.remove();
    };
  }, [artworkMarkup]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const host = artworkElement.current;
    const leftEar = host?.querySelector<SVGGElement>("#ear-left-motion");
    const rightEar = host?.querySelector<SVGGElement>("#ear-right-motion");
    if (!leftEar || !rightEar) return;

    const config = PET_ANIMATION_CONFIG.earTwitch;
    let timer: number | undefined;
    let animations: Animation[] = [];

    const animateEar = (ear: SVGGElement, direction: -1 | 1) =>
      ear.animate(
        [
          { translate: "0 0", rotate: "0deg", offset: 0 },
          {
            translate: `0 ${-config.maxLiftPx}px`,
            rotate: `${direction * config.maxRotateDeg}deg`,
            offset: 0.3,
          },
          {
            translate: `0 ${-config.maxLiftPx * 0.25}px`,
            rotate: `${direction * config.maxRotateDeg * -0.35}deg`,
            offset: 0.62,
          },
          { translate: "0 0", rotate: "0deg", offset: 1 },
        ],
        {
          duration: config.durationMs,
          easing: "ease-in-out",
        },
      );

    const schedule = () => {
      const delay =
        config.minDelayMs +
        Math.random() * (config.maxDelayMs - config.minDelayMs);
      timer = window.setTimeout(() => {
        animations.forEach((animation) => animation.cancel());
        animations = [animateEar(leftEar, -1), animateEar(rightEar, 1)];
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, []);

  return (
    <div
      ref={artworkElement}
      aria-hidden="true"
      className={`tianyi-artwork expression-${expression}`}
      data-action={action}
    >
      <StaticArtwork />
    </div>
  );
};

export default TianyiArtwork;
