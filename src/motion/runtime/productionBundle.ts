import artworkText from "../../assets/character/xiaoluobao/artwork.svg?raw";
import rigJson from "../../assets/character/xiaoluobao/rig.v1.json";
import motionsJson from "../../assets/character/xiaoluobao/motions.v1.json";
import { loadCharacterMotionBundle } from "./loadCharacterMotionBundle";

export const productionMotionBundlePromise = loadCharacterMotionBundle({
  artworkText,
  artworkSource: "artwork.svg",
  rigJson,
  motionsJson,
});
