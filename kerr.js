// Kerr (rotating) black hole formulas, in geometrized units (G = c = 1),
// mass M and spin parameter a = J/M, with 0 <= a <= M (a = M is extremal).
// Standard results: Boyer & Lindquist 1967; ISCO formula: Bardeen, Press &
// Teukolsky 1972.

export function kerrHorizons(M, a) {
  const disc = M * M - a * a;
  const naked = disc < 0; // a > M has no horizon (unphysical "naked singularity")
  const s = Math.sqrt(Math.max(disc, 0));
  return { rPlus: M + s, rMinus: Math.max(M - s, 0), naked };
}

// Static-limit / ergosphere boundary at colatitude theta (0 = spin axis).
export function ergoRadius(M, a, theta) {
  const disc = M * M - a * a * Math.cos(theta) ** 2;
  return M + Math.sqrt(Math.max(disc, 0));
}

// Innermost stable circular orbit, equatorial plane.
export function iscoRadius(M, a, prograde = true) {
  const aStar = Math.min(Math.max(a / M, -1), 1);
  const cbrt = Math.cbrt;
  const Z1 = 1 + cbrt(1 - aStar * aStar) * (cbrt(1 + aStar) + cbrt(1 - aStar));
  const Z2 = Math.sqrt(3 * aStar * aStar + Z1 * Z1);
  const sign = prograde ? -1 : 1;
  return M * (3 + Z2 + sign * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2)));
}

// Angular velocity of an equatorial circular orbit at radius r (prograde/retrograde).
export function orbitalOmega(M, a, r, prograde = true) {
  const sign = prograde ? 1 : -1;
  return sign * Math.sqrt(M) / (Math.pow(r, 1.5) + sign * a * Math.sqrt(M));
}
