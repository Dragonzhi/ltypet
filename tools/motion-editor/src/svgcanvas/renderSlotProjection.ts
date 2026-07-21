export interface RenderSlotPart {
  partId: string;
  element: SVGElement;
  sourceOrder: number;
}

export function projectRenderSlots(
  parts: Iterable<RenderSlotPart>,
  defaultSlots: Map<string, string>,
  changedOverrides: Map<string, string>,
  slotOrder: string[],
): boolean {
  const allParts = [...parts];
  const affectedParents = new Set<ParentNode>();
  for (const partId of changedOverrides.keys()) {
    const parent = allParts.find((part) => part.partId === partId)?.element.parentNode;
    if (parent) affectedParents.add(parent);
  }
  if (affectedParents.size === 0) return false;

  const slotIndex = new Map(slotOrder.map((slot, index) => [slot, index]));
  for (const parent of affectedParents) {
    const siblings = allParts.filter((part) => part.element.parentNode === parent);
    siblings.sort((left, right) => {
      const leftSlot = changedOverrides.get(left.partId) ?? defaultSlots.get(left.partId) ?? "";
      const rightSlot = changedOverrides.get(right.partId) ?? defaultSlots.get(right.partId) ?? "";
      const slotDifference = (slotIndex.get(leftSlot) ?? 0) - (slotIndex.get(rightSlot) ?? 0);
      return slotDifference || left.sourceOrder - right.sourceOrder;
    });
    const partElements = new Set(siblings.map((part) => part.element));
    let nextPartIndex = 0;
    const orderedChildren = [...parent.childNodes].map((child) =>
      child instanceof SVGElement && partElements.has(child)
        ? siblings[nextPartIndex++].element
        : child,
    );
    parent.replaceChildren(...orderedChildren);
  }
  return true;
}
