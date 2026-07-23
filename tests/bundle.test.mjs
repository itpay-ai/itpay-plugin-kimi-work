import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const lock = JSON.parse(readFileSync(new URL("../skills/itpay/bundle.lock.json", import.meta.url)));
const launcher = fileURLToPath(new URL("../skills/itpay/scripts/itpay.mjs", import.meta.url));
const skillRoot = fileURLToPath(new URL("../skills/itpay", import.meta.url));
const skill = readFileSync(new URL("../skills/itpay/SKILL.md", import.meta.url), "utf8");

test("bundled CLI matches the locked version", () => {
  assert.equal(execFileSync(process.execPath, [launcher, "--version"], { encoding: "utf8" }).trim(), lock.version);
  assert.equal(lock.package, "@itpay/cli");
  assert.equal(lock.format, "single-file-esm");
  assert.match(lock.npmIntegrity, /^sha512-/);
  assert.equal(existsSync(new URL("../skills/itpay/vendor/itpay-cli/node_modules", import.meta.url)), false);
  assert.equal(filesBelow(skillRoot).some((path) => path.split(/[\\/]/).includes("node_modules")), false);
});

test("launcher fixes the Kimi identity and exposes bundled guidance", () => {
  const shown = JSON.parse(execFileSync(process.execPath, [launcher, "skill", "show", "itpay", "--json"], { encoding: "utf8" }));
  assert.equal(shown.status, "shown");
  assert.equal(shown.next.command, "itpay --agent-type kimi-code catalog list --json");
  assert.match(shown.instruction, /kimi-code/);

  const docs = JSON.parse(execFileSync(process.execPath, [launcher, "docs", "show", "install-and-setup", "--json"], { encoding: "utf8" }));
  assert.equal(docs.status, "shown");
});

test("launcher rejects another platform identity", () => {
  const result = spawnSync(process.execPath, [launcher, "--agent-type", "workbuddy", "skill", "show", "itpay", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only supports --agent-type kimi-code/);
});

test("installed copy runs outside its source directory", () => {
  const root = mkdtempSync(join(tmpdir(), "itpay kimi plugin "));
  try {
    const installed = join(root, "skills", "itpay");
    cpSync(skillRoot, installed, { recursive: true });
    const copiedLauncher = join(installed, "scripts", "itpay.mjs");
    assert.equal(execFileSync(process.execPath, [copiedLauncher, "--version"], { cwd: tmpdir(), encoding: "utf8" }).trim(), lock.version);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Kimi Skill uses only the locked launcher and platform rules", () => {
  assert.match(skill, /KIMI_SKILL_DIR/);
  assert.match(skill, /kimi-code/);
  assert.doesNotMatch(skill, /npm install -g/);
  assert.doesNotMatch(skill, /WorkBuddy|dangerouslyDisableSandbox|present_files/);
});

function filesBelow(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}
