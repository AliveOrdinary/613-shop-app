// PostToolUse hook: after Claude edits a file in src/lib, run the tests that import it.
// Passing tests stay quiet. Failing tests exit with code 2, which shows the output to
// Claude so it fixes them before moving on.

import { spawnSync } from "node:child_process";
import path from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

const file = JSON.parse(input || "{}")?.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const lib = path.join(root, "src", "lib") + path.sep;
if (!file || !path.resolve(root, file).startsWith(lib) || !/\.tsx?$/.test(file)) process.exit(0);

const run = spawnSync(path.join(root, "node_modules", ".bin", "vitest"), ["related", file, "--run", "--passWithNoTests"], {
  cwd: root,
  encoding: "utf8",
  timeout: 110_000,
});

if (run.status === 0) process.exit(0);

const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-60).join("\n");
console.error(`Tests related to ${path.relative(root, file)} failed:\n${out || run.error?.message || "no output"}`);
process.exit(2);
