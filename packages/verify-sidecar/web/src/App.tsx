import { Routes, Route } from 'react-router-dom';
import VerifyInput from './pages/VerifyInput';
import VerifyReport from './pages/VerifyReport';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-ario-lavender">
      <header className="sticky top-0 z-50 border-b border-ario-border bg-white/85 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <a href="/" className="flex items-center gap-2.5">
            <img src="https://ar.io/brand/ario-full-black.svg" alt="ar.io" className="h-7" />
            <span className="rounded-full bg-ario-primary/10 px-2.5 py-0.5 text-xs font-semibold text-ario-primary">
              Verify
            </span>
          </a>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<VerifyInput />} />
          <Route path="/report/:id" element={<VerifyReport />} />
        </Routes>
      </main>
    </div>
  );
}
