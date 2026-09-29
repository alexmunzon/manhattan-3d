# Visual Spec

Reference: [sf.thijs.gg](https://sf.thijs.gg/), observed 2026-09-29. Match its feel, not its code or assets.

## World

- Photoreal photogrammetry city at street level and from the air.
- ACES filmic tone mapping, sRGB output, a physically based sky, and a warm afternoon sun.
- Distance fog blends the tile LOD edge into the sky, so nothing pops in at the horizon.
- Soft shadows on the avatar and vehicles only (tiles have baked lighting).
- Low-spec preset: no shadows, lower pixel ratio, a smaller tile radius.

## HUD layout (desktop, 1280px wide and up)

| Position                 | Element                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Top center               | Teleport bar: input "Address, place, or lat, lon" and a **GO** button                                                             |
| Top right                | Minimap: Manhattan outline, player dot and heading cone, compass, heading readout (`E · 081°`), **LABELS**, **− / +**, **EXPAND** |
| Right, below the minimap | Info panel: **COORDS** with **COPY LINK**, **AVATAR** color swatches                                                              |
| Bottom left              | 3D keycap legend: W A S D, SHIFT sprint/exit, C camera, H glider, V vehicle, − + speed, ↑ ↓ zoom                                  |
| Bottom center            | Mode HUD: speed (mph) and altitude (m above ground) while driving or gliding                                                      |
| Bottom left edge         | Google logo and data attributions, always visible and never overlapped                                                            |

## Design tokens

```css
--panel-bg: rgba(12, 20, 28, 0.72);
--panel-border: rgba(120, 200, 210, 0.25);
--panel-blur: 12px;
--radius: 10px;
--accent: #3fd0c9; /* teal */
--text: #e6f1f3;
--text-dim: #8aa3a8;
--font-ui: 'JetBrains Mono', ui-monospace, monospace; /* uppercase, 11px, letter-spacing 0.08em */
```

Keycaps use a light face (`#f4f6f7`), a darker bottom edge for depth, and a label beside each key.

## Camera rigs

| Mode    | Distance | Height | FOV    | Notes                                     |
| ------- | -------- | ------ | ------ | ----------------------------------------- |
| On foot | 4 m      | 1.8 m  | 60°    | Mouse orbit, collision pull-in            |
| Driving | 7 m      | 2.5 m  | 65°    | Lags behind on turns                      |
| Gliding | 9 m      | 3 m    | 70→80° | FOV widens with speed, subtle speed lines |

Mode switches blend over about 0.4 s. The camera never cuts or snaps.
