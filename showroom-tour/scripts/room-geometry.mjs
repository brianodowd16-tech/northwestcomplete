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
  // Stone showroom displays (a display's own `colour` overrides `body`).
  slab: { w: 6, h: 5, e: 0.4, off: 1.2, category: 'Slabs', image: 'products/slab.svg', body: '#ece8e0', inner: '#00000012', glow: [0.1, 0.15, 0.8, 0.12] },
  tile: { w: 3, h: 4, e: 0.6, off: 0.3, category: 'Tiles', image: 'products/tile.svg', body: '#d8cbb6', inner: '#00000018', glow: [0.5, 0, 0.02, 1] },
  mosaic: { w: 2.5, h: 2.5, e: 3, off: 0.15, category: 'Mosaics & feature walls', image: 'products/tile.svg', body: '#c9d3d6', inner: '#ffffff40', glow: [0.25, 0.25, 0.5, 0.5] },
  worktop: { w: 6, h: 3, e: 0, off: 2, category: 'Worktops', image: 'products/worktop.svg', body: '#3a3a3c', inner: '#ffffff22', glow: [0, 0.92, 1, 0.08] },
  vanity: { w: 3.5, h: 2.8, e: 0, off: 1.6, category: 'Bathroom vanities', image: 'products/worktop.svg', body: '#efebe4', inner: '#b8b2a8', glow: [0.3, 0.85, 0.4, 0.1] },
  limestone: { w: 3, h: 3, e: 0, off: 1.5, category: 'Maltese limestone', image: 'products/stone.svg', body: '#d9b77e', inner: '#00000014', glow: [0, 0.5, 1, 0.03] },
  paving: { w: 4, h: 1.6, e: 0, off: 2, category: 'Paving & outdoor stone', image: 'products/stone.svg', body: '#a39a8c', inner: '#00000018', glow: [0, 0.48, 1, 0.04] },
  carving: { w: 2, h: 4, e: 0, off: 1.5, category: 'Carvings & garden stone', image: 'products/stone.svg', body: '#e1cfa8', inner: '#00000012', glow: [0.3, 0.55, 0.4, 0.3] },
  // Crystal and gemstone shop displays.
  shelf: { w: 3, h: 6, e: 0, off: 0.9, category: 'Crystals & minerals', image: 'products/crystal.svg', body: '#6b4f3a', inner: '#b9a2d6', glow: [0.08, 0.1, 0.84, 0.8] },
  cabinet: { w: 4, h: 3.3, e: 0, off: 1.6, category: 'Jewellery', image: 'products/jewellery.svg', body: '#3b3430', inner: '#d9e6ea', glow: [0.05, 0.62, 0.9, 0.33] },
  geode: { w: 1.6, h: 3.2, e: 0, off: 1.1, category: 'Geodes & specimens', image: 'products/crystal.svg', body: '#4b3b5c', inner: '#9a7fc2', glow: [0.15, 0.4, 0.7, 0.55] },
  bins: { w: 3, h: 2.6, e: 0, off: 1.3, category: 'Tumbled stones', image: 'products/crystal.svg', body: '#7a5c43', inner: '#c7b8a4', glow: [0.05, 0.75, 0.9, 0.2] },
  wallart: { w: 2.2, h: 2.2, e: 4, off: 0.1, category: 'Fossils & wall pieces', image: 'products/crystal.svg', body: '#2e2a27', inner: '#cdb48f', glow: [0.12, 0.12, 0.76, 0.76] },
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
    // Either face of an interior wall (room.partition) between two side-by-side rooms.
    case 'partition-left':
      return { ...k, cx: room.partition.x - off, cy: d.at, tx: 0, ty: 1 };
    case 'partition-right':
      return { ...k, cx: room.partition.x + off, cy: d.at, tx: 0, ty: -1 };
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
  const p = room.partition;
  if (p && vx !== 0) {
    const t = (p.x - cam[0]) / vx;
    const y = cam[1] + vy * t;
    if (t > 0 && !(y >= p.doorFrom && y <= p.doorTo)) hits.push({ t, wall: 'partition' });
  }
  return hits.reduce((a, c) => (c.t < a.t ? c : a));
}

// Whether a point can be seen from the camera, i.e. not behind the partition
// (only through its doorway).
export function visibleFrom(room, cam, point) {
  const p = room.partition;
  if (!p) return true;
  const a = cam[0] - p.x;
  const b = point[0] - p.x;
  if (a * b >= 0) return true;
  const t = a / (a - b);
  const y = cam[1] + (point[1] - cam[1]) * t;
  return y >= p.doorFrom && y <= p.doorTo;
}

// Back-to-wall direction for a display, as a unit vector.
export function backVector(wall) {
  return { back: [0, -1], front: [0, 1], left: [-1, 0], right: [1, 0], 'partition-left': [1, 0], 'partition-right': [-1, 0] }[wall];
}
