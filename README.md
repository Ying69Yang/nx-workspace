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
| **Estilos** | Tailwind CSS 3.4: estilos base en el shell, copia procesada en el MFE para modo standalone |
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

### Build con esbuild (Native Federation standard)

El archivo `build-federation.mjs` orquesta el build:

1. **Native Federation Builder** (`runEsBuildBuilder`) compila el código TSX con esbuild.
2. **Externalización y compartición**: Las dependencias de `react`, `react-dom`, `react-dom/client` y `react/jsx-runtime` se configuran en `shared` de `federation.config.js`. El builder las externaliza automáticamente del bundle principal y las compila como chunks federados compartidos.
3. **`remoteEntry.json`**: Se genera automáticamente por el builder con la metadata de módulos expuestos y dependencias compartidas.
4. **`importmap.json`**: Se genera automáticamente conteniendo el mapa de importación local para ejecutar el micro frontend en aislamiento.

---

## 🔀 React: MFE Federado y Compartido

En esta POC el MFE React **está federado** y comparte sus dependencias principales (`react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`) con el Shell Angular. Ambas partes declaran estas librerías en su sección `shared`, lo que permite que el navegador cargue una sola instancia de React (patrón Singleton) en tiempo de ejecución.

### Código: Configuración Federada

**`react-mfe/federation.config.js`** — `shared` con React declarado como singleton y sus versiones requeridas:

```js
const { withNativeFederation } = require('@softarc/native-federation/config');

module.exports = withNativeFederation({
  name: 'react-mfe',
  exposes: {
    './web-component': './react-mfe/src/web-component.tsx',
  },
  shared: {
    react: { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react-dom/client': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
    'react/jsx-runtime': { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' },
  },
  skip: [],
});
```

**`shell/federation.config.js`** — el shell también expone y comparte todas las dependencias principales instaladas en el workspace monorepo:

```js
const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: 'shell',
  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },
  // ...
});
```

**`react-mfe/build-federation.mjs`** — Invoca directamente al compilador nativo sin plugins de reescritura de externals:

```js
const result = await runEsBuildBuilder(
  'react-mfe/federation.config.js',
  {
    workspaceRoot,
    outputPath: 'dist/react-mfe',
    tsConfig: 'react-mfe/tsconfig.app.json',
    dev: false,
    verbose: true,
    adapterConfig: {
      plugins: [],
      frameworks: [],
    },
  }
);
```

**Resultado en el navegador** — El bundle `web-component-XXXX.js` del remoto realiza imports puros:

```js
import pe from "react-dom/client";
import { jsx as C } from "react/jsx-runtime";
```

El navegador resuelve estos imports utilizando el **Import Map** global dinámico que el runtime de Native Federation inicializa al arrancar la Shell Angular (mezclando el import map del host y el de los remotes).

### Ventajas de la Arquitectura Federada

1. **Ahorro de Ancho de Banda**: El navegador descarga y ejecuta el bundle de React una sola vez, sin importar cuántos MFEs React tengamos en la aplicación.
2. **Singleton de Estado**: Al compartir la misma instancia de React, se evitan errores de ejecución de React hooks que ocurren cuando coexisten múltiples copias de la librería en el mismo hilo de ejecución.
3. **Estándares Web**: Utiliza import maps nativos gestionados dinámicamente en lugar de empaquetar de forma fija con rutas relativas.

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

### Estilos del MFE en modo standalone

Cuando el MFE React se ejecuta en **modo standalone** (puerto 3000), necesita sus propios estilos base de Tailwind. Para ello:

1. **`react-mfe/src/styles.css`** contiene las mismas directivas `@tailwind` y estilos globales que el shell.
2. Durante el build, `build-federation.mjs` procesa este archivo con **PostCSS + Tailwind** (usando `postcss`, `tailwindcss` y `autoprefixer` como módulos Node.js) y lo copia a `dist/react-mfe/styles.css`.
3. El `index.html` standalone generado incluye `<link rel="stylesheet" href="./styles.css" />`.

El **Web Component** (`web-component.tsx`) **no importa** `styles.css`. Esto es intencionado:

| Escenario | Estilos aplicados |
|-----------|------------------|
| **Standalone** (`localhost:3000`) | `styles.css` compilado vía `<link>` en `index.html` |
| **Dentro de la shell** (`localhost:4200`) | No se inyectan estilos globales desde el MFE; la shell mantiene sus propios estilos como prioritarios |

Esta arquitectura asegura que:
- En standalone el MFE se ve idéntico a cuando está dentro de la shell.
- Cuando el MFE está embebido, los estilos de la shell son siempre los que gobiernan, evitando conflictos o duplicaciones.

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
   ├── Lee federation.config.js y extrae "shared" y "exposes"
   ├── Compila el código TSX expuesto (web-component.tsx)
   ├── Externaliza react, react-dom, react-dom/client y react/jsx-runtime
   ├── Compila las dependencias compartidas a chunks ESM (react-XXXX.js, etc.)
   ├── Genera remoteEntry.json con los metadatos correctos (shared + exposes)
   └── Genera importmap.json local conteniendo las rutas a los chunks compilados

2. fixFederationArtifacts (post-proceso)
   └── Anade las entradas faltantes en remoteEntry.json (ej: react/jsx-runtime)

3. writeIndexHtml
   ├── Procesa styles.css con PostCSS + Tailwind (tailwindcss, autoprefixer)
   │   y lo copia a dist/react-mfe/styles.css para el modo standalone
   ├── Incluye <link rel="stylesheet" href="./styles.css" /> en el HTML generado
   └── Genera index.html standalone para dev/testing con import map INLINE
       (los navegadores no soportan src= en <script type="importmap">)
```

### Estructura de `dist/react-mfe/`

```
remoteEntry.json             — Metadatos de federación (shared + exposes)
web-component-XXXX.js        — Bundle del Web Component (con imports puros: import we from "react-dom/client")
importmap.json               — Mapa de importación local para dev/testing
index.html                   — Standalone para testing en :3000
react.XXXX.js                — Chunks compartidos federados (con hash para cache busting)
react_dom.XXXX.js
react_dom_client.XXXX.js
react/jsx-runtime             — Resuelto via remoteEntry (no requiere archivo separado)
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
| `Relative import path "react" not starting...` | Falta o no se ha cargado el Import Map | Asegurar que `importmap.json` está cargado antes que el bundle |
| `TypeError: can't access property "startsWith"` | `remoteEntry.json` con formato incorrecto | La metadata del builder debe generarse de forma nativa |
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
│   │   ├── styles.css                  ← Estilos globales (Tailwind + overrides)
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