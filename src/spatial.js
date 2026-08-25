// Spatial hash grid for toroidal neighbor queries (pure).
// Decision: queryCircle gathers candidate cells with wrapped indices, dedupes
// items via a Set, then filters by true toroidal distance — correct for any
// radius, including ones that cross an edge or span the whole axis.

export function toroidDelta(d, limit) {
  return d - Math.round(d / limit) * limit;
}

export function toroidDist(x1, y1, x2, y2, w, h) {
  const dx = toroidDelta(x2 - x1, w);
  const dy = toroidDelta(y2 - y1, h);
  return Math.hypot(dx, dy);
}

export function toroidAngle(fromX, fromY, toX, toY, w, h) {
  return Math.atan2(toroidDelta(toY - fromY, h), toroidDelta(toX - fromX, w));
}

export function createSpatial(w, h, cellSize = 64) {
  const cols = Math.max(1, Math.ceil(w / cellSize));
  const rows = Math.max(1, Math.ceil(h / cellSize));
  const cells = Array.from({ length: cols * rows }, () => []);
  return {
    w, h, cellSize, cols, rows, cells,
    clear() { for (const c of cells) c.length = 0; },
    insert(item) {
      const cx = ((Math.floor(item.x / cellSize) % cols) + cols) % cols;
      const cy = ((Math.floor(item.y / cellSize) % rows) + rows) % rows;
      cells[cy * cols + cx].push(item);
    },
    queryCircle(x, y, r) {
      const out = [];
      const seen = new Set();
      for (let cy = Math.floor((y - r) / cellSize); cy <= Math.floor((y + r) / cellSize); cy++) {
        for (let cx = Math.floor((x - r) / cellSize); cx <= Math.floor((x + r) / cellSize); cx++) {
          const cxi = ((cx % cols) + cols) % cols;
          const cyi = ((cy % rows) + rows) % rows;
          for (const item of cells[cyi * cols + cxi]) {
            if (seen.has(item)) continue;
            seen.add(item);
            if (toroidDist(x, y, item.x, item.y, w, h) <= r) out.push(item);
          }
        }
      }
      return out;
    },
  };
}
