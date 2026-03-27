import { Routes, Route } from 'react-router-dom';
import VerifyInput from './pages/VerifyInput';
import VerifyReport from './pages/VerifyReport';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <a href="/" className="text-xl font-semibold text-gray-900">
          Verify
        </a>
        <span className="ml-2 text-sm text-gray-500">Arweave Data Verification</span>
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
