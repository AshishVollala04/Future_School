/** OpenStreetMap map with the bus (blue) and, when saved, the child's stop (orange). */
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const dot = (color: string, size: number) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });

export const BusMap: React.FC<{ bus: { lat: number; lng: number }; stop?: { lat: number; lng: number }; height?: number }> = ({ bus, stop, height = 240 }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const busMarker = useRef<L.Marker | null>(null);
  const stopMarker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([bus.lat, bus.lng], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
      busMarker.current = null;
      stopMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!busMarker.current) busMarker.current = L.marker([bus.lat, bus.lng], { icon: dot('#1d4ed8', 22), title: 'Bus' }).addTo(m);
    else busMarker.current.setLatLng([bus.lat, bus.lng]);
    if (stop) {
      if (!stopMarker.current) stopMarker.current = L.marker([stop.lat, stop.lng], { icon: dot('#f97316', 16), title: 'Your stop' }).addTo(m);
      else stopMarker.current.setLatLng([stop.lat, stop.lng]);
      m.fitBounds(L.latLngBounds([bus.lat, bus.lng], [stop.lat, stop.lng]), { padding: [40, 40], maxZoom: 16 });
    } else {
      m.panTo([bus.lat, bus.lng]);
    }
  }, [bus.lat, bus.lng, stop?.lat, stop?.lng]);

  return <div ref={el} style={{ height }} className="w-full rounded-2xl overflow-hidden border border-slate-200 z-0" role="img" aria-label="Map showing the school bus" />;
};
