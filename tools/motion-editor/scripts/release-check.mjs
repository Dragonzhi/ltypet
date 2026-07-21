import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const editorRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(editorRoot, "../..");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function scanBundle(directory, forbidden) {
  assert(statSync(directory).isDirectory(), `missing build output: ${directory}`);
  const files = filesUnder(directory);
  const textFiles = files.filter((file) => /\.(?:js|css|html|json)$/u.test(file));
  const text = textFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const token of forbidden) {
    assert(!text.includes(token), `bundle ${directory} contains forbidden token: ${token}`);
  }
  return files.reduce((total, file) => total + statSync(file).size, 0);
}

const editorPackage = readJson(path.join(editorRoot, "package.json"));
const editorLock = readJson(path.join(editorRoot, "package-lock.json"));
const tauriConfig = readJson(path.join(editorRoot, "src-tauri", "tauri.conf.json"));
const cargoToml = readFileSync(path.join(editorRoot, "src-tauri", "Cargo.toml"), "utf8");

assert(editorPackage.version === tauriConfig.version, "package.json and tauri.conf.json versions differ");
assert(cargoToml.includes(`version = "${editorPackage.version}"`), "Cargo.toml version differs");
assert(editorLock.packages?.[""]?.version === editorPackage.version, "package-lock root version differs");
assert(tauriConfig.bundle.active === true, "Tauri bundling must be enabled for releases");
assert(tauriConfig.bundle.targets?.includes("nsis"), "NSIS installer target is not configured");

for (const [name, version] of Object.entries({
  ...editorPackage.dependencies,
  ...editorPackage.devDependencies,
})) {
  assert(!/^[~^*]|[><=]|\s|\|/u.test(version), `${name} is not pinned exactly: ${version}`);
}

for (const file of [
  "UPSTREAM.md",
  "THIRD_PARTY_NOTICES.md",
  "THIRD_PARTY_LICENSES.generated.json",
  "RELEASE.md",
  "CHANGELOG.md",
  "package-lock.json",
  path.join("src-tauri", "Cargo.lock"),
]) {
  assert(statSync(path.join(editorRoot, file)).isFile(), `missing release input: ${file}`);
}

const productionBytes = scanBundle(path.join(repositoryRoot, "dist"), [
  "@svgedit/svgcanvas",
  "svgcanvas",
  "Animation Studio",
]);
const editorBytes = scanBundle(path.join(editorRoot, "dist"), [
  "OPENAI_API_KEY",
  "global-cursor-move",
  "start_dragging",
  "SecureKeyStore",
  "new Function",
  "eval(",
]);

assert(productionBytes < 5_000_000, `production frontend bundle is unexpectedly large: ${productionBytes}`);
assert(editorBytes < 5_000_000, `editor frontend bundle is unexpectedly large: ${editorBytes}`);

console.log(JSON.stringify({
  ok: true,
  version: editorPackage.version,
  productionFrontendBytes: productionBytes,
  editorFrontendBytes: editorBytes,
  schemas: { project: 1, rig: 1, motions: 1 },
}, null, 2));
