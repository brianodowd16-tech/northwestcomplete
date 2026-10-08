// Pure helpers shared by the browser viewer and the Node scripts.
//
// Angles in tour.json are in degrees. Plan coordinates are pixels on the floor
// plan image, x to the right and y down. A node's `heading` is the plan bearing
// (0 = up on the plan, clockwise) that the centre of its panorama faces.

export function normalizeDeg(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export function planBearing(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

// Yaw of a link inside the source panorama. An explicit `yaw` wins; otherwise it
// is derived from both nodes' plan positions, Street View style.
export function linkYaw(node, link, nodesById) {
  if (typeof link.yaw === 'number') return normalizeDeg(link.yaw);
  const target = nodesById.get(link.nodeId);
  if (!node.plan || !target?.plan) return null;
  return normalizeDeg(planBearing(node.plan, target.plan) - (node.heading ?? 0));
}

export function indexNodes(tour) {
  return new Map(tour.nodes.map((n) => [n.id, n]));
}

export function indexProducts(catalog) {
  return new Map(catalog.products.map((p) => [p.sku, p]));
}

// Returns a list of human-readable problems with a tour + catalogue pair.
export function validateTour(tour, catalog) {
  const errors = [];
  const warnings = [];
  const nodes = indexNodes(tour);
  const products = indexProducts(catalog);
  const floors = new Set((tour.floors ?? []).map((f) => f.id));

  if (nodes.size !== tour.nodes.length) errors.push('Duplicate node ids');
  if (tour.startNodeId && !nodes.has(tour.startNodeId)) {
    errors.push(`startNodeId "${tour.startNodeId}" does not exist`);
  }

  for (const node of tour.nodes) {
    if (!node.panorama) errors.push(`${node.id}: missing panorama`);
    if (node.floor && !floors.has(node.floor)) errors.push(`${node.id}: unknown floor "${node.floor}"`);
    if (!node.plan) warnings.push(`${node.id}: not placed on the floor plan`);

    for (const link of node.links ?? []) {
      const target = nodes.get(link.nodeId);
      if (!target) {
        errors.push(`${node.id}: link to unknown node "${link.nodeId}"`);
        continue;
      }
      if (linkYaw(node, link, nodes) === null) {
        errors.push(`${node.id} -> ${link.nodeId}: no yaw and no plan positions to derive one`);
      }
      if (!(target.links ?? []).some((l) => l.nodeId === node.id)) {
        warnings.push(`${node.id} -> ${link.nodeId}: one-way link`);
      }
    }

    for (const h of node.hotspots ?? []) {
      if (!products.has(h.sku)) errors.push(`${node.id}: hotspot for unknown SKU "${h.sku}"`);
      if (typeof h.yaw !== 'number' || typeof h.pitch !== 'number') {
        errors.push(`${node.id}: hotspot ${h.sku} needs numeric yaw and pitch`);
      }
    }
  }

  for (const p of catalog.products) {
    if (typeof p.price !== 'number') errors.push(`product ${p.sku}: price must be a number`);
  }

  return { errors, warnings };
}
