// Simplified radial-infall model for visualization purposes.
// Not a precise geodesic solver — it is tuned to dramatize two real facts:
//  1) gravitational + kinematic time dilation drives dτ/dt -> 0 at the horizon
//  2) an infalling observer's own proper time keeps ticking normally through that limit
// `rs` (the crossing radius) is passed in explicitly so it can be the Kerr
// outer horizon r+ rather than a fixed Schwarzschild constant.
const C = 1; // simulation units where c = 1

export function createInfallState(startRadius) {
  return {
    r: startRadius,
    tau: 0, // proper time experienced by the infalling probe
    tCoord: 0, // coordinate time elapsed for a distant observer
    crossed: false,
  };
}

// Newtonian-like infall speed profile capped below c, steepening near rs.
function properVelocity(r, rs) {
  const v = C * Math.sqrt(rs / Math.max(r, rs * 0.001));
  return Math.min(v, C * 0.9999);
}

// Combined gravitational + special-relativistic dilation factor dτ/dt.
export function dilationFactor(r, rs) {
  const grav = Math.max(1 - rs / Math.max(r, rs * 0.001), 1e-6);
  const v = properVelocity(r, rs);
  const beta2 = Math.min((v / C) ** 2, 1 - 1e-9);
  const sr = Math.sqrt(1 - beta2);
  return Math.sqrt(grav) * sr;
}

// Advance the simulation by dτ of the probe's own proper time.
export function stepInfall(state, dTau, rs) {
  if (state.crossed) return state;
  const v = properVelocity(state.r, rs);
  state.r = Math.max(state.r - v * dTau, 0.0001);
  state.tau += dTau;

  const dilation = dilationFactor(state.r, rs);
  // dt = dτ / (dτ/dt): as dilation -> 0, coordinate time diverges.
  const dt = dTau / Math.max(dilation, 1e-6);
  state.tCoord += Math.min(dt, 1e9);

  if (state.r <= rs * 1.001) {
    state.crossed = true;
  }
  return state;
}
