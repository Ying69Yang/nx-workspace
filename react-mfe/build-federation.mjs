import { fileURLToPath } from 'url';
import * as path from 'path';
import { runEsBuildBuilder } from '@softarc/native-federation-esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workspaceRoot = process.env.NX_WORKSPACE_ROOT || path.join(__dirname, '..');
const outputDir = path.join(workspaceRoot, 'dist/react-mfe');
const cacheDir = path.join(workspaceRoot, 'node_modules/.cache/native-federation/react_mfe');

async function fixFederationArtifacts() {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');

  let reactShimName = "";
  let shimName = "";
  let reactDomShimName = "";
  let reactDomClientShimName = "";

  // --- Plugin Inline para transformar CJS require() en ESM Imports nativos ---
  const cjsToEsmPlugin = {
    name: 'cjs-to-esm-bridge',
    setup(build) {
      build.onLoad({ filter: /react-jsx-runtime\.production\.js$/ }, async (args) => {
        let contents = await readFile(args.path, 'utf-8');
        contents = `import * as __imported_react from "react";\n` +
          contents.replace(/require\(['"]react['"]\)/g, '(__imported_react.default || __imported_react)');
        return { contents, loader: 'js' };
      });

      build.onLoad({ filter: /react-dom\.production\.js$/ }, async (args) => {
        let contents = await readFile(args.path, 'utf-8');
        contents = `import * as __imported_react from "react";\n` +
          contents.replace(/require\(['"]react['"]\)/g, '(__imported_react.default || __imported_react)');
        return { contents, loader: 'js' };
      });

      build.onLoad({ filter: /react-dom-client\.production\.js$/ }, async (args) => {
        let contents = await readFile(args.path, 'utf-8');
        contents = `import * as __imported_react from "react";\nimport * as __imported_react_dom from "react-dom";\n` +
          contents
            .replace(/require\(['"]react['"]\)/g, '(__imported_react.default || __imported_react)')
            .replace(/require\(['"]react-dom['"]\)/g, '(__imported_react_dom.default || __imported_react_dom)');
        return { contents, loader: 'js' };
      });
    }
  };

  // --- 1. remoteEntry.json ---
  const remoteEntryPath = path.join(outputDir, 'remoteEntry.json');
  const remoteEntry = JSON.parse(await readFile(remoteEntryPath, 'utf-8'));

  const hasJsxRuntime = remoteEntry.shared?.some((s) => s.packageName === 'react/jsx-runtime');
  if (!hasJsxRuntime) {
    remoteEntry.shared.push({
      packageName: 'react/jsx-runtime',
      outFileName: 'react/jsx-runtime',
      requiredVersion: '^19.0.0',
      singleton: true,
      strictVersion: true,
      version: '19.2.7',
    });
  }

  for (const entry of remoteEntry.shared || []) {
    if (entry.outFileName && !entry.outFileName.startsWith('./')) {
      entry.outFileName = './' + entry.outFileName;
    }
  }
  for (const entry of remoteEntry.exposes || []) {
    if (entry.outFileName && !entry.outFileName.startsWith('./')) {
      entry.outFileName = './' + entry.outFileName;
    }
  }

  // --- 2. importmap.json ---
  const importMapPath = path.join(outputDir, 'importmap.json');
  let importMap = { imports: {} };
  try {
    importMap = JSON.parse(await readFile(importMapPath, 'utf-8'));
  } catch { }

  let changed = false;
  for (const [key, value] of Object.entries(importMap.imports)) {
    if (typeof value === 'string' && !value.startsWith('./') && !value.startsWith('http') && !value.startsWith('/')) {
      importMap.imports[key] = './' + value;
      changed = true;
    }
  }

  const reactFile = importMap.imports["react"];
  if (reactFile) {
    const subpaths = ["react/jsx-runtime", "react/jsx-dev-runtime"];
    for (const sub of subpaths) {
      if (!importMap.imports[sub]) {
        importMap.imports[sub] = reactFile;
        changed = true;
      }
    }
  }

  const reactHash = importMap.imports["react"]?.match(/\.([^.]+)\.js$/)?.[1] || "HSzxl1Tmb9";
  const { build: esbuild } = await import("esbuild");

  // --- 3. Bundlear react/jsx-runtime ---
  const jsxRuntimeSrc = path.join(workspaceRoot, "node_modules/react/cjs/react-jsx-runtime.production.js");
  if (existsSync(jsxRuntimeSrc)) {
    const jsxRuntimeOut = `react_jsx-runtime.${reactHash}.js`;
    const jsxRuntimeOutPath = path.join(outputDir, jsxRuntimeOut);
    shimName = `react_jsx-runtime.shim.${reactHash}.js`;

    if (!existsSync(path.join(outputDir, shimName))) {
      await esbuild({
        entryPoints: [jsxRuntimeSrc],
        outfile: jsxRuntimeOutPath,
        bundle: true,
        format: "esm",
        target: ["es2020"],
        platform: "browser",
        minify: true,
        legalComments: "none",
        external: ["react"],
        plugins: [cjsToEsmPlugin],
      });

      const shimContent = [
        `import * as ns from "./${jsxRuntimeOut}";`,
        `const m = ns.default || ns;`,
        `export const Fragment = m.Fragment;`,
        `export const jsx = m.jsx;`,
        `export const jsxs = m.jsxs;`,
        `export const jsxDEV = m.jsxDEV;`,
        `export default m;`,
      ].join("\n");
      await writeFile(path.join(outputDir, shimName), shimContent, "utf-8");

      importMap.imports["react/jsx-runtime"] = "./" + shimName;
      importMap.imports["react/jsx-dev-runtime"] = "./" + shimName;
      changed = true;
    }
  }

  // --- 4. Bundlear react core ---
  const reactSrc = path.join(workspaceRoot, "node_modules/react/cjs/react.production.js");
  if (existsSync(reactSrc)) {
    const reactOut = `react.${reactHash}.js`;
    const reactOutPath = path.join(outputDir, reactOut);
    reactShimName = `react.shim.${reactHash}.js`;

    if (!existsSync(path.join(outputDir, reactShimName))) {
      await esbuild({
        entryPoints: [reactSrc],
        outfile: reactOutPath,
        bundle: true,
        format: "esm",
        target: ["es2020"],
        platform: "browser",
        minify: true,
        legalComments: "none",
      });

      const reactShimContent = [
        `import * as ns from "./${reactOut}";`,
        `const m = ns.default || ns;`,
        `export const useState = m.useState;`,
        `export const useEffect = m.useEffect;`,
        `export const useRef = m.useRef;`,
        `export const useCallback = m.useCallback;`,
        `export const useMemo = m.useMemo;`,
        `export const useContext = m.useContext;`,
        `export const createContext = m.createContext;`,
        `export const forwardRef = m.forwardRef;`,
        `export const memo = m.memo;`,
        `export const Fragment = m.Fragment;`,
        `export const createElement = m.createElement;`,
        `export const cloneElement = m.cloneElement;`,
        `export const isValidElement = m.isValidElement;`,
        `export const lazy = m.lazy;`,
        `export const Suspense = m.Suspense;`,
        `export const StrictMode = m.StrictMode;`,
        `export const useId = m.useId;`,
        `export const useTransition = m.useTransition;`,
        `export const useDeferredValue = m.useDeferredValue;`,
        `export const useSyncExternalStore = m.useSyncExternalStore;`,
        `export const useActionState = m.useActionState;`,
        `export const useOptimistic = m.useOptimistic;`,
        `export const use = m.use;`,
        `export const startTransition = m.startTransition;`,
        `export const act = m.act;`,
        `export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;`,
        `export const __CLIENT_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = m.__CLIENT_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;`,
        `export const __SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = m.__SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;`,
        `export default m;`,
      ].join("\n");
      await writeFile(path.join(outputDir, reactShimName), reactShimContent, "utf-8");

      importMap.imports["react"] = "./" + reactShimName;
      changed = true;
    }
  }

  // --- 5. Bundlear react-dom ---
  const reactDomSrc = path.join(workspaceRoot, "node_modules/react-dom/cjs/react-dom.production.js");
  if (existsSync(reactDomSrc)) {
    const reactDomOut = `react_dom.${reactHash}.js`;
    const reactDomOutPath = path.join(outputDir, reactDomOut);
    reactDomShimName = `react_dom.shim.${reactHash}.js`;

    if (!existsSync(path.join(outputDir, reactDomShimName))) {
      await esbuild({
        entryPoints: [reactDomSrc],
        outfile: reactDomOutPath,
        bundle: true,
        format: "esm",
        target: ["es2020"],
        platform: "browser",
        minify: true,
        legalComments: "none",
        external: ["react"],
        plugins: [cjsToEsmPlugin],
      });

      const reactDomShimContent = [
        `import * as ns from "./${reactDomOut}";`,
        `const m = ns.default || ns;`,
        `export const createPortal = m.createPortal;`,
        `export const flushSync = m.flushSync;`,
        `export const version = m.version;`,
        `export const findDOMNode = m.findDOMNode;`,
        `export const unmountComponentAtNode = m.unmountComponentAtNode;`,
        `export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = m.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;`,
        `export default m;`,
      ].join("\n");
      await writeFile(path.join(outputDir, reactDomShimName), reactDomShimContent, "utf-8");

      importMap.imports["react-dom"] = "./" + reactDomShimName;
      changed = true;
    }
  }

  // --- 6. Bundlear react-dom/client ---
  const reactDomClientSrc = path.join(workspaceRoot, "node_modules/react-dom/cjs/react-dom-client.production.js");
  if (existsSync(reactDomClientSrc)) {
    const reactDomClientOut = `react_dom_client.${reactHash}.js`;
    const reactDomClientOutPath = path.join(outputDir, reactDomClientOut);
    reactDomClientShimName = `react_dom_client.shim.${reactHash}.js`;

    if (!existsSync(path.join(outputDir, reactDomClientShimName))) {
      await esbuild({
        entryPoints: [reactDomClientSrc],
        outfile: reactDomClientOutPath,
        bundle: true,
        format: "esm",
        target: ["es2020"],
        platform: "browser",
        minify: true,
        legalComments: "none",
        external: ["react", "react-dom"],
        plugins: [cjsToEsmPlugin],
      });

      const reactDomClientShimContent = [
        `import * as ns from "./${reactDomClientOut}";`,
        `const m = ns.default || ns;`,
        `export const createRoot = m.createRoot;`,
        `export const hydrateRoot = m.hydrateRoot;`,
        `export default m;`,
      ].join("\n");
      await writeFile(path.join(outputDir, reactDomClientShimName), reactDomClientShimContent, "utf-8");

      importMap.imports["react-dom/client"] = "./" + reactDomClientShimName;
      changed = true;
    }
  }

  // --- 7. Re-vincular artefactos ---
  for (const entry of remoteEntry.shared || []) {
    if (entry.packageName === "react") entry.outFileName = "./" + reactShimName;
    if (entry.packageName === "react/jsx-runtime") entry.outFileName = "./" + shimName;
    if (entry.packageName === "react-dom") entry.outFileName = "./" + reactDomShimName;
    if (entry.packageName === "react-dom/client") entry.outFileName = "./" + reactDomClientShimName;
  }
  await writeFile(remoteEntryPath, JSON.stringify(remoteEntry, null, 2), "utf-8");

  if (changed) {
    await writeFile(importMapPath, JSON.stringify(importMap, null, 2), "utf-8");
  }
}

async function writeIndexHtml() {
  const { readdir, readFile, writeFile } = await import("node:fs/promises");
  const files = await readdir(outputDir);
  const bundle = files.find((f) => /^web-component-.*\.js$/.test(f) && !f.endsWith(".css"));
  if (!bundle) throw new Error(`[react19] No se encontro el bundle web-component-*.js.`);

  const cssFile = files.find((f) => /^web-component-.*\.css$/.test(f));
  let importMapInline = { imports: {} };
  try {
    importMapInline = JSON.parse(await readFile(path.join(outputDir, "importmap.json"), "utf-8"));
  } catch { }

  const indexPath = path.join(outputDir, "index.html");
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>react-mfe (standalone)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${cssFile ? `<link rel="stylesheet" href="./${cssFile}" />` : ""}
  <script src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
  <script type="importmap">
${JSON.stringify(importMapInline, null, 2)}
  </script>
</head>
<body>
  <h1>react-mfe (standalone)</h1>
  <react-mfe-element></react-mfe-element>
  <script type="module" src="./${bundle}"></script>
</body>
</html>`;
  await writeFile(indexPath, html, "utf-8");
  return { indexPath, bundle, cssFile };
}

async function build() {
  console.log("[react19] Limpiando salida...");
  const { rm, mkdir } = await import("node:fs/promises");
  await rm(outputDir, { recursive: true, force: true });
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  console.log("[react19] Ejecutando Native Federation Builder...");
  const result = await runEsBuildBuilder(
    "react-mfe/federation.config.js",
    {
      workspaceRoot,
      outputPath: "dist/react-mfe",
      tsConfig: "react-mfe/tsconfig.app.json",
      dev: false,
      verbose: true,
      adapterConfig: { plugins: [], frameworks: [] },
      esbuildConfig: {
        external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      },
    }
  );

  await result.close();
  await fixFederationArtifacts();
  await writeIndexHtml();
  console.log("Build completado con exito.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});