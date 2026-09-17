// Simplified radial-infall model for visualization purposes.
// Not a precise geodesic solver — it is tuned to dramatize two real facts:
//  1) gravitational + kinematic time dilation drives dτ/dt -> 0 at the horizon
//  2) an infalling observer's own proper time keeps ticking normally through that limit
export const RS = 1; // event horizon radius, in simulation units
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
function properVelocity(r) {
  const v = C * Math.sqrt(RS / Math.max(r, RS * 0.001));
  return Math.min(v, C * 0.9999);
}

// Combined gravitational + special-relativistic dilation factor dτ/dt.
export function dilationFactor(r) {
  const grav = Math.max(1 - RS / Math.max(r, RS * 0.001), 1e-6);
  const v = properVelocity(r);
  const beta2 = Math.min((v / C) ** 2, 1 - 1e-9);
  const sr = Math.sqrt(1 - beta2);
  return Math.sqrt(grav) * sr;
}

// Advance the simulation by dτ of the probe's own proper time.
export function stepInfall(state, dTau) {
  if (state.crossed) return state;
  const v = properVelocity(state.r);
  state.r = Math.max(state.r - v * dTau, 0.0001);
  state.tau += dTau;

  const dilation = dilationFactor(state.r);
  // dt = dτ / (dτ/dt): as dilation -> 0, coordinate time diverges.
  const dt = dTau / Math.max(dilation, 1e-6);
  state.tCoord += Math.min(dt, 1e9);

  if (state.r <= RS * 1.001) {
    state.crossed = true;
  }
  return state;
}
