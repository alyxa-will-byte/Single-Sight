// The dimension-tower cosmology: NOT physics, a stipulated fictional rule
// system layered on top of the real Kerr/infall simulation. Declared
// explicitly so the HUD can label it as such rather than implying it was
// derived the way the Kerr metrics were.
//
// Rule: level L in {0..4} has S(L) = L+4 space dimensions and T(L) = L+5
// time dimensions (space is always exactly one dimension behind time).
// Crossing a black hole's singularity at level L advances to L+1. At L=4,
// T would need to reach 10 — instead the system collapses to a distinct
// zeroth state (the primordial singularity), which then seeds level 0
// again: a closed loop, not an infinite tower.

export const MAX_LEVEL = 4;

export function levelDims(L) {
  return { S: L + 4, T: L + 5 };
}

export function nextLevel(L) {
  return L >= MAX_LEVEL ? null : L + 1; // null = collapse to the primordial state
}

// Scale-factor growth law for a newly unfurled dimension's "width", modeled
// on FRW cosmology's a(t) ~ t^p (p = 2/3 matter-dominated, 1/2 radiation-
// dominated) rather than an arbitrary lighthouse-cone taper.
export function scaleFactor(t, t0, p = 2 / 3) {
  if (t <= 0) return 0;
  return Math.pow(Math.min(t / t0, 1), p);
}
