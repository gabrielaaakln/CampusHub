import { useState } from 'react';
import type { CalendarItem, DeadlineType } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { ApiError } from '../lib/apiClient.js';
import { addDays, isoDay, mondayOf, useCalendar } from '../lib/useCalendar.js';
import { useCreateDeadline, useDeadlines, useDeleteDeadline } from '../lib/useDeadlines.js';
import { useSubjects } from '../lib/useCatalog.js';
import { useAppConfig } from '../lib/useAppConfig.js';
import { useSession } from '../lib/useSession.js';

const KIND_LABEL: Record<string, string> = {
  class: 'oră',
  deadline: 'termen',
  event: 'eveniment',
};

const PARITY_LABEL: Record<string, string> = { par: 'pară', impar: 'impară' };

const DAY_NAME = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
const DAY_NUM = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });
const TIME = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
const DUE = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const LEAD = 'Ore, termene și evenimente în aceeași săptămână.';

export function CalendarPage() {
  const { user } = useSession();
  const { features } = useAppConfig();
  const [offset, setOffset] = useState(0);

  const from = mondayOf(new Date());
  const start = addDays(from, offset * 7);
  const calendar = useCalendar(start, addDays(start, 6));

  if (!user) {
    return (
      <>
        <PageHead title="Calendar" lead={LEAD} />
        <Panel title="Ai nevoie de cont">
          <p className="content">Intră în cont ca să vezi săptămâna ta.</p>
        </Panel>
      </>
    );
  }
  if (calendar.isPending) {
    return (
      <>
        <PageHead title="Calendar" lead={LEAD} />
        <Panel>
          <Spinner small />
        </Panel>
      </>
    );
  }
  if (calendar.isError) {
    const message =
      calendar.error instanceof ApiError ? calendar.error.message : 'Eroare necunoscută';
    return (
      <>
        <PageHead title="Calendar" lead={LEAD} />
        <Panel title="Săptămâna nu s-a încărcat" hint={message} />
      </>
    );
  }

  const week = calendar.data.weeks[0];
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of calendar.data.items) {
    const day = item.startsAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }

  const today = isoDay(new Date());

  return (
    <>
      <PageHead
        title="Calendar"
        lead={LEAD}
        eyebrow={
          week
            ? `Săptămâna ${week.index} a semestrului · ${PARITY_LABEL[week.parity]}`
            : 'În afara semestrului curent'
        }
      />

      <div className="toolbar">
        <p className="filters">
          <button type="button" onClick={() => setOffset(offset - 1)}>
            ‹ Înapoi
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => setOffset(0)}
            disabled={offset === 0}
          >
            Săptămâna curentă
          </button>
          <button type="button" onClick={() => setOffset(offset + 1)}>
            Înainte ›
          </button>
          <span className="hint">
            {DAY_NUM.format(days[0]!)} – {DAY_NUM.format(days[6]!)}
          </span>
          {features.icsExport ? (
            <a className="button" href="/api/v1/me/calendar.ics">
              Descarcă .ics
            </a>
          ) : null}
        </p>
      </div>

      <section className="week" aria-label="Săptămâna">
        {days.map((day) => {
          const key = isoDay(day);
          const items = byDay.get(key) ?? [];
          return (
            <article key={key} className={key === today ? 'week-day today' : 'week-day'}>
              <header>
                <span className="label">{DAY_NAME.format(day)}</span>
                <strong>{DAY_NUM.format(day)}</strong>
              </header>
              {items.length === 0 ? (
                <p className="week-empty">—</p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className={`slot ${item.kind}`}>
                      <span className="slot-time">
                        {TIME.format(new Date(item.startsAt))}
                        {item.endsAt ? `–${TIME.format(new Date(item.endsAt))}` : ''}
                      </span>
                      <strong>{item.title}</strong>
                      <small>
                        {KIND_LABEL[item.kind] ?? item.kind}
                        {item.type ? ` · ${item.type}` : ''}
                        {item.room ? ` · ${item.room.number}` : ''}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </section>

      <Deadlines />
    </>
  );
}

const TYPE_LABEL: Record<DeadlineType, string> = {
  tema: 'temă',
  examen: 'examen',
  proiect: 'proiect',
  altele: 'altceva',
};

function Deadlines() {
  const { user } = useSession();
  const deadlines = useDeadlines();
  const remove = useDeleteDeadline();
  const [open, setOpen] = useState(false);

  const items = deadlines.data?.data ?? [];

  return (
    <Panel
      title="Termene"
      hint="Teme, examene și predări. Ce scrii aici vede toată grupa ta și intră în calendar."
      aside={
        user ? (
          <button type="button" onClick={() => setOpen(!open)}>
            {open ? 'Renunț' : 'Adaugă un termen'}
          </button>
        ) : null
      }
    >
      {open ? <NewDeadline onDone={() => setOpen(false)} /> : null}

      {deadlines.isPending ? (
        <Spinner small />
      ) : items.length === 0 ? (
        <p className="empty">Niciun termen anunțat. Primul care scrie unul ajută toată grupa.</p>
      ) : (
        <ul className="entries">
          {items.map((item) => (
            <li key={item.id}>
              <span className="hours">{DUE.format(new Date(item.dueAt))}</span>
              <span className="what">
                <strong>{item.title}</strong>
                <small>
                  {TYPE_LABEL[item.type]}
                  {item.subject ? ` · ${item.subject.name}` : ''}
                  {item.group ? ` · grupa ${item.group.name}` : ' · toată facultatea'}
                  {item.author ? ` · ${item.author.displayName}` : ''}
                </small>
                {item.description ? <small>{item.description}</small> : null}
              </span>
              <span className="where">
                {item.isMine || user?.role !== 'student' ? (
                  <button
                    type="button"
                    className="link"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                  >
                    Șterge
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NewDeadline({ onDone }: { onDone: () => void }) {
  const create = useCreateDeadline();
  const subjects = useSubjects();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DeadlineType>('tema');
  const [dueAt, setDueAt] = useState('');
  const [subjectId, setSubjectId] = useState(0);
  const [description, setDescription] = useState('');

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            title,
            type,
            // the input has no offset new Date reads it in the browser zone
            dueAt: new Date(dueAt).toISOString(),
            subjectId: subjectId || null,
            description: description || undefined,
          },
          { onSuccess: onDone },
        );
      }}
    >
      <label>
        Ce e de făcut
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} required />
      </label>
      <label>
        Tip
        <select value={type} onChange={(e) => setType(e.target.value as DeadlineType)}>
          {(Object.keys(TYPE_LABEL) as DeadlineType[]).map((value) => (
            <option key={value} value={value}>
              {TYPE_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Până când
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          required
        />
      </label>
      <label>
        Disciplina
        <select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
          <option value={0}>fără disciplină</option>
          {(subjects.data ?? []).map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.shortName ? `${subject.shortName} · ` : ''}
              {subject.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Detalii
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      {create.isError ? <p className="error">{create.error.message}</p> : null}
      <p className="filters">
        <button type="submit" className="primary" disabled={create.isPending}>
          Adaugă
        </button>
        <button type="button" onClick={onDone}>
          Renunț
        </button>
      </p>
    </form>
  );
}
