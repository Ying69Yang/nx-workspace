# NX Workspace — POC Micro Frontends

**Shell Angular 21 + MFE React 19 | Native Federation | PWA + Capacitor**

> Proof of Concept de una arquitectura de micro frontends con un shell Angular, un módulo federado React con cámara, estilos centralizados con Tailwind CSS, y soporte PWA/Capacitor.

---

## 📋 Resumen

| Aspecto | Tecnología |
|---------|-----------|
| **Monorepo** | Nx 22.7 |
| **Shell** | Angular 21 (SSR + esbuild) |
| **MFE Remoto** | React 19 + Web Components (Custom Elements) |
| **Federation** | Native Federation (esbuild, sin webpack) |
| **Estilos** | Tailwind CSS 3.4 centralizado en el shell |
| **Cámara** | Web API (`getUserMedia`) + Capacitor (nativo) |
| **PWA** | Service Worker + `ngsw-config.json` |
| **Servidor SSR** | Express + Angular SSR |

---

## 🧱 Proyectos del workspace

### `shell` — Angular 21 (host)

Aplicación Angular que actúa como contenedor principal. Renderiza el MFE React mediante un `ReactWrapperComponent` que carga el remoto vía `@angular-architects/native-federation`.

- **Puerto**: `4200`
- **SSR**: Sí (Angular 21 + Express)
- **Estilos**: Tailwind CSS compilado por el build de Angular, escaneando clases tanto de `shell/**` como de `react-mfe/**/*.tsx`
- **PWA**: Service Worker configurado con `ngsw-config.json`
- **Federation**: Carga el `remoteEntry.json` del remoto y monta el Web Component en light DOM

### `react-mfe` — React 19 (remote)

Micro frontend React expuesto como Web Component (`<react-mfe-element>`). Independiente del shell: sirve sus propios chunks de React/ReactDOM.

- **Puerto**: `3000`
- **Framework**: React 19 con `react-jsx` (JSX transform automático)
- **Web Component**: `web-component.tsx` define `ReactMfeElement` como Custom Element
- **Cámara**: Hook `useCamera` con detección automática de entorno
- **Build**: Script propio `build-federation.mjs` con esbuild

---

## ⚙️ Native Federation vs Module Federation (Webpack)

| Característica | Module Federation (Webpack) | Native Federation (esbuild) |
|---------------|---------------------------|---------------------------|
| **Bundler** | Webpack 5 | esbuild (Go, ~100x más rápido) |
| **Runtime** | `webpack.container` | `@softarc/native-federation-runtime` |
| **Config** | `ModuleFederationPlugin` | `federation.config.js` + `withNativeFederation()` |
| **Formato remoto** | `remoteEntry.js` (JS) | `remoteEntry.json` (JSON con metadatos) |
| **Import map** | No nativo | Genera `importmap.json` para resolución ES modules |
| **Shared** | Singleton por runtime | Basado en import-map del navegador |
| **Angular** | `@angular-architects/module-federation` | `@angular-architects/native-federation` |
| **React** | Plugin webpack específico | Plugin esbuild `react19ExternalsPlugin` (custom) |
| **Velocidad de build** | 30-60s | 1-3s |

---

## 🧬 Características del MFE React (`react-mfe`)

### Web Component como entry point

El MFE se expone como un **Custom Elements** estándar:

```ts
// web-component.tsx
class ReactMfeElement extends HTMLElement {
  connectedCallback() { this.root.render(<App />); }
}
customElements.define('react-mfe-element', ReactMfeElement);
```

Esto permite que **cualquier framework** (Angular, Vue, vanilla JS) monte el MFE sin saber que está hecho con React.

### Build con esbuild (custom pipeline)

El archivo `build-federation.mjs` orquesta el build completo:

1. **Native Federation Builder** (`runEsBuildBuilder`) compila el código TSX con esbuild
2. **Plugin `react19ExternalsPlugin`**: marca los imports de React/ReactDOM como externos y los redirige a URLs relativas (`./react.js`, `./react_jsx-runtime.js`, etc.)
3. **Bundle de React**: esbuild bundlea cada entry point de React (CJS) a ESM independiente
4. **Shim de named exports**: cada módulo CJS se envuelve en un shim ESM que expone tanto named exports como default export
5. **`remoteEntry.json`**: se genera con la lista de `exposes` y sus nombres de archivo

---

## 🔀 React: ¿Federado o no federado?

**Decisión deliberada de arquitectura.** En esta POC el MFE React **NO comparte (no federado)** sus dependencias con el shell. Cada uno sirve su propia copia de React.

### Código: Sin federar (configuración actual)

**`react-mfe/federation.config.js`** — `shared` vacío, React se sirve localmente:

```js
const { withNativeFederation } = require('@softarc/native-federation/config');

module.exports = withNativeFederation({
  name: 'react-mfe',
  exposes: {
    './web-component': './react-mfe/src/web-component.tsx',
  },
  shared: {
    // Intencionalmente vacío: el MFE sirve sus propios chunks de React
    // a través del file-server en :3000. No depende del import-map del shell.
  },
  skip: [],
});
```

**`react-mfe/build-federation.mjs`** (plugin de esbuild) — redirige los imports de React a archivos locales:

```js
build.onResolve({ filter: /^react($|\/)|react-dom($|\/)/ }, (args) => {
  const canonical = specifierToCanonical.get(args.path);
  if (canonical) {
    return { path: canonical, external: true };  // ./react_jsx-runtime.js
  }
});
```

**`react-mfe/project.json`** — el target `serve` usa un file-server que sirve los archivos de `dist/react-mfe/`:

```json
{
  "serve": {
    "executor": "@nx/web:file-server",
    "options": {
      "buildTarget": "react-mfe:build-federation",
      "port": 3000,
      "staticFilePath": "dist/react-mfe",
      "spa": true
    }
  }
}
```

**Resultado en el navegador** — el bundle `web-component.js` importa React desde el mismo origen:

```js
// web-component-YDCMH66I.js (simplificado)
import pe from "./react-dom_client.js";
import { jsx as C } from "./react_jsx-runtime.js";
```

### Código: Federado (cómo sería si compartiera React con el shell)

**`react-mfe/federation.config.js`** — `shared` con React declarado:

```js
module.exports = withNativeFederation({
  name: 'react-mfe',
  exposes: {
    './web-component': './react-mfe/src/web-component.tsx',
  },
  shared: {
    react: { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react/jsx-runtime': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
  },
});
```

**`shell/federation.config.js`** — el shell también debe exponer React:

```js
module.exports = withNativeFederation({
  name: 'shell',
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
    // shareAll ya incluye react, react-dom, etc.
  },
});
```

**`react-mfe/build-federation.mjs`** — SIN el plugin de externals, React se bundlea inline o se resuelve vía import-map:

```js
// Sin react19ExternalsPlugin — esbuild bundlea React dentro de web-component.js
// O bien se confía en que el import-map del shell resuelva los specifiers
build.onResolve({ filter: /^react($|\/)|react-dom($|\/)/ }, (args) => {
  return { path: args.path, external: true };
  // El navegador buscará 'react' en el import-map que inyecta el runtime
});
```

**`react-mfe/project.json`** — el target `serve` incluye un servidor de desarrollo con CORS y el runtime de federación:

```json
{
  "serve": {
    "executor": "@nx/web:file-server",
    "options": {
      "buildTarget": "react-mfe:build",
      "port": 3000,
      "staticFilePath": "dist/react-mfe",
      "spa": true,
      "cors": true
    }
  }
}
```

### Comparativa

| Aspecto | No federado ✅ (actual) | Federado |
|---------|----------------------|----------|
| **Aislamiento de versiones** | ✅ Cada MFE usa la versión de React que necesita | ❌ Todos los MFEs deben usar exactamente la misma versión |
| **Despliegue** | ✅ El MFE se despliega solo, sin tocar el shell | ⚠️ El shell debe recompilarse si cambia la versión de React compartida |
| **Configuración** | ✅ `shared: {}` vacío. Sin dependencia del import-map | ⚠️ `shared` declarado en ambos lados. Riesgo de conflictos de singleton |
| **Ancho de banda** | ⚠️ Cada MFE descarga React (~42 KB gzip sin minificar, ~10 KB con minificación y compresión HTTP) | ✅ Una sola descarga de React para todos los MFEs |
| **"Multiple React instances"** | ✅ Imposible (cada MFE tiene su copia aislada) | ⚠️ Posible si el singleton falla por versiones incompatibles |
| **Complejidad del build** | ✅ Baja. esbuild + copy de archivos | ⚠️ Media. Requiere coordinación fina de `shareAll` y `singleton` |

### ¿Cuándo federar?

Si el proyecto crece a **5+ MFEs React** y todos usan la misma versión, federar React empieza a tener sentido por el ahorro de ancho de banda. En ese caso:

1. Declarar `shared` en ambos `federation.config.js`
2. Quitar el `react19ExternalsPlugin` del build
3. Confiar en que el runtime de Native Federation resuelva los specifiers vía import-map

Para una **POC con 1 MFE**, la opción no federada es más simple, más aislada y se despliega en cualquier entorno (DEV/PRE/PRO) sin depender del shell.

---

## 🐚 Shell (Angular)

### ReactWrapperComponent

```ts
// react-wrapper.ts
await loadRemoteModule({ remoteName: 'react-mfe', exposedModule: './web-component' });
const element = document.createElement('react-mfe-element');
this.el.nativeElement.querySelector('#mfe-container').appendChild(element);
```

Carga el módulo remoto vía Native Federation y monta el Web Component en light DOM (sin Shadow DOM) para que los estilos globales de Tailwind le afecten.

### SSR (Server-Side Rendering)

Angular 21 genera el HTML en el servidor con Express. El MFE React se renderiza del lado del cliente (CSR) después de la hidratación.

### Tailwind CSS centralizado

El archivo `tailwind.config.js` escanea **ambos** proyectos:

```js
content: [
  `${workspaceRoot}/shell/src/**/*.{html,ts,scss}`,
  `${workspaceRoot}/react-mfe/src/**/*.{tsx,ts,jsx,js,css}`,
]
```

El shell compila el CSS con PostCSS + Tailwind. Como el MFE usa light DOM, las clases Tailwind escritas en los `.tsx` del MFE se incluyen en el CSS global del shell y se aplican sin `!important`.

---

## 📱 PWA + Capacitor

### PWA (Progressive Web App)

- **Service Worker**: configurado en `shell/ngsw-config.json`
- **Instalable**: la aplicación se puede instalar en el escritorio/móvil
- **Offline**: el service worker cachea los assets estáticos

### Capacitor

- **Plugin de cámara**: `@capacitor/camera` para acceso nativo en Android/iOS
- **Detección**: `Capacitor.isNativePlatform()` distingue entre web y nativo
- **Fallback web**: cuando Capacitor no está disponible, se usa `getUserMedia` del navegador

---

## 🔧 Comandos útiles

```bash
# Build del MFE React (custom esbuild pipeline)
node react-mfe/build-federation.mjs

# o vía Nx
npx nx run react-mfe:build-federation

# Servir el MFE (file-server estático en :3000)
npx nx run react-mfe:serve

# Build del shell (Angular + Native Federation)
npx nx run shell:build

# Servir el shell (dev-server con SSR en :4200)
npx nx run shell:serve

# Ambos a la vez
npx nx run-many -t serve

# Limpiar caché de Nx daemon
npx nx reset
```

### Despliegue en distintos entornos

Cada entorno solo necesita su propio `federation.manifest.json` en el shell:

```json
// shell/public/assets/federation.manifest.json — DEV
{
  "react-mfe": "http://localhost:3000/remoteEntry.json"
}
```

```json
// PRE
{
  "react-mfe": "https://pre-mfe.midominio.com/remoteEntry.json"
}
```

```json
// PRO
{
  "react-mfe": "https://mfe.midominio.com/remoteEntry.json"
}
```

El MFE se despliega independientemente en cada entorno. El shell solo necesita saber la URL base del remoto.

---

## 🏗️ Pipeline de build (`build-federation.mjs`)

```
1. runEsBuildBuilder (Native Federation)
   ├── Compila TSX → JS
   ├── Aplica react19ExternalsPlugin
   │   └── react → ./react.js
   │       react/jsx-runtime → ./react_jsx-runtime.js
   │       react-dom/client → ./react-dom_client.js
   └── Genera web-component-<hash>.js

2. copyReactChunksToOutput (esbuild)
   ├── Bundlea CJS → ESM (format: 'esm')
   ├── Renombra a *.cjs.js (ej: react_jsx-runtime.cjs.js)
   └── Genera shim con named exports + default export

3. writeRemoteEntry
   └── Genera remoteEntry.json con exposes

4. writeIndexHtml
   └── Genera index.html standalone para testing
```

### Estructura de `dist/react-mfe/`

```
remoteEntry.json         — Metadatos de federación
web-component-XXXX.js    — Bundle del Web Component
react.js                 — ESM shim de React
react.cjs.js             — Bundle CJS → ESM de esbuild
react_jsx-runtime.js     — ESM shim con jsx, jsxs, Fragment
react_jsx-runtime.cjs.js
react-dom.js
react-dom_client.js
importmap.json
index.html               — Standalone para testing
```

---

## 🧪 Desarrollo

### Probar la cámara en web

1. Conecta una webcam al ordenador
2. Arranca el MFE: `node react-mfe/build-federation.mjs && npx nx run react-mfe:serve`
3. Abre `http://localhost:3000/`
4. Haz clic en "📸 Take Photo"
5. El navegador pedirá permiso para usar la cámara → acepta
6. Se capturará un frame y aparecerá la preview

### Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `SyntaxError: doesn't provide an export named 'jsx'` | Chunks CJS sin transformar a ESM | El pipeline genera shims automáticamente |
| `TypeError: can't access property "startsWith"` | `remoteEntry.json` con formato incorrecto | `exposes` debe ser array de `{ key, outFileName }` |
| `Error: unknown remote react-mfe` | El shell no encuentra el remoto | Revisar `federation.manifest.json` |
| `DOMException: The object can not be found here` | Webcam no disponible | Conectar webcam o aceptar permisos |
| Error de build Nx (daemon loop) | Daemon de Nx corrupto | `npx nx reset` y rebuild |

---

## 📁 Estructura de directorios

```
nx-workspace/
├── shell/                          ← Angular 21 (host)
│   ├── src/
│   │   ├── app/
│   │   │   ├── wrappers/
│   │   │   │   ├── react-wrapper.ts    ← Carga el MFE React
│   │   │   │   └── react-wrapper.html
│   │   │   ├── app.ts
│   │   │   └── app.config.ts
│   │   ├── styles.scss                 ← Tailwind entry point
│   │   └── index.html
│   ├── federation.config.js            ← Config Native Federation
│   ├── ngsw-config.json                ← Service Worker PWA
│   └── project.json
│
├── react-mfe/                       ← React 19 (remote)
│   ├── src/
│   │   ├── app/
│   │   │   ├── CameraComponent.tsx     ← Vista (JSX)
│   │   │   ├── useCamera.ts            ← Lógica (hook)
│   │   │   ├── app.tsx                 ← Composición
│   │   │   └── app.module.css
│   │   └── web-component.tsx           ← Custom Element
│   ├── build-federation.mjs            ← Pipeline de build
│   ├── federation.config.js            ← Config Native Federation
│   └── vite.config.mts                 ← Config Vite (residual)
│
├── tailwind.config.js                  ← Tailwind (escanea shell + react-mfe)
├── postcss.config.js
├── nx.json
└── package.json
```

---

## 📚 Referencias

- [Native Federation](https://www.npmjs.com/package/@softarc/native-federation)
- [Angular Architects Native Federation](https://www.npmjs.com/package/@angular-architects/native-federation)
- [Capacitor Camera](https://capacitorjs.com/docs/apis/camera)
- [Nx](https://nx.dev)
- [Web Components (Custom Elements)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [Tailwind CSS](https://tailwindcss.com)
- [esbuild](https://esbuild.github.io)