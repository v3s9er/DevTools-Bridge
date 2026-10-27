import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const vendor = resolve(root, "vendor");
const packages = [
  {
    directory: "devtools-app",
    name: "@chrome-devtools/devtools-app",
    version: "1.20261025.0",
    url: "https://registry.npmjs.org/@chrome-devtools/devtools-app/-/devtools-app-1.20261025.0.tgz",
    integrity: "sha512-eHjD4XxlMVSmT0Oz+BrM/FYNHNnwNJGc1MNLPrrsdqdf8pAItnS+ohv4CLy1JyIyJRBIj2/rIpbXtclQINFsZg=="
  },
  {
    directory: "ws",
    name: "ws",
    version: "8.22.0",
    url: "https://registry.npmjs.org/ws/-/ws-8.22.0.tgz",
    integrity: "sha512-Ydggc987+RO0AnWtZ/7Wq9FtNvcrL1b/RO0ud9mWjUPgDrsAAwQSF51sm2hm1XofbU/4jkpGEsLFsZZxU+1DOg=="
  }
];

function insideVendor(path) {
  if (!resolve(path).startsWith(vendor + sep)) throw new Error("Invalid dependency path");
  return path;
}

async function installed(pkg, destination) {
  try {
    const metadata = JSON.parse(await readFile(join(destination, "package.json"), "utf8"));
    return metadata.name === pkg.name && metadata.version === pkg.version;
  } catch {
    return false;
  }
}

async function install(pkg) {
  const destination = insideVendor(join(vendor, pkg.directory));
  if (await installed(pkg, destination)) {
    console.log(`${pkg.name} ${pkg.version} is ready.`);
    return;
  }

  const response = await fetch(pkg.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed: ${pkg.name} (${response.status})`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = "sha512-" + createHash("sha512").update(archive).digest("base64");
  if (actual !== pkg.integrity) throw new Error(`Integrity mismatch: ${pkg.name}`);

  await mkdir(vendor, { recursive: true });
  const staging = insideVendor(await mkdtemp(join(vendor, `.setup-${pkg.directory}-`)));
  const archivePath = insideVendor(join(staging, "download.tgz"));
  await writeFile(archivePath, archive);
  const extracted = insideVendor(join(staging, "package"));
  await mkdir(extracted);
  const result = spawnSync("tar", ["-xzf", archivePath, "--strip-components=1", "-C", extracted], {
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) throw new Error(`Extraction failed: ${pkg.name}`);
  if (!await installed(pkg, extracted)) throw new Error(`Unexpected package contents: ${pkg.name}`);
  await rename(extracted, destination);
  await unlink(archivePath);
  await rmdir(staging);
  console.log(`Installed ${pkg.name} ${pkg.version}.`);
}

try {
  for (const pkg of packages) await install(pkg);
  const patch = spawnSync(process.execPath, [join(root, "patch_bundle.mjs")], { stdio: "inherit" });
  if (patch.error || patch.status !== 0) throw new Error("DevTools browser compatibility patch failed");
} catch (error) {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
}
