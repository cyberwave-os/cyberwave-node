import type { Position } from './domain.ts';
export const node = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** SVG is a replaceable projection. It knows no network or command operations. */
export function drawPlan(observed: Position, preview: Position, points: Position[], heading = 0) {
  const all = [observed, preview, ...points];
  const minX = Math.min(...all.map(p => p.x)) - 2, maxX = Math.max(...all.map(p => p.x)) + 2;
  const minY = Math.min(...all.map(p => p.y)) - 2, maxY = Math.max(...all.map(p => p.y)) + 2;
  const project = (p: Position) => ({ x: 40 + (p.x - minX) / (maxX - minX) * 520,
    y: 350 - (p.y - minY) / (maxY - minY) * 310 });
  const svg = document.getElementById('plot')!;
  svg.replaceChildren();
  function shape(name: string, attributes: Record<string, string>) {
    const item = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
    svg.append(item); return item;
  }
  shape('polyline', { points: points.map(p => { const q = project(p); return `${q.x},${q.y}`; }).join(' '),
    fill: 'none', stroke: '#76dcb7', 'stroke-width': '3' });
  points.forEach(p => { const q = project(p); shape('circle', { cx: `${q.x}`, cy: `${q.y}`, r: '5', fill: '#76dcb7' }); });
  const measured = project(observed), simulated = project(preview);
  shape('circle', { cx: `${measured.x}`, cy: `${measured.y}`, r: '10', fill: '#64dbe9' });
  shape('circle', { cx: `${simulated.x}`, cy: `${simulated.y}`, r: '8', fill: '#ffbc65' });
  shape('line', { x1: `${simulated.x}`, y1: `${simulated.y}`, x2: `${simulated.x + Math.cos(heading) * 20}`,
    y2: `${simulated.y - Math.sin(heading) * 20}`, stroke: '#ffbc65', 'stroke-width': '3' });
}
