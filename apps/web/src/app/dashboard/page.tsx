'use client';

import { useState } from 'react';

export default function Dashboard() {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // TODO: Implement actual upload using documentsApi
      console.log('Uploading file:', file.name);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate upload
      alert(`File ${file.name} uploaded successfully!`);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Akihlee Dashboard</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600">Total Documents</p>
            <p className="text-3xl font-bold text-gray-900">0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600">Pending Review</p>
            <p className="text-3xl font-bold text-gray-900">0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-gray-600">This Month</p>
            <p className="text-3xl font-bold text-gray-900">KES 0</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white p-8 rounded-lg shadow mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Receipt or Invoice</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-flex flex-col items-center"
            >
              <svg
                className="w-12 h-12 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="text-gray-600">
                {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
              </span>
              <span className="text-sm text-gray-500 mt-2">PNG, JPG, PDF up to 10MB</span>
            </label>
          </div>
        </div>

        {/* Recent Documents */}
        <div className="bg-white p-8 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Recent Documents</h2>
          <p className="text-gray-500 text-center py-8">No documents yet. Upload your first receipt!</p>
        </div>
      </main>
    </div>
  );
}
