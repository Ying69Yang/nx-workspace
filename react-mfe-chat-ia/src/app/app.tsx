import { ChatIaComponent } from './ChatIaComponent';

export function App() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-6 text-center sm:text-left">
        <h1 className="text-3xl font-extrabold text-gray-950 tracking-tight sm:text-4xl bg-gradient-to-r from-indigo-700 to-purple-700 bg-clip-text text-transparent">
          Chat IA Multi-Motor
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Alterna dinámicamente entre modelos locales en el navegador (WebGPU / WebLLM) y APIs avanzadas en la nube.
        </p>
      </header>

      <ChatIaComponent />
    </div>
  );
}

export default App;
