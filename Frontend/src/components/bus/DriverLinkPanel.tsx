/**
 * Office (TRANSPORT): live status of a route's bus and its private driver link.
 * A link is shown once when made (only its hash is stored), so it is sent to the driver right away.
 */
import React, { useState } from 'react';
import { Copy, Link2, MessageCircle, XCircle } from 'lucide-react';
import { busService, OfficeBus, ageText } from '../../services/busService';

export const DriverLinkPanel: React.FC<{ routeId: string; status?: OfficeBus; onChange: () => void }> = ({ routeId, status, onChange }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!busService.available) return <p className="text-xs text-slate-500">Live tracking works with the FutureSchool server.</p>;

  const make = async () => {
    if (status?.hasDriverLink && !window.confirm('Make a new driver link? The old link will stop working.')) return;
    setError(null);
    const r = await busService.createLink(routeId);
    if (r.ok) setUrl(`${window.location.origin}/drive/${r.data.token}`);
    else setError(r.error);
    onChange();
  };

  const cancel = async () => {
    if (!window.confirm('Cancel the driver link? The driver will not be able to share the bus location.')) return;
    const r = await busService.revokeLink(routeId);
    if (!r.ok) setError(r.error);
    setUrl(null);
    onChange();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  };

  const trip = status?.trip;
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
      <p className="text-sm">
        {trip ? (
          <span className={trip.stale ? 'text-amber-800 font-semibold' : 'text-emerald-800 font-semibold'}>
            {trip.direction === 'DROP' ? 'On the drop trip' : 'On the pick-up trip'}
            {trip.updatedAt ? ` · position ${ageText(trip.updatedAt)}` : ' · waiting for the first position'}
            {trip.stale && ' · signal lost'}
          </span>
        ) : (
          <span className="text-slate-600">Not on a trip</span>
        )}
      </p>
      {url && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">Send this link to the driver now. For safety it is shown only once.</p>
          <p className="text-xs font-mono break-all bg-white border border-slate-200 rounded-lg p-2">{url}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} className="min-h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-1.5">
              <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`FutureSchool bus tracking link. Open it before each trip and tap Start: ${url}`)}`}
              target="_blank"
              rel="noreferrer"
              className="min-h-10 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4" /> Send on WhatsApp
            </a>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={make} className="min-h-10 px-3 rounded-lg bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-1.5">
          <Link2 className="w-4 h-4" /> {status?.hasDriverLink ? 'New driver link' : 'Make driver link'}
        </button>
        {status?.hasDriverLink && (
          <button onClick={cancel} className="min-h-10 px-3 rounded-lg border border-rose-300 text-rose-800 text-sm font-semibold inline-flex items-center gap-1.5">
            <XCircle className="w-4 h-4" /> Cancel link
          </button>
        )}
      </div>
    </div>
  );
};
