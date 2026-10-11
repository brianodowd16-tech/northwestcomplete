// Draws placeholder panoramas and floor plans for a room laid out in feet, so
// the placeholder tour looks like the real space: walls, floor grid, door, desk,
// stairs and product displays all in true perspective from each stop.

import { KINDS, displayGeometry, planToFt, project, rayToWall } from './room-geometry.mjs';

const W = 4096;
const H = 2048;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const WALL_COLOURS = { back: '#ebe4d8', front: '#e0d8ca', left: '#e6dfd2', right: '#ddd4c6' };

export function roomPanoramaSvg({ layout, room, node, floorName, productName }) {
  const camH = layout.cameraHeightFt;
  const cam = [...planToFt(layout, node.plan), camH];
  const heading = node.heading ?? 0;
  const ceiling = room.ceilingFt ?? 10;
  const parts = [`<rect width="${W}" height="${H}" fill="#8a7764"/>`];

  const toXY = (p) => {
    const { yaw, pitch } = project(cam, heading, p);
    return [(yaw / 360 + 0.5) * W, (0.5 - pitch / 180) * H];
  };

  // Projects a 3D path, keeping it continuous across the ±180° seam.
  const path2d = (pts3, closed) => {
    const dense = [];
    const n = pts3.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts3[i];
      const b = pts3[(i + 1) % n];
      for (let s = 0; s < 24; s++) dense.push(a.map((v, k) => v + ((b[k] - v) * s) / 24));
    }
    if (!closed) dense.push(pts3[n - 1]);
    const out = [];
    for (const p of dense) {
      if (Math.hypot(p[0] - cam[0], p[1] - cam[1]) < 0.4) continue;
      let [x, y] = toXY(p);
      if (out.length) {
        const px = out[out.length - 1][0];
        while (x - px > W / 2) x -= W;
        while (px - x > W / 2) x += W;
      }
      out.push([x, y]);
    }
    return out;
  };
  const pts = (xy) => xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const copies = (svg) => [-W, 0, W].map((dx) => `<g transform="translate(${dx} 0)">${svg}</g>`).join('');
  const poly = (pts3, attrs) => {
    const xy = path2d(pts3, true);
    if (xy.length > 2) parts.push(copies(`<polygon points="${pts(xy)}" ${attrs}/>`));
  };
  const line = (pts3, attrs) => {
    const xy = path2d(pts3, false);
    if (xy.length > 1) parts.push(copies(`<polyline points="${pts(xy)}" fill="none" ${attrs}/>`));
  };
  const label = (p, text, size, fill = '#2b2420') => {
    const [x, y] = toXY(p);
    for (const dx of [-W, 0, W]) parts.push(`<text x="${(x + dx).toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="middle" font-weight="600">${esc(text)}</text>`);
  };

  // Walls and ceiling, sampled column by column.
  const cols = [];
  for (let yaw = -180; yaw <= 180; yaw += 0.25) {
    const hit = rayToWall(room, cam, yaw + heading);
    const top = (Math.atan2(ceiling - camH, hit.t) * 180) / Math.PI;
    const bottom = (Math.atan2(-camH, hit.t) * 180) / Math.PI;
    cols.push({ x: (yaw / 360 + 0.5) * W, top: (0.5 - top / 180) * H, bottom: (0.5 - bottom / 180) * H, wall: hit.wall });
  }
  parts.push(`<polygon points="0,0 ${cols.map((c) => `${c.x.toFixed(1)},${c.top.toFixed(1)}`).join(' ')} ${W},0" fill="#f6f2ec"/>`);
  let start = 0;
  for (let i = 1; i <= cols.length; i++) {
    if (i === cols.length || cols[i].wall !== cols[start].wall) {
      const seg = cols.slice(start, Math.min(i + 1, cols.length));
      const d = seg.map((c) => `${c.x.toFixed(1)},${c.top.toFixed(1)}`).concat(seg.reverse().map((c) => `${c.x.toFixed(1)},${c.bottom.toFixed(1)}`));
      parts.push(`<polygon points="${d.join(' ')}" fill="${WALL_COLOURS[cols[start].wall]}"/>`);
      if (i < cols.length) parts.push(`<line x1="${cols[i].x}" x2="${cols[i].x}" y1="${cols[i].top}" y2="${cols[i].bottom}" stroke="#00000030" stroke-width="2"/>`);
      start = i;
    }
  }
  // Skirting and ceiling line.
  parts.push(`<polyline points="${cols.map((c) => `${c.x.toFixed(1)},${c.bottom.toFixed(1)}`).join(' ')}" fill="none" stroke="#5e5043" stroke-width="4"/>`);
  parts.push(`<polyline points="${cols.map((c) => `${c.x.toFixed(1)},${c.top.toFixed(1)}`).join(' ')}" fill="none" stroke="#00000020" stroke-width="2"/>`);

  // Floor tiles, 5 ft.
  for (let x = 5; x < room.widthFt; x += 5) line([[x, 0, 0], [x, room.depthFt, 0]], 'stroke="#00000022" stroke-width="2"');
  for (let y = 5; y < room.depthFt; y += 5) line([[0, y, 0], [room.widthFt, y, 0]], 'stroke="#00000022" stroke-width="2"');

  // Ceiling lights, for depth.
  for (let x = 10; x < room.widthFt; x += 20) {
    for (const y of [room.depthFt * 0.3, room.depthFt * 0.7]) {
      poly([[x - 1, y - 1, ceiling], [x + 1, y - 1, ceiling], [x + 1, y + 1, ceiling], [x - 1, y + 1, ceiling]], 'fill="#fffbe8" stroke="#00000018"');
    }
  }

  const features = [];
  if (room.door) {
    const { from, to } = room.door;
    const y = room.depthFt - 0.05;
    features.push(() => {
      poly([[from, y, 0], [to, y, 0], [to, y, 7], [from, y, 7]], 'fill="#a9c0cc" stroke="#3b2f25" stroke-width="5"');
      line([[(from + to) / 2, y, 0], [(from + to) / 2, y, 7]], 'stroke="#3b2f25" stroke-width="4"');
      label([(from + to) / 2, y, 7.6], 'ENTRANCE', 30, '#3b2f25');
    });
  }
  if (room.desk) {
    const { from, to, depthFt: dd } = room.desk;
    const left = room.desk.wall === 'left';
    const xf = left ? dd : room.widthFt - dd;
    const xw = left ? 0 : room.widthFt;
    const h = 3.5;
    features.push(() => {
      for (const y of [from, to]) poly([[xw, y, 0], [xf, y, 0], [xf, y, h], [xw, y, h]], 'fill="#a88b68"');
      poly([[xw, from, h], [xf, from, h], [xf, to, h], [xw, to, h]], 'fill="#e2d2bb"');
      poly([[xf, from, 0], [xf, to, 0], [xf, to, h], [xf, from, h]], 'fill="#b89b78" stroke="#5e5043" stroke-width="2"');
      label([(xf + xw) / 2, (from + to) / 2, h + 1], 'Reception desk', 32);
    });
  }
  if (room.stairs) {
    const { from, to, widthFt: sw } = room.stairs;
    const right = room.stairs.wall === 'right';
    const x0 = right ? room.widthFt - sw : 0;
    const x1 = right ? room.widthFt : sw;
    const inner = right ? x0 : x1;
    features.push(() => {
      if (room.stairs.opening) {
        poly([[x0, from, 0], [x1, from, 0], [x1, to, 0], [x0, to, 0]], 'fill="#3a302a"');
        line([[inner, from, 3], [inner, to, 3]], 'stroke="#2b2420" stroke-width="6"');
        for (let y = from; y <= to; y += 2.5) line([[inner, y, 0], [inner, y, 3]], 'stroke="#2b2420" stroke-width="3"');
        label([inner, (from + to) / 2, 4], 'Stairs down', 30);
      } else {
        // Rises towards the back wall, from `to` up to `from`.
        const rise = ceiling;
        poly([[x0, to, 0], [x1, to, 0], [x1, from, rise], [x0, from, rise]], 'fill="#efe7db" stroke="#5e5043" stroke-width="2"');
        const steps = 16;
        for (let i = 1; i < steps; i++) {
          const y = to - ((to - from) * i) / steps;
          const z = (rise * i) / steps;
          line([[x0, y, z], [x1, y, z]], 'stroke="#5e5043" stroke-width="2"');
        }
        poly([[inner, to, 0], [inner, from, rise], [inner, from, 0]], 'fill="#cbb89f" stroke="#5e5043" stroke-width="2"');
        line([[inner, to, 3], [inner, from, rise + 3]], 'stroke="#2b2420" stroke-width="5"');
        label([inner, (from + to) / 2, rise / 2 + 4], 'Stairs up', 30);
      }
    });
  }
  features.forEach((draw) => draw());

  // Displays, furthest first so near ones overlap them.
  const displays = (layout.displays ?? [])
    .filter((d) => d.floor === node.floor)
    .map((d) => ({ d, g: displayGeometry(room, d) }))
    .map((o) => ({ ...o, dist: Math.hypot(o.g.cx - cam[0], o.g.cy - cam[1]) }))
    .sort((a, b) => b.dist - a.dist);
  for (const { d, g, dist } of displays) {
    const [tx, ty] = [g.tx, g.ty];
    // Unit vector from the face back to the wall.
    const back = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] }[d.wall];
    const depth = g.off;
    const face = (u, v) => [g.cx + tx * (u - 0.5) * g.w, g.cy + ty * (u - 0.5) * g.w, g.e + v * g.h];
    const toWall = (p) => [p[0] + back[0] * depth, p[1] + back[1] * depth, p[2]];
    const A = face(0, 0);
    const B = face(1, 0);
    const C = face(1, 1);
    const D = face(0, 1);
    // Side facing the camera, then top, then front.
    const side = (cam[0] - g.cx) * tx + (cam[1] - g.cy) * ty > 0 ? [B, C] : [A, D];
    poly([side[0], toWall(side[0]), toWall(side[1]), side[1]], `fill="${g.body}" fill-opacity="0.8" stroke="#00000040"`);
    if (g.e + g.h < camH) poly([D, C, toWall(C), toWall(D)], `fill="${g.body}" fill-opacity="0.65"`);
    poly([A, B, C, D], `fill="${g.body}" stroke="#00000055" stroke-width="2"`);
    const [u0, v0, uw, vh] = g.glow;
    poly([face(u0, v0), face(u0 + uw, v0), face(u0 + uw, v0 + vh), face(u0, v0 + vh)], `fill="${g.inner}"`);
    if (d.kind === 'stove' || d.kind === 'gas') {
      const top = face(0.5, 1);
      const flueBase = [top[0] + back[0] * depth * 0.5, top[1] + back[1] * depth * 0.5, top[2]];
      line([flueBase, [flueBase[0], flueBase[1], ceiling]], 'stroke="#1f1a17" stroke-width="10"');
    }
    // Name painted on nearby displays only; the pins name the rest.
    if (dist <= 16) {
      const name = productName(d.sku) ?? d.sku;
      const size = Math.max(16, Math.min(30, 330 / Math.max(dist, 1)));
      label([g.cx, g.cy, g.e + g.h + 0.4], name.length > 26 ? `${name.slice(0, 25)}…` : name, size.toFixed(0));
    }
  }

  for (const yaw of [0, 180]) {
    const x = (yaw / 360 + 0.5) * W;
    for (const dx of [-W, 0, W]) {
      parts.push(`<text x="${x + dx}" y="${H * 0.16}" font-size="64" font-weight="700" fill="#3b2f25" text-anchor="middle">${esc(node.name)}</text>`);
      parts.push(`<text x="${x + dx}" y="${H * 0.16 + 54}" font-size="34" fill="#3b2f25aa" text-anchor="middle">${esc(floorName)} · ${room.widthFt} × ${room.depthFt} ft · placeholder panorama</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}

export function roomPlanSvg({ layout, room, floor, nodes }) {
  const [w, h] = floor.size;
  const s = layout.pxPerFt;
  const m = layout.margin;
  const X = (ft) => m + ft * s;
  const Y = (ft) => m + ft * s;
  const ink = '#3b2f25';
  const parts = [`<rect width="${w}" height="${h}" fill="#f7f4ef"/>`];
  parts.push(`<rect x="${m}" y="${m}" width="${room.widthFt * s}" height="${room.depthFt * s}" fill="#fffdf9" stroke="${ink}" stroke-width="8"/>`);
  parts.push(`<text x="${w / 2}" y="${m - 12}" font-size="16" fill="${ink}99" text-anchor="middle" letter-spacing="2">BACK · ${room.widthFt} ft</text>`);
  parts.push(`<text transform="translate(${m - 14} ${h / 2}) rotate(-90)" font-size="16" fill="${ink}99" text-anchor="middle" letter-spacing="2">${room.depthFt} ft</text>`);

  for (const d of layout.displays.filter((x) => x.floor === floor.id)) {
    const g = displayGeometry(room, d);
    const back = { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0] }[d.wall];
    const xs = [g.cx - Math.abs(g.tx) * g.w / 2, g.cx + Math.abs(g.tx) * g.w / 2, g.cx + back[0] * g.off];
    const ys = [g.cy - Math.abs(g.ty) * g.w / 2, g.cy + Math.abs(g.ty) * g.w / 2, g.cy + back[1] * g.off];
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const x1 = Math.max(...xs, x0 + 0.4);
    const y1 = Math.max(...ys, y0 + 0.4);
    const realProduct = !d.name;
    parts.push(`<rect x="${X(x0)}" y="${Y(y0)}" width="${(x1 - x0) * s}" height="${(y1 - y0) * s}" fill="${realProduct ? '#e2591f' : KINDS[d.kind].body}" fill-opacity="${realProduct ? 0.9 : 0.55}" rx="2"/>`);
  }

  if (room.door) {
    const { from, to } = room.door;
    parts.push(`<rect x="${X(from)}" y="${Y(room.depthFt) - 6}" width="${(to - from) * s}" height="12" fill="#fffdf9"/>`);
    parts.push(`<path d="M${X(from)} ${Y(room.depthFt)} a${((to - from) * s) / 2} ${((to - from) * s) / 2} 0 0 1 ${((to - from) * s) / 2} ${-((to - from) * s) / 2} M${X(to)} ${Y(room.depthFt)} a${((to - from) * s) / 2} ${((to - from) * s) / 2} 0 0 0 ${-((to - from) * s) / 2} ${-((to - from) * s) / 2}" fill="none" stroke="${ink}88" stroke-width="2" stroke-dasharray="5 4"/>`);
    parts.push(`<text x="${X((from + to) / 2)}" y="${h - 12}" font-size="17" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing="3">ENTRANCE</text>`);
  }
  if (room.desk) {
    const { from, to, depthFt: dd } = room.desk;
    const x = room.desk.wall === 'left' ? 0 : room.widthFt - dd;
    parts.push(`<rect x="${X(x)}" y="${Y(from)}" width="${dd * s}" height="${(to - from) * s}" fill="#d9c7ae" stroke="${ink}" stroke-width="2"/>`);
    parts.push(`<text transform="translate(${X(x + dd / 2) + 5} ${Y((from + to) / 2)}) rotate(-90)" font-size="14" fill="${ink}" text-anchor="middle">DESK</text>`);
  }
  if (room.stairs) {
    const { from, to, widthFt: sw } = room.stairs;
    const x = room.stairs.wall === 'right' ? room.widthFt - sw : 0;
    parts.push(`<rect x="${X(x)}" y="${Y(from)}" width="${sw * s}" height="${(to - from) * s}" fill="${room.stairs.opening ? '#d8cdbd' : '#efe7db'}" stroke="${ink}" stroke-width="2"/>`);
    for (let y = from + 1.25; y < to; y += 1.25) parts.push(`<line x1="${X(x)}" x2="${X(x + sw)}" y1="${Y(y)}" y2="${Y(y)}" stroke="${ink}" stroke-width="1"/>`);
    parts.push(`<path d="M${X(x + sw * 0.7)} ${Y(to) - 10} V${Y(from) + 14} m-7 9 l7 -9 l7 9" fill="none" stroke="${ink}" stroke-width="2.5"/>`);
  }
  for (const n of nodes.filter((node) => node.floor === floor.id && node.plan)) {
    parts.push(`<text x="${n.plan[0]}" y="${n.plan[1] - 16}" font-size="15" fill="${ink}" text-anchor="middle">${esc(n.name)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">${parts.join('')}</svg>`;
}
