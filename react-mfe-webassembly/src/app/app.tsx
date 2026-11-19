import { WebAssemblyComponent } from './WebAssemblyComponent';

export function App() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-extrabold text-gray-950 tracking-tight sm:text-4xl bg-gradient-to-r from-primary-700 to-indigo-700 bg-clip-text text-transparent">
          WebAssembly & AssemblyScript
        </h1>
      </header>

      <WebAssemblyComponent />
    </div>
  );
}

export default App;
