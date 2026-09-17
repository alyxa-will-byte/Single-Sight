# Single-Sight — a 4D black hole bridge simulator

An interactive, browser-based visualization of falling into a black hole,
built around one real relativistic fact and one speculative extrapolation:

- **Real physics (dramatized, not exact GR):** as an infalling observer's
  radius `r` approaches the Schwarzschild radius `rs`, combined gravitational
  and kinematic time dilation drives `dτ/dt → 0`. The observer's own proper
  time `τ` keeps ticking normally; it is the distant, external "coordinate
  time" `t` that diverges toward infinity for anything watching from outside.
- **Speculative extrapolation (the premise of this project):** the simulator
  treats crossing the horizon as the point where the external timeline can no
  longer be synchronized with anything on the other side, and visualizes that
  as a rotation of coordinate axes into a 4th, spatial dimension — rendered
  as a rotating tesseract (4D hypercube) projected into 3D.

## Running it

No build step. Serve the directory statically and open it, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Files

- `index.html` — page shell and HUD
- `style.css` — HUD and transition styling
- `main.js` — Three.js scene: starfield, event horizon, accretion disk shader, camera, transition sequencing
- `physics.js` — simplified radial-infall / time-dilation model
- `tesseract.js` — 4D hypercube construction, rotation, and projection into 3D
