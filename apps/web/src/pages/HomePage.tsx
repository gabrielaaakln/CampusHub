import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { CalendarItem } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { addDays, useCalendar } from '../lib/useCalendar.js';
import { useAppConfig } from '../lib/useAppConfig.js';
import { useNotifications } from '../lib/useNotifications.js';
import { useSession } from '../lib/useSession.js';

const TIME = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
const WHEN = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const KIND_LABEL: Record<string, string> = {
  class: 'oră',
  deadline: 'termen',
  event: 'eveniment',
};

const LEAD = 'Privire de ansamblu asupra activităților curente și următoarelor tale cursuri.';

/** the page says what is happening now so it has to notice time passing */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function minutesUntil(iso: string, now: Date): number {
  return Math.round((Date.parse(iso) - now.getTime()) / 60_000);
}

function whenLabel(item: CalendarItem, now: Date): string {
  const minutes = minutesUntil(item.startsAt, now);
  if (minutes < 0) return 'a început deja';
  if (minutes === 0) return 'chiar acum';
  if (minutes < 60) return `în ${minutes} min`;

  const sameDay = new Date(item.startsAt).toDateString() === now.toDateString();
  if (sameDay) return `azi la ${TIME.format(new Date(item.startsAt))}`;
  return `${DAY.format(new Date(item.startsAt))}, ${TIME.format(new Date(item.startsAt))}`;
}

export function HomePage() {
  const { faculty } = useAppConfig();
  const { user } = useSession();
  const now = useNow(60_000);

  const today = new Date();
  const calendar = useCalendar(today, addDays(today, 7), 5 * 60_000);

  if (!user) {
    return (
      <>
        <PageHead title="Acum" lead={LEAD} />
        <Panel title="Orarul tău, într-un singur ecran" hint={faculty?.name}>
          <p className="content">
            Intră în cont ca să vezi ora curentă a grupei tale, sala în care se ține și ce urmează
            astăzi.
          </p>
          <p className="filters">
            <Link className="button primary" to="/intra">
              Intră în cont
            </Link>
            <Link className="button" to="/harta">
              Caută o sală
            </Link>
          </p>
        </Panel>
      </>
    );
  }

  if (!user.groupId) {
    return (
      <>
        <PageHead title="Acum" lead={LEAD} />
        <Panel title="Alege-ți grupa">
          <p className="content">
            Ca să știm ce orar să îți arătăm, alege-ți grupa și semigrupa din profil. Durează un
            minut și se face o singură dată.
          </p>
          <p className="filters">
            <Link className="button primary" to="/profil">
              Mergi la profil
            </Link>
          </p>
        </Panel>
      </>
    );
  }

  const items = calendar.data?.items ?? [];
  const current = items.find(
    (i) =>
      Date.parse(i.startsAt) <= now.getTime() &&
      i.endsAt !== null &&
      Date.parse(i.endsAt) > now.getTime(),
  );
  const upcoming = items.filter((i) => Date.parse(i.startsAt) > now.getTime());
  const next = upcoming[0];
  const rest = upcoming.filter((i) => new Date(i.startsAt).toDateString() === now.toDateString());
  const highlight = current ?? next;

  return (
    <>
      <PageHead
        title="Acum"
        lead={LEAD}
        eyebrow={
          user.groupName
            ? `Grupa ${user.groupName}${user.subgroup ? ` · semigrupa ${user.subgroup}` : ''}`
            : undefined
        }
      />

      <div className="bento">
        <Panel
          title={current ? 'În desfășurare' : 'Următorul curs'}
          // filled not inverted a full black block for two hours a day reads as an error
          filled={Boolean(current)}
          aside={
            highlight ? <span className="badge solid">{whenLabel(highlight, now)}</span> : null
          }
        >
          {calendar.isPending ? (
            <Spinner small />
          ) : highlight ? (
            <Highlight item={highlight} />
          ) : (
            <p className="empty">Nimic în următoarele șapte zile.</p>
          )}
        </Panel>

        <Panel title="Ziua ta" filled>
          <Today items={items} now={now} />
        </Panel>

        <Panel title="Restul zilei">
          {rest.length > 0 ? (
            <ul className="entries">
              {rest.map((item) => (
                <li key={item.id}>
                  <span className="hours">
                    {TIME.format(new Date(item.startsAt))}
                    {item.endsAt ? ` – ${TIME.format(new Date(item.endsAt))}` : ''}
                  </span>
                  <span className="what">
                    <strong>{item.title}</strong>
                    <small>
                      {KIND_LABEL[item.kind] ?? item.kind}
                      {item.type ? ` · ${item.type}` : ''}
                      {item.professor ? ` · ${item.professor}` : ''}
                    </small>
                  </span>
                  <span className="where">
                    {item.room ? (
                      <>
                        <strong>{item.room.number}</strong>
                        <small>{item.room.building}</small>
                      </>
                    ) : (
                      <small>{item.location ?? '—'}</small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nu mai ai nimic astăzi.</p>
          )}
        </Panel>
      </div>

      <Recent />
    </>
  );
}

function Highlight({ item }: { item: CalendarItem }) {
  const ends = item.endsAt ? ` – ${TIME.format(new Date(item.endsAt))}` : '';

  return (
    <>
      <div className="readout">
        {/* curs seminar or laborator changes where you go and what you carry so it says which */}
        <span className="label">
          {KIND_LABEL[item.kind] ?? item.kind}
          {item.type ? ` · ${item.type}` : ''}
        </span>
        <strong>{item.title}</strong>
      </div>
      <dl className="facts">
        <dt>Ora</dt>
        <dd>
          {TIME.format(new Date(item.startsAt))}
          {ends}
        </dd>
        <dt>Sala</dt>
        <dd>
          {item.room ? (
            <>
              {item.room.number} <small>· {item.room.building}</small>
            </>
          ) : (
            (item.location ?? '—')
          )}
        </dd>
        {item.professor ? (
          <>
            <dt>Profesor</dt>
            <dd>{item.professor}</dd>
          </>
        ) : null}
      </dl>
      {item.room?.id ? (
        <p>
          <Link className="button primary" to={`/harta?sala=${item.room.id}`}>
            Arată sala pe hartă
          </Link>
        </p>
      ) : null}
    </>
  );
}

/** the same seven day calendar answers this so nothing extra is fetched */
function Today({ items, now }: { items: CalendarItem[]; now: Date }) {
  const today = items.filter(
    (i) => i.kind === 'class' && new Date(i.startsAt).toDateString() === now.toDateString(),
  );

  if (today.length === 0) {
    return <p className="empty">Nicio oră astăzi.</p>;
  }

  const first = Math.min(...today.map((i) => Date.parse(i.startsAt)));
  const last = Math.max(...today.map((i) => Date.parse(i.endsAt ?? i.startsAt)));
  const done = Math.min(100, Math.max(0, ((now.getTime() - first) / (last - first)) * 100));

  return (
    <>
      <div className="readout">
        <span className="label">Ore azi</span>
        <strong>{today.length}</strong>
      </div>
      <dl className="facts">
        <dt>Prima</dt>
        <dd>{TIME.format(new Date(first))}</dd>
        <dt>Ultima</dt>
        <dd>{TIME.format(new Date(last))}</dd>
      </dl>
      <div>
        <p className="label hint">Cât a trecut din zi</p>
        <div className="meter" role="presentation">
          <span style={{ width: `${done}%` }} />
        </div>
        <p className="hint" style={{ marginTop: 6, textAlign: 'right' }}>
          {Math.round(done)}%
        </p>
      </div>
    </>
  );
}

function Recent() {
  const list = useNotifications(1);
  const items = (list.data?.data ?? []).slice(0, 4);
  if (items.length === 0) return null;

  return (
    <Panel title="Anunțuri recente" hint="Ce s-a schimbat de când n-ai fost pe aici.">
      <ul className="entries">
        {items.map((item) => (
          <li key={item.id}>
            <span className="hours">{WHEN.format(new Date(item.createdAt))}</span>
            <span className="what">
              <strong>{item.title}</strong>
              {item.body ? <small>{item.body}</small> : null}
            </span>
            <span className="where">
              {item.link ? (
                <Link className="button" to={item.link}>
                  Deschide
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
