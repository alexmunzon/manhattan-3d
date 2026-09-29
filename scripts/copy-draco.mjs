// Copies three.js's Draco mesh decoder into public/ so Vite serves it. Google 3D Tiles are
// Draco-compressed. Generated output is git-ignored; the source of truth is node_modules/three.
import { cpSync, mkdirSync } from 'node:fs';

const from = 'node_modules/three/examples/jsm/libs/draco/gltf';
const to = 'public/draco';
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
