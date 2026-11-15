/**
 * FutureSchool - Page Loading Spinner
 * Shown as Suspense fallback during lazy chunk loading
 */
import React from 'react';

export function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-400 text-sm font-medium">Loading FutureSchool…</p>
      </div>
    </div>
  );
}
