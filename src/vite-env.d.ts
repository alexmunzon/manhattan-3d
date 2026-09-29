/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Dev-only debug handle for inspecting the running game from the browser console. */
interface Window {
  __manhattan?: {
    renderer: import('three').WebGLRenderer;
    world: import('./world/WorldSource').WorldSource;
    camera: import('three').Camera;
    character: import('./player/Character').Character;
    /** Advances one frame using real elapsed time. */
    tick: () => void;
  };
}
