// Ensure built assets use /proposal-app/ base so they load inside the embedded route
export default {
  base: '/proposal-app/',
  build: {
    outDir: 'dist'
  }
};
