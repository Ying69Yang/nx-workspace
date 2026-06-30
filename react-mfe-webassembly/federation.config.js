const { withNativeFederation } = require('@softarc/native-federation/config');

/**
 * Configuracion de Native Federation para el remoto React.
 *
 * Decision de arquitectura (POC):
 *  - NO compartimos `react` / `react-dom` con el shell.
 *    El remoto emite sus propios chunks de React/ReactDOM (incluido `react/jsx-runtime`)
 *    servidos por el file-server en :3001. Asi evitamos depender de que el shell
 *    publique esas dependencias en su import-map y se alinea con el patron
 *    habitual de MFEs React + Native Federation.
 *  - El bundle principal `web-component.js` queda ligero y el navegador
 *    resuelve los imports `react/jsx-runtime`, `react-dom/client`, etc.
 *    contra URLs relativas del propio remoto.
 */
module.exports = withNativeFederation({
  name: 'react-mfe-webassembly',
  exposes: {
    './web-component': './react-mfe-webassembly/src/web-component.tsx',
  },
  shared: {
    react: { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react-dom/client': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react/jsx-runtime': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
  },
  skip: [],
  esbuildConfig: {
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']
  }
});
