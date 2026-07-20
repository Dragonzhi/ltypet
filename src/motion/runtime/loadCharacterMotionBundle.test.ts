import { describe, expect, it } from "vitest";
import artworkText from "../../assets/character/xiaoluobao/artwork.svg?raw";
import rigJson from "../../assets/character/xiaoluobao/rig.v1.json";
import motionsJson from "../../assets/character/xiaoluobao/motions.v1.json";
import {
  loadCharacterMotionBundle,
} from "./loadCharacterMotionBundle";

const clone = <T>(value: T): T => structuredClone(value);

describe("生产动作资产加载", () => {
  it("严格校验正式 artwork、rig 和 motions", async () => {
    const bundle = await loadCharacterMotionBundle({
      artworkText,
      artworkSource: "artwork.svg",
      rigJson,
      motionsJson,
    });
    expect(bundle.rig.parts).toHaveLength(33);
    expect([...bundle.clips.keys()]).toEqual(["wave"]);
    expect(bundle.clips.get("wave")?.loop).toBe("none");
  });

  it("素材内容损坏时拒绝指纹", async () => {
    await expect(loadCharacterMotionBundle({
      artworkText: artworkText.replace("</svg>", "<g /></svg>"),
      artworkSource: "artwork.svg",
      rigJson,
      motionsJson,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "artwork-fingerprint-mismatch" }),
      ]),
    });
  });

  it("未知 Part binding 会给出明确诊断", async () => {
    const badRig = clone(rigJson);
    badRig.parts[0].sourceBinding.value = "missing_part";
    await expect(loadCharacterMotionBundle({
      artworkText,
      artworkSource: "artwork.svg",
      rigJson: badRig,
      motionsJson,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing-source-binding" }),
      ]),
    });
  });

  it("缺少 wave 时拒绝进入生产能力列表", async () => {
    const badMotions = clone(motionsJson);
    badMotions.clips[0].id = "other";
    await expect(loadCharacterMotionBundle({
      artworkText,
      artworkSource: "artwork.svg",
      rigJson,
      motionsJson: badMotions,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "missing-wave" }),
      ]),
    });
  });
});
