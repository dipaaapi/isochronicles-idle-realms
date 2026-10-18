/// <reference types="vite/client" />

/** True only in the Vite dev server: Developer Mode and the DevPanel are compiled out of every build. */
declare const __DEV_TOOLS__: boolean;
/** True in the Steam desktop build (`vite build --mode steam`). */
declare const __STEAM__: boolean;
