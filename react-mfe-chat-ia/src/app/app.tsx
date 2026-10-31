// import { ChatIaComponent } from './ChatIaComponent';

export function App() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-extrabold text-gray-950 tracking-tight sm:text-4xl bg-gradient-to-r from-primary-700 to-indigo-700 bg-clip-text text-transparent">
          Chat IA
        </h1>
        <p className="mt-2 text-base text-gray-600 max-w-2xl">
          Renderizado en tiempo real de Mandelbrot con memoria compartida y benchmarks de rendimiento nativo.
        </p>
      </header>

      {/* <ChatIaComponent /> */}
    </div>
  );
}

export default App;
