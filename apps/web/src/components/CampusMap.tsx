import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BuildingDto } from '@campushub/shared';

// the subdomain form is what the content security policy allows
const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// a square marker drawn in css so it follows the theme without passing colours through js
const PIN = L.divIcon({ className: 'pin', html: '<span></span>', iconSize: [14, 14] });

type Props = {
  buildings: BuildingDto[];
  selectedBuildingId: number | null;
  onSelect: (buildingId: number) => void;
};

export function CampusMap({ buildings, selectedBuildingId, onSelect }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef(new Map<number, L.Marker>());
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const node = holder.current;
    if (!node || map.current) return;

    // the faculty at Mangeron 27 only until the buildings arrive and fitBounds takes over
    const created = L.map(node, { scrollWheelZoom: false }).setView([47.154, 27.5937], 15);
    L.tileLayer(TILES, {
      subdomains: ['a', 'b', 'c'],
      maxZoom: 19,
      attribution: '&copy; contribuitorii OpenStreetMap',
    }).addTo(created);
    map.current = created;

    return () => {
      created.remove();
      map.current = null;
      pins.current.clear();
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    for (const marker of pins.current.values()) marker.remove();
    pins.current.clear();

    const placed = buildings.filter((b) => b.latitude !== null && b.longitude !== null);
    for (const building of placed) {
      const marker = L.marker([building.latitude!, building.longitude!], { icon: PIN })
        .bindTooltip(`${building.name} · ${building.roomCount} săli`)
        .on('click', () => select.current(building.id))
        .addTo(instance);
      pins.current.set(building.id, marker);
    }

    if (placed.length > 0) {
      instance.fitBounds(
        L.latLngBounds(placed.map((b) => [b.latitude!, b.longitude!] as L.LatLngTuple)),
        { padding: [32, 32] },
      );
    }
  }, [buildings]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const quiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const [id, marker] of pins.current) {
      const active = id === selectedBuildingId;
      marker.getElement()?.classList.toggle('on', active);
      if (active) {
        instance.flyTo(marker.getLatLng(), Math.max(instance.getZoom(), 17), {
          duration: quiet ? 0 : 0.6,
        });
        marker.openTooltip();
      }
    }
  }, [selectedBuildingId, buildings]);

  return <div className="map-holder" ref={holder} />;
}
