/// <reference types="vite/client" />

// PNG imports resolve to a URL string. Needed because the '@shared-assets' alias points
// outside the project root, so tsconfig's include does not cover those files.
declare module '@shared-assets/*.png' {
  const src: string;
  export default src;
}
