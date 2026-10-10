import "./example-shell.css";
import { mountHeaderConnection } from "./header-connection.tsx";
const groups = [
  {
    name: "SDK components",
    items: [
      ["/environments.html", "01 · Environment explorer"],
      ["/asset-catalog.html", "02 · Real asset studio"],
    ],
  },
  {
    name: "Visualization",
    items: [
      ["/", "03 · Cesium GIS & mission drafting"],
      ["/twin-monitor.html", "04 · Twin & camera monitor"],
    ],
  },
  {
    name: "Simulation",
    items: [
      ["/mission-simulation.html", "05 · Mission timeline"],
      ["/robot-environment.html", "06 · Robot environment & runtime modes"],
    ],
  },
  {
    name: "Command & control",
    items: [["/keyboard-telecontrol.html", "07 · Keyboard controller input"]],
  },
  {
    name: "Planning & governance",
    items: [["/mission-library.html", "11 · Workflows & schedules"]],
  },
  {
    name: "Maintenance",
    items: [
      ["/maintenance-planning.html", "12 · Maintenance planning"],
      ["/maintenance-verification.html", "13 · Maintenance verification"],
    ],
  },
  {
    name: "Inspection & GIS",
    items: [
      ["/aerial-inspection.html", "08 · Aerial inspection planning"],
      ["/inspection-workbench.html", "09 · Campaign & evidence review"],
      ["/recording-review.html", "10 · Recording catalog & playback"],
    ],
  },
];
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
label.textContent = `Examples · ${groups.reduce((sum, group) => sum + group.items.length, 0)}`;
const select = document.createElement("select");
select.setAttribute("aria-label", "Choose developer example");
for (const group of groups) {
  const node = document.createElement("optgroup");
  node.label = `${group.name} · ${group.items.length}`;
  for (const [path, title] of group.items) {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = title;
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
