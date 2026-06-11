const { withNativeFederation } = require('@softarc/native-federation/config');

/**
 * Configuracion de Native Federation para el remoto React.
 *
 * Decision de arquitectura (POC):
 *  - NO compartimos `react` / `react-dom` con el shell.
 *    El remoto emite sus propios chunks de React/ReactDOM (incluido `react/jsx-runtime`)
 *    servidos por el file-server en :3000. Asi evitamos depender de que el shell
 *    publique esas dependencias en su import-map y se alinea con el patron
 *    habitual de MFEs React + Native Federation.
 *  - El bundle principal `web-component.js` queda ligero y el navegador
 *    resuelve los imports `react/jsx-runtime`, `react-dom/client`, etc.
 *    contra URLs relativas del propio remoto.
 */
module.exports = withNativeFederation({
  name: 'react-mfe',
  exposes: {
    './web-component': './react-mfe/src/web-component.tsx',
  },
  shared: {
    // Intencionalmente vacio. Si en el futuro se quiere federar una lib
    // comun con el shell (p.ej. un modelo de @libs/shared/models), anadirla aqui.
  },
  skip: [],
});
