import { describe, expect, it } from "vitest";
import { projectRenderSlots } from "../src/svgcanvas/renderSlotProjection";
import type { RenderSlotPart } from "../src/svgcanvas/renderSlotProjection";

function ref(partId: string, element: SVGElement, sourceOrder: number): RenderSlotPart {
  return { partId, element, sourceOrder };
}

function childIds(parent: Element): string[] {
  return [...parent.children].map((child) => child.id);
}

describe("editor render slot projection", () => {
  it("moves only the affected sibling Parts and preserves unrelated nested groups", () => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <g id="character">
          <g id="arm-right" />
          <g id="body" />
          <g id="tie">
            <g id="tie-tail" />
            <path id="tie-knot-a" />
            <path id="tie-knot-b" />
          </g>
          <g id="hair-accessory">
            <g id="white-right" />
            <g id="white-left" />
            <path id="green-vertical" />
            <path id="green-horizontal" />
          </g>
        </g>
      </svg>`;
    const character = document.querySelector("#character")!;
    const tie = document.querySelector("#tie")!;
    const hairAccessory = document.querySelector("#hair-accessory")!;
    const arm = document.querySelector<SVGElement>("#arm-right")!;
    const body = document.querySelector<SVGElement>("#body")!;
    const tieTail = document.querySelector<SVGElement>("#tie-tail")!;
    const whiteRight = document.querySelector<SVGElement>("#white-right")!;
    const whiteLeft = document.querySelector<SVGElement>("#white-left")!;
    const parts = [
      ref("arm_right", arm, 0),
      ref("body", body, 1),
      ref("tie_tail", tieTail, 2),
      ref("white_hair_accessory_right", whiteRight, 3),
      ref("white_hair_accessory_left", whiteLeft, 4),
    ];

    const tieBefore = childIds(tie);
    const hairBefore = childIds(hairAccessory);
    projectRenderSlots(
      parts,
      new Map([["arm_right", "body"], ["body", "body"], ["tie_tail", "body"],
        ["white_hair_accessory_right", "head"], ["white_hair_accessory_left", "head"]]),
      new Map([["arm_right", "front"]]),
      ["back", "body", "head", "front"],
    );

    expect(childIds(character).slice(0, 2)).toEqual(["body", "arm-right"]);
    expect(childIds(tie)).toEqual(tieBefore);
    expect(childIds(hairAccessory)).toEqual(hairBefore);
  });

  it("keeps non-Part children in place while sorting affected siblings", () => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg"><g id="parent">
        <g id="part-a" /><path id="static-middle" /><g id="part-b" />
      </g></svg>`;
    const parent = document.querySelector("#parent")!;
    const partA = document.querySelector<SVGElement>("#part-a")!;
    const partB = document.querySelector<SVGElement>("#part-b")!;
    projectRenderSlots(
      [ref("a", partA, 0), ref("b", partB, 1)],
      new Map([["a", "body"], ["b", "body"]]),
      new Map([["a", "front"]]),
      ["body", "front"],
    );

    expect(childIds(parent)).toEqual(["part-b", "static-middle", "part-a"]);
  });
});
