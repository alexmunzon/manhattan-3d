# Third-Party Notices

| Asset / data                                          | Author                                                                                                              | License                                                                               | Where                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| Animated Base Character (Universal Animation Library) | [Quaternius](https://quaternius.com/) via [Poly Pizza](https://poly.pizza/m/cwYvO5UauX)                             | CC-BY 4.0 on Poly Pizza (original release CC0)                                        | `public/models/character.glb`           |
| Taxi                                                  | [Quaternius](https://quaternius.com/) via [Poly Pizza](https://poly.pizza/m/x43lOScTpN)                             | Public Domain (CC0)                                                                   | `public/models/taxi.glb`                |
| Draco mesh decoder                                    | Google, distributed with three.js                                                                                   | Apache-2.0                                                                            | copied to `public/draco/` at build time |
| Photorealistic 3D Tiles                               | Google and data providers                                                                                           | [Map Tiles API terms](https://developers.google.com/maps/documentation/tile/policies) | streamed at runtime, never stored       |
| Google Maps logo                                      | Google, from [Google Maps Platform brand resources](https://developers.google.com/maps/documentation/tile/policies) | Shown as required by the Map Tiles API policies; not modified                         | `public/brand/` (added once supplied)   |

## Runtime libraries

| Library                                                              | License    | Use                                       |
| -------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| [three.js](https://threejs.org/)                                     | MIT        | Rendering, math, GLTF/Draco loading       |
| [3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Apache-2.0 | Streaming 3D Tiles from the Map Tiles API |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)        | MIT        | Fast raycasts for collision               |

Development dependencies (Vite, Vitest, ESLint, Prettier, TypeScript) retain their own licenses (see `package-lock.json`).
