import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
) as {
  scripts?: Record<string, string>;
};

test("worker reimport keeps configured default source and local replay is opt-in", () => {
  const scripts = packageJson.scripts ?? {};

  assert.ok(scripts["worker:reimport"]);
  assert.ok(scripts["worker:reimport:local"]);
  assert.doesNotMatch(scripts["worker:reimport"], /REPORT_SOURCE=local/);
  assert.match(scripts["worker:reimport:local"], /REPORT_SOURCE=local/);
});
