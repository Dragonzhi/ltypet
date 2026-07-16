import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { usePetRuntime } from "../hooks/usePetRuntime";
import TianyiPet from "./TianyiPet";

const RuntimeConsumer = () => {
  const { scheduler } = usePetRuntime();
  return <span data-runtime-ready={Boolean(scheduler)}>runtime-ready</span>;
};

describe("TianyiPet runtime context", () => {
  it("renders extension children inside the shared runtime provider", () => {
    const markup = renderToStaticMarkup(
      <TianyiPet>
        <RuntimeConsumer />
      </TianyiPet>,
    );

    expect(markup).toContain("runtime-ready");
    expect(markup).toContain('data-runtime-ready="true"');
  });
});
