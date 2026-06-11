import { fileURLToPath } from 'url';
import * as path from 'path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build as esbuild } from 'esbuild';
import { runEsBuildBuilder } from '@softarc/native-federation-esbuild';

// Recreamos __dirname para el entorno de ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Variable de entorno nativa de Nx con fallback automatico
const workspaceRoot = process.env.NX_WORKSPACE_ROOT || path.join(__dirname, '..');
const outputDir = path.join(workspaceRoot, 'dist/react-mfe');

/**
 * Mapeo de `entry points` de React/ReactDOM (los specifiers que usa el
 * codigo) a los archivos de produccion CJS dentro de `node_modules/`.
 *
 * Cada uno sera bundleado por esbuild a un archivo ESM en
 * `dist/react-mfe/` con un nombre canonico (guion bajo en vez de guion
 * para evitar colisiones con extensiones).
 */
const REACT_ENTRY_POINTS = {
  react: 'node_modules/react/cjs/react.production.js',
  'react/jsx-runtime': 'node_modules/react/cjs/react-jsx-runtime.production.js',
  'react/jsx-dev-runtime': 'node_modules/react/cjs/react-jsx-dev-runtime.production.js',
  'react-dom': 'node_modules/react-dom/cjs/react-dom.production.js',
  'react-dom/client': 'node_modules/react-dom/cjs/react-dom-client.production.js',
};
// Nombres de archivo de salida (con .js) que el file-server sirve y que
// el plugin de externals referencia desde los imports del web-component.
const CANONICAL_FILE_NAMES = {
  react: 'react.js',
  'react/jsx-runtime': 'react_jsx-runtime.js',
  'react/jsx-dev-runtime': 'react_jsx-dev-runtime.js',
  'react-dom': 'react-dom.js',
  'react-dom/client': 'react-dom_client.js',
};
// esbuild `entryPoints` admite un objeto { nombre: ruta } donde `nombre`
// se interpreta COMO ruta de salida relativa a `outdir`. Si le pasamos
// `react.js`, esbuild anade otra extension y termina generando `react.js.js`.
// Solucion: pasar la clave SIN extension y derivar el archivo de salida
// del nombre canonico.
const ENTRY_KEYS = {
  react: 'react',
  'react/jsx-runtime': 'react_jsx-runtime',
  'react/jsx-dev-runtime': 'react_jsx-dev-runtime',
  'react-dom': 'react-dom',
  'react-dom/client': 'react-dom_client',
};

/**
 * Plugin de esbuild que:
 *  1. Marca los specifiers de React/ReactDOM como `external: true` para que
 *     `web-component.js` los importe por URL en vez de bundlearlos inline.
 *  2. Redirige esos imports a los nombres canonicos locales
 *     (p.ej. `react/jsx-runtime` -> `./react_jsx-runtime.js`).
 *
 * Esto permite que el file-server del remoto sirva los chunks y el navegador
 * los resuelva sin necesidad de import-map externo.
 */
function react19ExternalsPlugin() {
  return {
    name: 'react19-externals',
    setup(build) {
      // Mapeo: specifier (lo que aparece en el codigo) -> archivo canonico
      const specifierToCanonical = new Map([
        ['react', './react.js'],
        ['react/jsx-runtime', './react_jsx-runtime.js'],
        ['react/jsx-dev-runtime', './react_jsx-dev-runtime.js'],
        ['react-dom', './react-dom.js'],
        ['react-dom/client', './react-dom_client.js'],
      ]);

      // Filtro: solo interceptamos los specifiers que nos interesan
      const filter = /^react($|\/)|react-dom($|\/)/;

      build.onResolve({ filter }, (args) => {
        const canonical = specifierToCanonical.get(args.path);
        if (canonical) {
          return {
            path: canonical,
            external: true,
          };
        }
        return null;
      });
    },
  };
}

/**
 * Bundlea cada entry point de React/ReactDOM (CJS) a un archivo ESM
 * individual en `dist/react-mfe/` con nombre canonico.
 *
 * Por que esto: los archivos en `node_modules/react/cjs/*.production.js`
 * son CommonJS puro (`"use strict"; exports.jsx = ...`). El navegador los
 * importa como ES modules (`import { jsx } from "./react_jsx-runtime.js"`)
 * y falla con `SyntaxError: ... doesn't provide an export named 'jsx'`.
 * esbuild transforma CJS -> ESM por nosotros en un solo paso.
 *
 * Resultado: cada `import "react/jsx-runtime"` del bundle del web-component
 * se resuelve a `./react_jsx-runtime.js` (ESM valido) servido por el
 * file-server del remoto.
 */
async function copyReactChunksToOutput() {
  await mkdir(outputDir, { recursive: true });

  const produced = [];
  // Construimos un objeto de entry points para esbuild: clave = nombre
  // de salida SIN extension (esbuild le anade .js), valor = ruta
  // absoluta al CJS de React.
  const entryPoints = {};
  for (const [specifier, relPath] of Object.entries(REACT_ENTRY_POINTS)) {
    const absPath = path.join(workspaceRoot, relPath);
    if (!existsSync(absPath)) {
      console.warn(`[react19] AVISO: no se encontro ${relPath}, se omite.`);
      continue;
    }
    entryPoints[ENTRY_KEYS[specifier]] = absPath;
  }

  if (Object.keys(entryPoints).length === 0) {
    console.warn('[react19] No hay entry points de React para bundlear.');
    return produced;
  }

  // Para cada entry point generamos DOS archivos:
  //   <name>.js        -> bundle ESM con `export default <moduleExports>`
  //   <name>.named.js  -> reexporta los named exports de React a partir
  //                       del default, para que el navegador pueda hacer
  //                       `import { jsx, jsxs, Fragment } from "./..."`.
  //
  // Por que: cuando esbuild recibe un entry CJS (como los
  // `react-jsx-runtime.production.js` de React 19) y emite en formato
  // `esm`, expone el `module.exports` como un unico `export default`.
  // El navegador entonces no encuentra named exports y falla con
  // `SyntaxError: ... doesn't provide an export named 'jsx'`.
  // El workaround: tras el build, generar un shim ESM que destructura
  // el default y reexporta los simbolos publicos de cada modulo.
  const SHIM_EXPORTS = {
    react: ['Children', 'Component', 'Fragment', 'Profiler', 'PureComponent', 'StrictMode', 'Suspense', 'cloneElement', 'createContext', 'createElement', 'createFactory', 'createRef', 'forwardRef', 'isValidElement', 'lazy', 'memo', 'startTransition', 'unstable_useRootScope', 'use', 'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue', 'useEffect', 'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo', 'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition', 'version'],
    'react/jsx-runtime': ['Fragment', 'jsx', 'jsxs'],
    'react/jsx-dev-runtime': ['Fragment', 'jsxDEV'],
    'react-dom': ['createPortal', 'createRoot', 'findDOMNode', 'flushSync', 'hydrate', 'hydrateRoot', 'render', 'unmountComponentAtNode', 'unstable_batchedUpdates', 'version'],
    'react-dom/client': ['createRoot', 'hydrateRoot'],
  };

  const result = await esbuild({
    entryPoints,
    outdir: outputDir,
    bundle: true,           // resuelve dependencias (imports relativos)
    format: 'esm',          // <-- CLAVE: emite ES modules
    target: ['es2020'],
    platform: 'browser',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
    splitting: true,
  });

  // Post-proceso: el bundle de esbuild emite un solo `export default <moduleExports>`
  // (porque el entry es CJS). Para que el navegador pueda hacer
  // `import { jsx, jsxs } from "./react_jsx-runtime.js"` (named exports),
  // generamos un shim ESM en un archivo con el nombre canonico
  // (`react_jsx-runtime.js`) y dejamos el bundle de esbuild en un archivo
  // auxiliar (`react_jsx-runtime.cjs.js`) que es el que importa el shim.
  const { readFile: rf, writeFile: wf, rename: rn, unlink } = await import('node:fs/promises');
  for (const [specifier, entryKey] of Object.entries(ENTRY_KEYS)) {
    const bundlePath = path.join(outputDir, `${entryKey}.js`);
    const auxPath = path.join(outputDir, `${entryKey}.cjs.js`);
    const finalName = CANONICAL_FILE_NAMES[specifier]; // ej: react_jsx-runtime.js
    const finalPath = path.join(outputDir, finalName);

    if (!existsSync(bundlePath)) continue;

    // 1) Renombramos el bundle de esbuild a un nombre auxiliar para que
    //    no choque con el shim que vamos a crear con el nombre canonico.
    await rn(bundlePath, auxPath);

    // 2) Generamos el shim con named exports que importa el bundle renombrado.
    //    Ademas exponemos un `export default` que apunta al mismo objeto
    //    (necesario para que codigo que use `import x from "./react.js"`
    //    siga funcionando, p.ej. `web-component.js` hace
    //    `import pe from "./react-dom_client.js"`).
    const shim = [
      `// Auto-generated shim: re-exports named exports of a CJS module`,
      `// bundled as ESM. esbuild turns CJS into \`export default <moduleExports>\`,`,
      `// so we destructure it and re-export the public symbols AND a default`,
      `// export pointing to the same object (for \`import x from "./...js"\`).`,
      `import * as ns from "./${entryKey}.cjs.js";`,
      `const m = ns.default || ns;`,
      ...SHIM_EXPORTS[specifier].map((name) => `export const ${name} = m.${name};`),
      `export default m;`,
    ].join('\n');
    await wf(finalPath, shim, 'utf-8');
  }

  // esbuild escribe `<entryKey>.js` en outdir. Lo cotejamos con la lista
  // esperada y devolvemos los nombres canónicos (con .js) que el resto
  // del script y el plugin de externals esperan.
  const { readdir } = await import('node:fs/promises');
  const outFiles = await readdir(outputDir);
  for (const [specifier, entryKey] of Object.entries(ENTRY_KEYS)) {
    const expected = `${entryKey}.js`;
    if (outFiles.includes(expected)) {
      produced.push(CANONICAL_FILE_NAMES[specifier]);
    }
  }
  await result.rebuild?.(); // no-op en build unico
  return produced;
}

/**
 * Genera el `remoteEntry.json` con el formato que espera el runtime de
 * `@softarc/native-federation`:
 *
 *   {
 *     "name": "react-mfe",
 *     "exposes": {
 *       "./web-component": "./web-component-<HASH>.js"
 *     }
 *   }
 *
 * Notas importantes:
 *  - `exposes` debe ser OBJETO, no array. Si es un array el runtime falla
 *    con `TypeError: can't access property "startsWith", path2 is undefined`
 *    al iterarlo en softarc-native-federation-runtime.mjs:266.
 *  - El valor es el nombre del archivo JS del bundle (relativo a la URL
 *    base del remoto), NO la URL absoluta. El runtime le prependera
 *    `http://localhost:3000/`.
 *  - Detectamos el bundle real con un glob sobre `web-component-*.js`
 *    para soportar el hash que genera esbuild.
 */
async function writeRemoteEntry() {
  const { readdir, readFile, writeFile, unlink } = await import('node:fs/promises');

  // 1) Detectar el bundle del web-component (suele venir hasheado).
  const files = await readdir(outputDir);
  const bundle = files.find((f) => /^web-component-.*\.js$/.test(f) && !f.endsWith('.css'));
  if (!bundle) {
    throw new Error(
      `[react19] No se encontro ningun bundle web-component-*.js en ${outputDir}. ` +
      'Revisa que el build de esbuild haya terminado correctamente.'
    );
  }

  // 2) Leer los `exposes` declarados en el federation.config.js del remoto.
  //    Usamos import dinamico porque este archivo es un ES Module (.mjs).
  const federationConfigUrl = new URL(
    'file:///' +
    path.join(workspaceRoot, 'react-mfe/federation.config.js').replace(/\\/g, '/')
  );
  const federationConfig = await import(federationConfigUrl.href);
  // `withNativeFederation` envuelve el config en una funcion; lo ejecutamos
  // con un objeto vacio para extraer la forma del config original.
  // Pero en realidad ya sabemos la forma: una entrada por expose.
  // Para no acoplarnos a un valor hardcodeado, leemos el federation.config.js
  // como texto y extraemos las claves de `exposes:`.
  const { readFile: rf } = await import('node:fs/promises');
  const cfgSrc = await rf(federationConfigUrl.pathname.replace(/^\//, ''), 'utf-8');
  const exposesMatch = cfgSrc.match(/exposes:\s*\{([\s\S]*?)\}/);
  const exposedKeys = [];
  if (exposesMatch) {
    for (const m of exposesMatch[1].matchAll(/['"]([^'"]+)['"]\s*:/g)) {
      exposedKeys.push(m[1]);
    }
  }
  if (exposedKeys.length === 0) exposedKeys.push('./web-component');

  // 3) Construir el remoteEntry.json con la forma que genera el adapter de
  //    Native Federation: `exposes` es un array de { key, outFileName }.
  //    Esto es lo que espera el runtime; cualquier otro formato falla.
  const remoteEntry = {
    name: 'react-mfe',
    shared: [],
    exposes: exposedKeys.map((key) => ({
      key,
      outFileName: bundle,
    })),
  };
  await writeFile(
    path.join(outputDir, 'remoteEntry.json'),
    JSON.stringify(remoteEntry, null, 2) + '\n',
    'utf-8'
  );
  return 'remoteEntry.json';
}

/**
 * Genera un `index.html` autocontenido que monta el `<react-mfe-element>`
 * (el Web Component definido en `web-component.tsx`) cargando el bundle
 * del remoto directamente.
 *
 * Esto permite **probar el MFE en aislamiento** abriendo
 * `http://localhost:3000/` en el navegador, sin necesidad de tener el
 * shell levantado. En el shell, el `ReactWrapperComponent` hace
 * exactamente lo mismo (carga el modulo remoto y crea el custom element),
 * asi que este index.html es una version standalone para dev/test.
 *
 * Notas:
 *  - Usa `es-module-shims` por si el navegador no soporta import maps
 *    dinamicos de forma nativa (Edge legacy, Safari < 16.4, etc.).
 *  - El archivo del bundle se detecta con un glob (`web-component-*.js`).
 */
async function writeIndexHtml() {
  const { readdir, writeFile } = await import('node:fs/promises');

  const files = await readdir(outputDir);
  const bundle = files.find((f) => /^web-component-.*\.js$/.test(f) && !f.endsWith('.css'));
  if (!bundle) {
    throw new Error(
      `[react19] No se encontro el bundle web-component-*.js para escribir el index.html.`
    );
  }

  const cssFile = files.find((f) => /^web-component-.*\.css$/.test(f));

  const indexPath = path.join(outputDir, 'index.html');
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>react-mfe (standalone)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${cssFile ? `<link rel="stylesheet" href="./${cssFile}" />` : ''}
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    react-mfe-element { display: block; margin-top: 1rem; }
  </style>
  <!-- Polyfill de import maps para navegadores que no los soporten de forma nativa. -->
  <script async src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
</head>
<body>
  <h1>react-mfe (standalone)</h1>
  <p>Esto es el remoto servido en <code>:3000</code>. El Web Component
     <code>${'<'}react-mfe-element${'>'}</code> se monta a continuacion y
     carga React/ReactDOM desde los chunks servidos por este mismo file-server.</p>
  <!-- El custom element se define al cargar el bundle de abajo. -->
  <react-mfe-element></react-mfe-element>
  <script type="module" src="./${bundle}"></script>
</body>
</html>
`;
  await writeFile(indexPath, html, 'utf-8');
  return { indexPath, bundle, cssFile };
}

async function build() {
  console.log('[react19] Iniciando build de Native Federation...');
  const result = await runEsBuildBuilder(
    // Ruta al federation.config.js (relativa al workspaceRoot)
    'react-mfe/federation.config.js',
    {
      workspaceRoot,
      outputPath: 'dist/react-mfe',
      tsConfig: 'react-mfe/tsconfig.app.json',
      dev: false,
      verbose: true,
      adapterConfig: {
        plugins: [react19ExternalsPlugin()],
        // Sin frameworks: ya no usamos el plugin custom con fileReplacements
        // porque los modulos de React son ahora externos. Si en el futuro
        // se quisiera bundlear algun otro framework, anadirlo aqui.
        frameworks: [],
      },
    }
  );

  await result.close();
  console.log('[react19] Build de esbuild completado. Copiando chunks de React...');

  const copied = await copyReactChunksToOutput();
  if (copied.length > 0) {
    console.log('[react19] Chunks servibles copiados a dist/react-mfe/:');
    for (const f of copied) console.log(`  - ${f}`);
  } else {
    console.warn('[react19] No se copio ningun chunk de React. Revisa node_modules/react y node_modules/react-dom.');
  }

  await writeRemoteEntry();
  console.log('[react19] remoteEntry.json escrito.');

  const htmlInfo = await writeIndexHtml();
  console.log(`[react19] index.html escrito. Bundle: ${htmlInfo.bundle}${htmlInfo.cssFile ? ' / CSS: ' + htmlInfo.cssFile : ''}.`);

  console.log('Build de Native Federation (react-mfe) completado con exito.');
}

build().catch((err) => {
  console.error('Build de react-mfe ha fallado:', err);
  process.exit(1);
});
