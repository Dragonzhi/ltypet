import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(path.join(editorRoot, "package-lock.json"), "utf8"));
const npm = Object.entries(lock.packages)
  .filter(([key]) => key.startsWith("node_modules/"))
  .map(([key, value]) => ({
    name: key.slice("node_modules/".length),
    version: value.version,
    license: value.license ?? "UNKNOWN",
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const cargoExecutable = process.platform === "win32"
  ? path.join(process.env.USERPROFILE ?? "", ".cargo", "bin", "cargo.exe")
  : "cargo";
const executable = existsSync(cargoExecutable) ? cargoExecutable : "cargo";
const tree = execFileSync(executable, [
  "tree",
  "--offline",
  "--locked",
  "--target",
  "x86_64-pc-windows-msvc",
  "--prefix",
  "none",
  "--format",
  "{p}",
  "--manifest-path",
  path.join(editorRoot, "src-tauri", "Cargo.toml"),
], { encoding: "utf8" });
const registrySources = path.join(process.env.USERPROFILE ?? "", ".cargo", "registry", "src");
const registryRoots = existsSync(registrySources)
  ? readdirSync(registrySources).map((name) => path.join(registrySources, name))
  : [];

function cargoLicense(name, version) {
  for (const root of registryRoots) {
    const manifest = path.join(root, `${name}-${version}`, "Cargo.toml");
    if (!existsSync(manifest)) continue;
    return readFileSync(manifest, "utf8").match(/^license\s*=\s*"([^"]+)"/mu)?.[1] ?? "UNKNOWN";
  }
  return "UNKNOWN";
}

const activeCrates = new Map();
for (const line of tree.split(/\r?\n/u)) {
  const match = line.match(/^([^\s]+) v([^\s]+)(?:\s|$)/u);
  if (match && match[1] !== "ltypet-motion-editor") activeCrates.set(`${match[1]}@${match[2]}`, match.slice(1, 3));
}
const rust = [...activeCrates.values()]
  .map(([name, version]) => ({ name, version, license: cargoLicense(name, version) }))
  .sort((left, right) => left.name.localeCompare(right.name));

const output = {
  schemaVersion: 1,
  generatedFrom: ["package-lock.json", "src-tauri/Cargo.lock"],
  npm,
  rust,
};
writeFileSync(
  path.join(editorRoot, "THIRD_PARTY_LICENSES.generated.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
console.log(`Recorded ${npm.length} npm and ${rust.length} Rust packages.`);
