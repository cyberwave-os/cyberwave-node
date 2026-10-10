import './example-shell.css';
const groups = [
  { name: 'SDK components · 2', items: [['/environments.html', '01 · Environment explorer'], ['/asset-catalog.html', '02 · Real asset studio']] },
  { name: 'Visualization · 2', items: [['/', '03 · Cesium GIS & mission drafting'], ['/twin-monitor.html', '04 · Twin & camera monitor']] },
  { name: 'Simulation · 2', items: [['/mission-simulation.html', '05 · Mission timeline'], ['/robot-environment.html', '06 · Robot environment & runtime modes']] },
  { name: 'Command & control · 1', items: [['/keyboard-telecontrol.html', '07 · Keyboard controller input']] },
];
const header = document.createElement('header'); header.className = 'example-header';
const brand = document.createElement('a'); brand.href = '/'; brand.className = 'example-brand';
const logo = document.createElement('img'); logo.src = '/cyberwave-logo.png'; logo.alt = 'Cyberwave'; brand.append(logo);
const caption = document.createElement('span'); caption.textContent = 'Developer examples'; brand.append(caption);
const label = document.createElement('label'); label.className = 'example-picker'; label.textContent = 'Examples · 7';
const select = document.createElement('select'); select.setAttribute('aria-label', 'Choose developer example');
for (const group of groups) { const node = document.createElement('optgroup'); node.label = group.name;
  for (const [path, title] of group.items) { const option = document.createElement('option'); option.value = path; option.textContent = title;
    option.selected = location.pathname === path; node.append(option); } select.append(node); }
select.addEventListener('change', () => location.assign(select.value)); label.append(select);
header.append(brand, label); document.body.prepend(header);
