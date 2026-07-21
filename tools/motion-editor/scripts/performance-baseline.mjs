import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const characterRoot = path.resolve(editorRoot, "../../src/assets/character/xiaoluobao");
const files = {
  artwork: path.join(characterRoot, "artwork.svg"),
  rig: path.join(characterRoot, "rig.v1.json"),
  motions: path.join(characterRoot, "motions.v1.json"),
};
const limits = {
  artworkBytes: 2_000_000,
  rigBytes: 1_000_000,
  motionsBytes: 5_000_000,
  parseIterations: 200,
  parseBudgetMs: 1_500,
  maximumClips: 1_000,
  maximumKeyframes: 100_000,
};

const artwork = readFileSync(files.artwork, "utf8");
const rigText = readFileSync(files.rig, "utf8");
const motionsText = readFileSync(files.motions, "utf8");
const rig = JSON.parse(rigText);
const motions = JSON.parse(motionsText);
const keyframes = motions.clips.reduce(
  (total, clip) => total + clip.tracks.reduce((trackTotal, track) => trackTotal + track.keyframes.length, 0),
  0,
);
const started = performance.now();
for (let index = 0; index < limits.parseIterations; index += 1) {
  JSON.parse(rigText);
  JSON.parse(motionsText);
}
const parseMs = performance.now() - started;
const sizes = {
  artworkBytes: statSync(files.artwork).size,
  rigBytes: statSync(files.rig).size,
  motionsBytes: statSync(files.motions).size,
};

if (!artwork.includes("<svg") || rig.schemaVersion !== 1 || motions.schemaVersion !== 1) {
  throw new Error("formal character assets are not valid v1 inputs");
}
if (sizes.artworkBytes > limits.artworkBytes || sizes.rigBytes > limits.rigBytes || sizes.motionsBytes > limits.motionsBytes) {
  throw new Error(`formal asset size exceeds release limit: ${JSON.stringify(sizes)}`);
}
if (motions.clips.length > limits.maximumClips || keyframes > limits.maximumKeyframes) {
  throw new Error(`document complexity exceeds release limit: ${motions.clips.length} clips / ${keyframes} keyframes`);
}
if (parseMs > limits.parseBudgetMs) {
  throw new Error(`JSON parse baseline exceeded ${limits.parseBudgetMs}ms: ${parseMs.toFixed(1)}ms`);
}

console.log(JSON.stringify({
  ok: true,
  sizes,
  parts: rig.parts.length,
  clips: motions.clips.length,
  keyframes,
  parseIterations: limits.parseIterations,
  parseMs: Number(parseMs.toFixed(2)),
  limits,
}, null, 2));
