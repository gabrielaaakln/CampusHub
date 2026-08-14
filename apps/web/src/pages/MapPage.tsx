import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { BuildingDto, RoomClassDto, RoomDto } from '@campushub/shared';
import { CampusMap } from '../components/CampusMap.js';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { api } from '../lib/apiClient.js';

const TYPE_LABEL: Record<string, string> = {
  curs: 'sală de curs',
  seminar: 'sală de seminar',
  laborator: 'laborator',
  birou: 'birou',
  altele: 'altă destinație',
};

const DAY_LABEL: Record<string, string> = {
  luni: 'Luni',
  marti: 'Marți',
  miercuri: 'Miercuri',
  joi: 'Joi',
  vineri: 'Vineri',
  sambata: 'Sâmbătă',
  duminica: 'Duminică',
};

type RoomDetail = RoomDto & { classes: RoomClassDto[] };

function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const roomId = Number(params.get('sala')) || null;
  const [term, setTerm] = useState('');
  const query = useDebounced(term.trim(), 250);

  const buildings = useQuery({
    queryKey: ['buildings'],
    queryFn: () => api<{ data: BuildingDto[] }>('/buildings').then((r) => r.data),
  });

  const results = useQuery({
    queryKey: ['rooms', 'search', query],
    queryFn: () =>
      api<{ data: RoomDto[] }>(`/rooms/search?q=${encodeURIComponent(query)}&limit=8`).then(
        (r) => r.data,
      ),
    enabled: query.length > 0,
  });

  const room = useQuery({
    queryKey: ['rooms', roomId],
    queryFn: () => api<{ data: RoomDetail }>(`/rooms/${roomId}`).then((r) => r.data),
    enabled: roomId !== null,
  });

  const selectRoom = (id: number) => setParams({ sala: String(id) });

  const selectedBuildingId = room.data?.building.id ?? results.data?.[0]?.building.id ?? null;

  return (
    <>
      <PageHead
        title="Hartă"
        lead="Scrie numărul sălii sau ce se ține în ea. Merge și fără diacritice, și cu greșeli de scriere."
        eyebrow={buildings.data ? `${buildings.data.length} clădiri` : undefined}
      />

      <Panel bare>
        <p className="filters">
          <input
            className="search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="AC0-1, lab retele, amfiteatru..."
            aria-label="Caută o sală"
          />
        </p>

        {query.length > 0 ? (
          results.isPending ? (
            <Spinner small />
          ) : results.data && results.data.length > 0 ? (
            <ul className="results">
              {results.data.map((found) => (
                <li key={found.id}>
                  <button type="button" onClick={() => selectRoom(found.id)}>
                    <strong>{found.number}</strong>
                    <small>
                      {found.building.name} · {found.floor.label}
                      {found.aliases.length > 0 ? ` · ${found.aliases[0]}` : ''}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nicio sală care să semene cu „{query}”.</p>
          )
        ) : null}

        <CampusMap
          buildings={buildings.data ?? []}
          selectedBuildingId={selectedBuildingId}
          onSelect={(buildingId) => {
            const building = buildings.data?.find((b) => b.id === buildingId);
            if (building) setTerm(building.code ?? building.name);
          }}
        />
      </Panel>

      {room.data ? <RoomCard room={room.data} /> : null}
    </>
  );
}

function RoomCard({ room }: { room: RoomDetail }) {
  const lat = room.building.entranceLat ?? room.building.latitude;
  const lng = room.building.entranceLng ?? room.building.longitude;

  return (
    <>
      <Panel
        title={`Sala ${room.number}`}
        hint={TYPE_LABEL[room.roomType] ?? room.roomType}
        aside={<span className="badge">{room.floor.label}</span>}
      >
        <dl className="facts">
          <dt>Clădire</dt>
          <dd>
            {room.building.name}
            {room.building.address ? <small> · {room.building.address}</small> : null}
          </dd>
          {room.directions ? (
            <>
              <dt>Cum ajungi</dt>
              <dd>{room.directions}</dd>
            </>
          ) : null}
          {room.capacity ? (
            <>
              <dt>Locuri</dt>
              <dd>{room.capacity}</dd>
            </>
          ) : null}
          {room.aliases.length > 0 ? (
            <>
              <dt>Și ca</dt>
              <dd>{room.aliases.join(', ')}</dd>
            </>
          ) : null}
        </dl>

        {lat !== null && lng !== null ? (
          <p>
            <a
              className="button primary"
              href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Navighează până la intrare
            </a>
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Ce se ține aici"
        aside={<span className="badge">{room.classes.length} ore pe săptămână</span>}
      >
        {room.classes.length > 0 ? (
          <>
            <ul className="entries">
              {room.classes.slice(0, 12).map((held) => (
                <li key={held.id}>
                  <span className="hours">
                    {DAY_LABEL[held.day] ?? held.day} {held.startTime}
                  </span>
                  <span className="what">
                    <strong>{held.subject}</strong>
                    <small>
                      {held.classType} · grupa {held.group}
                    </small>
                  </span>
                  <span className="where">
                    <small>
                      {held.startTime} – {held.endTime}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            {room.classes.length > 12 ? (
              <p className="hint">și încă {room.classes.length - 12} ore în această săptămână.</p>
            ) : null}
          </>
        ) : (
          <p className="empty">Nicio oră din orar nu are loc în această sală.</p>
        )}
      </Panel>
    </>
  );
}
