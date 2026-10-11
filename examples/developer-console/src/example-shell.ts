import "./example-shell.css";
import { mountHeaderConnection } from "./header-connection.tsx";
import { examples } from "./example-catalog.ts";
const groups = Array.from(new Set(examples.map((example) => example.group)));
const header = document.createElement("header");
header.className = "example-header";
const brand = document.createElement("a");
brand.href = "/";
brand.className = "example-brand";
const logo = document.createElement("img");
logo.src = "/cyberwave-logo.png";
logo.alt = "Cyberwave";
brand.append(logo);
const caption = document.createElement("span");
caption.textContent = "Developer examples";
brand.append(caption);
const label = document.createElement("label");
label.className = "example-picker";
label.textContent = `Examples · ${examples.length}`;
const select = document.createElement("select");
select.setAttribute("aria-label", "Choose developer example");
for (const group of groups) {
  const node = document.createElement("optgroup");
  const items = examples.filter((example) => example.group === group);
  node.label = `${group} · ${items.length}`;
  for (const { path, title, id } of items) {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = `${String(id).padStart(2, "0")} · ${title}`;
    option.selected =
      (location.pathname === "/index.html" ? "/" : location.pathname) === path;
    node.append(option);
  }
  select.append(node);
}
select.addEventListener("change", () => location.assign(select.value));
label.append(select);
const connection = document.createElement("div");
connection.className = "example-api";
header.append(brand, label, connection);
document.body.prepend(header);
mountHeaderConnection(connection);

const current = examples.find(
  (example) =>
    example.path ===
    (location.pathname === "/index.html" ? "/" : location.pathname),
);
if (current) {
  const guide = document.createElement("details");
  guide.className = "example-guide";
  const summary = document.createElement("summary");
  summary.textContent = "About this example · data, setup and reusable pieces";
  guide.append(summary);
  const content = document.createElement("div");
  for (const [label, value] of [
    ["Data source", current.data],
    ["Before you start", current.setup],
    ["Actions and persistence", current.actions],
    ["Reuse", current.reuse],
  ]) {
    const paragraph = document.createElement("p"),
      title = document.createElement("strong");
    title.textContent = `${label}: `;
    paragraph.append(title, document.createTextNode(value));
    content.append(paragraph);
  }
  const root =
    "https://github.com/cyberwave-os/cyberwave-node/blob/codex/cyb-4234-javascript-sdk-components/";
  for (const [title, path] of [
    ["Example source", `examples/developer-console/src/${current.source}`],
    ["Integration guide", "docs/custom-ui.md"],
    ["Component reference", "packages/react/README.md"],
  ]) {
    const link = document.createElement("a");
    link.textContent = title;
    link.href = root + path;
    link.target = "_blank";
    link.rel = "noreferrer";
    content.append(link);
  }
  guide.append(content);
  header.after(guide);
}
