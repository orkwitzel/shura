// Stands in for `react-devtools-core` in the bundle. Ink imports it only for React DevTools in
// development (DEV=true with the package installed), which the published CLI never uses, but
// esbuild still needs something to resolve the import to.
export default {
  initialize() {},
  connectToDevTools() {},
};
