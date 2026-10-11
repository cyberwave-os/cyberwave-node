import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { examples } from "../examples/developer-console/src/example-catalog.ts";

const directory = new URL("../examples/developer-console/", import.meta.url);
const start = "<!-- example-catalog:start -->",
  end = "<!-- example-catalog:end -->";
assert.equal(
  new Set(examples.map((x) => x.id)).size,
  examples.length,
  "Duplicate example ID",
);
assert.equal(
  new Set(examples.map((x) => x.path)).size,
  examples.length,
  "Duplicate example route",
);
const pages = examples.map((x) =>
  x.path === "/" ? "index.html" : x.path.slice(1),
);
assert.deepEqual(
  [...pages].sort(),
  (await readdir(directory)).filter((x) => x.endsWith(".html")).sort(),
  "Every HTML entry must be documented in the catalog",
);
for (const example of examples) {
  const html = await readFile(
    new URL(
      example.path === "/" ? "index.html" : example.path.slice(1),
      directory,
    ),
    "utf8",
  );
  assert.ok(
    html.includes(`/src/${example.source}`),
    `Incorrect source for ${example.path}`,
  );
  await readFile(new URL(`src/${example.source}`, directory));
  assert.ok(
    [example.data, example.setup, example.actions, example.reuse].every((x) =>
      x.trim(),
    ),
    `Incomplete guide for ${example.path}`,
  );
}
const cell = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const generated = [
  start,
  "| Example / source | Data source | Before you start | Actions and persistence |",
  "| --- | --- | --- | --- |",
  ...[...examples]
    .sort((a, b) => a.id - b.id)
    .map(
      (x) =>
        `| [${String(x.id).padStart(2, "0")} · ${cell(x.title)}](http://127.0.0.1:5173${x.path}) · [source](src/${x.source}) | ${cell(x.data)} | ${cell(x.setup)} | ${cell(x.actions)} |`,
    ),
  end,
].join("\n");
const path = new URL("README.md", directory),
  source = await readFile(path, "utf8");
const from = source.indexOf(start),
  to = source.indexOf(end);
assert.ok(
  from >= 0 && to > from,
  `Missing catalog markers in ${fileURLToPath(path)}`,
);
const next = source.slice(0, from) + generated + source.slice(to + end.length);
if (process.argv.includes("--write")) await writeFile(path, next);
else
  assert.equal(source, next, "Example guide drifted. Run pnpm examples:write.");
console.log(
  `${examples.length} examples: HTML entries, source links and generated guide agree.`,
);
