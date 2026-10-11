// Room maths for placeholder tours laid out in feet (layouts/<tour>.json).
//
// Room coordinates: x along the front wall from the left wall (0..widthFt),
// y from the back wall towards the front (0..depthFt), z up from the floor.
// Plan pixels are origin + feet * pxPerFt, so "up" on the plan is the back wall.

export const KINDS = {
  fireplace: { w: 5, h: 4.2, e: 0, off: 0.4, category: 'Fireplaces', image: 'products/fireplace.svg', body: '#d9cbb5', inner: '#2b2420', glow: [0.3, 0.12, 0.4, 0.35] },
  stove: { w: 2, h: 2.8, e: 0, off: 1.5, category: 'Stoves', image: 'products/stove.svg', body: '#2b2420', inner: '#e86a2a', glow: [0.2, 0.3, 0.6, 0.4] },
  gas: { w: 2, h: 2.8, e: 0, off: 1.5, category: 'Gas stoves & fires', image: 'products/stove.svg', body: '#3d3a38', inner: '#f08a3c', glow: [0.15, 0.25, 0.7, 0.45] },
  inset: { w: 2.6, h: 2, e: 1, off: 0.3, category: 'Inset fires', image: 'products/fireplace.svg', body: '#1f1c1a', inner: '#e86a2a', glow: [0.12, 0.2, 0.76, 0.55] },
  electric: { w: 4, h: 1.6, e: 3, off: 0.2, category: 'Electric fires', image: 'products/fireplace.svg', body: '#141414', inner: '#ff8a3d', glow: [0.06, 0.45, 0.88, 0.35] },
  accessory: { w: 2, h: 3, e: 0, off: 1, category: 'Accessories', image: 'products/accessory.svg', body: '#7a6a58', inner: '#a68a6d', glow: [0.15, 0.55, 0.7, 0.35] },
  fuel: { w: 3, h: 3.5, e: 0, off: 1, category: 'Fuel & log storage', image: 'products/accessory.svg', body: '#8a6a45', inner: '#b88b5a', glow: [0.1, 0.1, 0.8, 0.8] },
  outdoor: { w: 3, h: 2.8, e: 0, off: 1.5, category: 'Outdoor & garden', image: 'products/accessory.svg', body: '#4a4744', inner: '#e86a2a', glow: [0.25, 0.6, 0.5, 0.25] },
};

export function roomOf(layout, floorId) {
  return layout.floors[floorId] ?? null;
}

export function ftToPlan(layout, [x, y]) {
  return [Math.round(layout.margin + x * layout.pxPerFt), Math.round(layout.margin + y * layout.pxPerFt)];
}

export function planToFt(layout, [px, py]) {
  return [(px - layout.margin) / layout.pxPerFt, (py - layout.margin) / layout.pxPerFt];
}

export function planSize(layout, room) {
  return [Math.round(room.widthFt * layout.pxPerFt + 2 * layout.margin), Math.round(room.depthFt * layout.pxPerFt + 2 * layout.margin)];
}

// Display footprint: centre point on the floor, the wall it backs onto, and
// the unit vector along that wall (for its width).
export function displayGeometry(room, d) {
  const k = KINDS[d.kind];
  const off = k.off;
  switch (d.wall) {
    case 'back':
      return { ...k, cx: d.at, cy: off, tx: 1, ty: 0 };
    case 'front':
      return { ...k, cx: d.at, cy: room.depthFt - off, tx: -1, ty: 0 };
    case 'left':
      return { ...k, cx: off, cy: d.at, tx: 0, ty: -1 };
    case 'right':
      return { ...k, cx: room.widthFt - off, cy: d.at, tx: 0, ty: 1 };
    default:
      throw new Error(`unknown wall ${d.wall}`);
  }
}

// Point the pin sits on: the middle of the display's front face, a bit above centre.
export function pinPoint(room, d) {
  const g = displayGeometry(room, d);
  return [g.cx, g.cy, g.e + g.h * 0.55];
}

// Camera-relative yaw/pitch in degrees. heading = plan bearing of the panorama centre.
export function project(cam, heading, [x, y, z]) {
  const dx = x - cam[0];
  const dy = y - cam[1];
  const dz = z - cam[2];
  const r = Math.hypot(dx, dy);
  const bearing = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const yaw = ((((bearing - heading + 180) % 360) + 360) % 360) - 180;
  const pitch = (Math.atan2(dz, r) * 180) / Math.PI;
  return { yaw, pitch, dist: r };
}

// Distance from the camera to the room's walls along a plan bearing, and which wall.
export function rayToWall(room, cam, bearingDeg) {
  const b = (bearingDeg * Math.PI) / 180;
  const vx = Math.sin(b);
  const vy = -Math.cos(b);
  const hits = [];
  if (vy < 0) hits.push({ t: -cam[1] / vy, wall: 'back' });
  if (vy > 0) hits.push({ t: (room.depthFt - cam[1]) / vy, wall: 'front' });
  if (vx < 0) hits.push({ t: -cam[0] / vx, wall: 'left' });
  if (vx > 0) hits.push({ t: (room.widthFt - cam[0]) / vx, wall: 'right' });
  return hits.reduce((a, c) => (c.t < a.t ? c : a));
}
