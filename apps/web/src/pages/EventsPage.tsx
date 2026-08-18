import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventDto } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useAttend, useCreateEvent, useEvents } from '../lib/useEvents.js';
import { useSession } from '../lib/useSession.js';

const DAY = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const HOUR = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

function when(event: EventDto): string {
  const starts = new Date(event.startsAt);
  const day = `${DAY.format(starts)}, ${HOUR.format(starts)}`;
  if (!event.endsAt) return day;
  const ends = new Date(event.endsAt);
  const sameDay = starts.toDateString() === ends.toDateString();
  return sameDay ? `${day} – ${HOUR.format(ends)}` : `${day} – ${DAY.format(ends)}`;
}

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();

  const mine = params.get('ale-mele') === 'da';
  const page = Number(params.get('pagina')) || 1;

  const events = useEvents({ mine, page });
  const attend = useAttend();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const meta = events.data?.meta;
  const canManage = user?.role === 'moderator' || user?.role === 'admin';

  return (
    <>
      <PageHead
        title="Evenimente"
        lead="Ce se întâmplă în facultate. Evenimentele la care te înscrii apar și în calendarul tău."
        eyebrow={meta ? `${meta.total} evenimente care urmează` : undefined}
      />

      <Panel bare>
        {user ? (
          <p className="filters">
            <button
              type="button"
              className="chip"
              disabled={!mine}
              onClick={() => setParam('ale-mele', null)}
            >
              Toate
            </button>
            <button
              type="button"
              className="chip"
              disabled={mine}
              onClick={() => setParam('ale-mele', 'da')}
            >
              Unde m-am înscris
            </button>
          </p>
        ) : (
          <p className="hint">
            <Link to="/intra">Intră în cont</Link> ca să te înscrii la un eveniment.
          </p>
        )}
        {canManage ? <NewEvent /> : null}
      </Panel>

      <Panel title="Care urmează" aside={meta ? <span className="badge">{meta.total}</span> : null}>
        {events.isPending ? (
          <Spinner small />
        ) : events.data && events.data.data.length > 0 ? (
          <ul className="posts">
            {events.data.data.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  {event.description ? <p className="content">{event.description}</p> : null}
                  <dl className="meta">
                    <div>
                      <dt>Când</dt>
                      <dd>{when(event)}</dd>
                    </div>
                    <div>
                      <dt>Unde</dt>
                      <dd>
                        {event.room ? (
                          <>
                            Sala {event.room.number}
                            <br />
                            <small>{event.room.building}</small>
                          </>
                        ) : (
                          (event.location ?? 'de anunțat')
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Înscriși</dt>
                      <dd>{event.attendeeCount}</dd>
                    </div>
                  </dl>
                  {event.room || event.externalUrl ? (
                    <p className="filters">
                      {event.room ? (
                        <Link className="link" to={`/harta?sala=${event.room.id}`}>
                          Vezi sala pe hartă
                        </Link>
                      ) : null}
                      {event.externalUrl ? (
                        <a
                          className="link"
                          href={event.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Detalii ↗
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                {user ? (
                  <div className="actions">
                    <button
                      type="button"
                      disabled={attend.isPending}
                      onClick={() =>
                        attend.mutate({ id: event.id, attending: !event.isAttending })
                      }
                    >
                      {event.isAttending ? 'Renunț' : 'Mă înscriu'}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            {mine ? 'Nu te-ai înscris încă la niciun eveniment.' : 'Niciun eveniment anunțat.'}
          </p>
        )}

        {meta && (meta.page > 1 || meta.has_next) ? (
          <p className="pager">
            <button
              type="button"
              disabled={meta.page === 1}
              onClick={() => setParam('pagina', String(meta.page - 1))}
            >
              ‹ Înapoi
            </button>
            <span className="hint">pagina {meta.page}</span>
            <button
              type="button"
              disabled={!meta.has_next}
              onClick={() => setParam('pagina', String(meta.page + 1))}
            >
              Înainte ›
            </button>
          </p>
        ) : null}
      </Panel>
    </>
  );
}

function NewEvent() {
  const create = useCreateEvent();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  if (!open) {
    return (
      <p>
        <button type="button" onClick={() => setOpen(true)}>
          Anunță un eveniment
        </button>
      </p>
    );
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            title,
            description: description || undefined,
            location: location || undefined,
            // the input has no offset new Date reads it in the browser zone
            startsAt: new Date(startsAt).toISOString(),
            endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          },
          {
            onSuccess: () => {
              setTitle('');
              setDescription('');
              setLocation('');
              setStartsAt('');
              setEndsAt('');
              setOpen(false);
            },
          },
        );
      }}
    >
      <label>
        Titlu
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={5} required />
      </label>
      <label>
        Descriere
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>
      <label>
        Loc, dacă nu e o sală din orar
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Aula, Corp A"
        />
      </label>
      <label>
        Începe
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
      </label>
      <label>
        Se termină, opțional
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </label>
      {create.isError ? <p className="error">{create.error.message}</p> : null}
      <p className="filters">
        <button type="submit" className="primary" disabled={create.isPending}>
          Publică
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Renunță
        </button>
      </p>
    </form>
  );
}
