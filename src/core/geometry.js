// Bar window geometry, in DIP coordinates (Electron screen API space).
// Anchored to the *work area* (taskbar / Dock / menu bar excluded) — spec 4.2.

export function computeBarBounds(workArea, edge, thickness) {
  const t = Math.max(1, Math.round(thickness));
  switch (edge) {
    case 'top':
      return { x: workArea.x, y: workArea.y, width: workArea.width, height: t };
    case 'bottom':
      return { x: workArea.x, y: workArea.y + workArea.height - t, width: workArea.width, height: t };
    case 'left':
      return { x: workArea.x, y: workArea.y, width: t, height: workArea.height };
    case 'right':
      return { x: workArea.x + workArea.width - t, y: workArea.y, width: t, height: workArea.height };
    default:
      throw new Error(`unknown edge: ${edge}`);
  }
}

export function isHorizontal(edge) {
  return edge === 'top' || edge === 'bottom';
}

export function pointInBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}
