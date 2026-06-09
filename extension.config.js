function externalizeDeps(deps) {
  return {
    name: 'externalize-deps',

    resolveId(source) {
      if (deps.includes(source)) {
        return {
          id: source,
          external: true,
        }
      }

      return null
    },
  }
}
export default {
  plugins: [
    externalizeDeps([
      'stream',
      'util',
      'http',
      'https',
      'url',
      'zlib',
      'events',
      'assert',
      'http2',
      'crypto'
    ]),
  ],
}
