import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { BehaviorScheduler } from "../domain/scheduler/scheduler";
import { PetActionExecutor } from "../domain/controllers/executor";
import { SvgCharacterRenderer } from "../controllers/SvgCharacterRenderer";
import { TauriWindowController } from "../controllers/TauriWindowController";
import type { RendererCapabilities } from "../domain/capabilities/capabilities";
import type { PetExpression } from "../components/TianyiArtwork";

export interface PetRuntime {
  scheduler: BehaviorScheduler;
  executor: PetActionExecutor;
  renderer: SvgCharacterRenderer;
  windowController: TauriWindowController;
  capabilities: RendererCapabilities;
}

export interface PetRuntimeBinding {
  setExpression: (expression: PetExpression) => void;
  setMotionExpression: (expression: PetExpression | null) => void;
  setSuppressedChannels: (channels: ReadonlySet<string>) => void;
  petElement: React.RefObject<HTMLDivElement | null>;
}

const PetRuntimeContext = createContext<PetRuntime | null>(null);

export function PetRuntimeProvider({
  binding,
  children,
}: {
  binding: PetRuntimeBinding;
  children: ReactNode;
}) {
  const [capabilities, setCapabilities] = useState<RendererCapabilities>({
    motions: [],
    expressions: ["normal", "blink", "speak", "sleep"],
    lookDirection: true,
    outfits: [],
  });
  const runtimeRef = useRef<PetRuntime | null>(null);

  if (!runtimeRef.current) {
    const renderer = new SvgCharacterRenderer({
      element: binding.petElement,
      onExpressionChange: binding.setExpression,
      onMotionExpressionChange: binding.setMotionExpression,
      onSuppressionChange: binding.setSuppressedChannels,
      onCapabilitiesChange: setCapabilities,
    });
    const windowController = new TauriWindowController();
    const executor = new PetActionExecutor({ renderer, windowController });
    const scheduler = new BehaviorScheduler({ executor });
    runtimeRef.current = {
      scheduler,
      executor,
      renderer,
      windowController,
      capabilities,
    };
  }

  const runtime = runtimeRef.current;
  const contextValue: PetRuntime = { ...runtime, capabilities };

  return (
    <PetRuntimeContext.Provider value={contextValue}>
      {children}
    </PetRuntimeContext.Provider>
  );
}

export function usePetRuntime(): PetRuntime {
  const runtime = useContext(PetRuntimeContext);
  if (!runtime) {
    throw new Error("usePetRuntime 必须在 PetRuntimeProvider 内部使用");
  }
  return runtime;
}
