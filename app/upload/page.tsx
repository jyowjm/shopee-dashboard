'use client';

import { useRef, useState } from 'react';

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<{ orders: number; items: number; files: number } | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  function handleFileChange() {
    setSelectedFiles(inputRef.current?.files ?? null);
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
  }

  async function handleUpload() {
    const files = inputRef.current?.files;
    if (!files?.length) return;

    setStatus('uploading');
    setResult(null);
    setErrorMsg('');

    const form = new FormData();
    for (const file of Array.from(files)) {
      form.append('file', file);
    }

    try {
      const res = await fetch('/api/upload/orders', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setResult({ orders: data.orders, items: data.items, files: data.files });
      setStatus('success');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload Order Reports</h1>
        <p className="text-gray-500 mb-6 text-sm leading-relaxed">
          Download your order reports from Shopee Seller Centre → Orders → Export, then upload them
          here. You can select multiple reports at once.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Order reports (.xlsx)
          </label>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
          />
          {selectedFiles && selectedFiles.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={status === 'uploading' || !selectedFiles?.length}
          className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {status === 'uploading' ? 'Uploading...' : 'Upload Reports'}
        </button>

        {status === 'success' && result && (
          <p className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {result.files} report{result.files > 1 ? 's' : ''} uploaded — {result.orders} orders and{' '}
            {result.items} items imported successfully.
          </p>
        )}

        {status === 'error' && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {errorMsg}
          </p>
        )}

        <p className="mt-6 text-xs text-gray-400 leading-relaxed">
          Uploading enriches customer data (tracking, delivery dates, return status, item details).
          Buyer IDs are linked on the next daily sync.
        </p>
      </div>
    </div>
  );
}
