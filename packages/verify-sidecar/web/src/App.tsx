import { Routes, Route } from 'react-router-dom';
import VerifyInput from './pages/VerifyInput';
import VerifyReport from './pages/VerifyReport';

export default function App() {
  return (
    <div className="min-h-screen bg-ario-bg">
      <header className="border-b border-ario-divider px-6 py-4">
        <a href="/" className="text-xl font-bold text-ario-text-high">
          Verify
        </a>
        <span className="ml-2 text-sm text-ario-text-low">Arweave Data Verification</span>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Routes>
          <Route path="/" element={<VerifyInput />} />
          <Route path="/report/:id" element={<VerifyReport />} />
        </Routes>
      </main>
    </div>
  );
}
