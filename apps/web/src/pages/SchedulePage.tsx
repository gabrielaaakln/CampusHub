import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduleChangeDto,
  ScheduleImportDto,
  ScheduleRunDto,
  ScheduleWeekDto,
} from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { api, ApiError } from '../lib/apiClient.js';
import { useSession } from '../lib/useSession.js';

const DAY_LABEL: Record<string, string> = {
  luni: 'Luni',
  marti: 'Marți',
  miercuri: 'Miercuri',
  joi: 'Joi',
  vineri: 'Vineri',
  sambata: 'Sâmbătă',
  duminica: 'Duminică',
};

const TYPE_LABEL: Record<string, string> = {
  curs: 'curs',
  seminar: 'seminar',
  laborator: 'laborator',
  proiect: 'proiect',
};

const KIND_LABEL: Record<string, string> = {
  added: 'adăugat',
  changed: 'modificat',
  removed: 'scos',
};

const LEAD = 'Săptămâna grupei tale, așa cum a fost importată din orarul oficial.';

export function SchedulePage() {
  const { user } = useSession();
  const admin = user?.role === 'admin' ? <ImportPanel /> : null;

  const week = useQuery({
    queryKey: ['schedule', user?.groupId, user?.subgroup],
    queryFn: () => api<{ data: ScheduleWeekDto }>('/schedule').then((r) => r.data),
    enabled: Boolean(user?.groupId),
  });

  const status = useQuery({
    queryKey: ['schedule', 'status', user?.groupId],
    queryFn: () =>
      api<{ data: { lastRun: ScheduleRunDto | null; changes: ScheduleChangeDto[] } }>(
        '/schedule/status',
      ).then((r) => r.data),
    enabled: Boolean(user?.groupId),
  });

  if (!user) {
    return (
      <>
        <PageHead title="Orar" lead={LEAD} />
        <Panel title="Ai nevoie de cont">
          <p className="content">Intră în cont ca să vezi orarul grupei tale.</p>
        </Panel>
      </>
    );
  }
  if (!user.groupId) {
    return (
      <>
        <PageHead title="Orar" lead={LEAD} />
        <Panel title="Alege-ți grupa">
          <p className="content">Alege-ți grupa din profil ca să știm ce orar să îți arătăm.</p>
        </Panel>
        {admin}
      </>
    );
  }
  if (week.isPending) {
    return (
      <>
        <PageHead title="Orar" lead={LEAD} />
        <Panel>
          <Spinner small />
        </Panel>
      </>
    );
  }
  if (week.isError) {
    const message = week.error instanceof ApiError ? week.error.message : 'Eroare necunoscută';
    return (
      <>
        <PageHead title="Orar" lead={LEAD} />
        <Panel title="Orarul nu s-a încărcat" hint={message} />
        {admin}
      </>
    );
  }

  const { group, subgroup, term, days } = week.data;

  return (
    <>
      <PageHead
        title="Orar"
        lead={LEAD}
        eyebrow={`Grupa ${group.name}${subgroup ? ` · semigrupa ${subgroup}` : ''} · ${term.academicYear}, semestrul ${term.semester}`}
      />

      <Panel
        title="Săptămâna"
        aside={<span className="badge">{days.length} zile cu ore</span>}
      >
        {days.length === 0 ? (
          <p className="empty">Nu există ore active pentru grupa ta în acest semestru.</p>
        ) : (
          days.map((day) => (
            <section key={day.day} className="day">
              <h3>{DAY_LABEL[day.day] ?? day.day}</h3>
              <ul className="entries">
                {day.entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="hours">
                      {entry.startTime} – {entry.endTime}
                    </span>
                    <span className="what">
                      <strong>{entry.subject?.name ?? entry.subjectRaw}</strong>
                      <small>
                        {TYPE_LABEL[entry.classType] ?? entry.classType}
                        {entry.parity !== 'ambele' ? `, săptămâna ${entry.parity}ă` : ''}
                        {entry.subgroup > 0 ? `, semigrupa ${entry.subgroup}` : ''}
                        {entry.professor ? ` · ${entry.professor}` : ''}
                      </small>
                    </span>
                    <span className="where">
                      {entry.room ? (
                        <>
                          <strong>{entry.room.number}</strong>
                          <small>{entry.room.directions ?? entry.room.building}</small>
                        </>
                      ) : (
                        <small>{entry.roomRaw ?? 'sală necunoscută'}</small>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Panel>

      {status.data?.lastRun ? (
        <Panel
          title="Ultimul import"
          hint={`${status.data.lastRun.adapter ?? 'necunoscut'} · ${new Date(
            status.data.lastRun.startedAt,
          ).toLocaleString('ro-RO')}`}
          aside={<span className="badge">{status.data.lastRun.status ?? '—'}</span>}
        >
          <dl className="facts">
            <dt>Citite</dt>
            <dd>{status.data.lastRun.found}</dd>
            <dt>Adăugate</dt>
            <dd>{status.data.lastRun.added}</dd>
            <dt>Modificate</dt>
            <dd>{status.data.lastRun.changed}</dd>
            <dt>Scoase</dt>
            <dd>{status.data.lastRun.removed}</dd>
          </dl>
          {status.data.changes.length > 0 ? (
            <ul className="changes">
              {status.data.changes.slice(0, 8).map((change) => (
                <li key={change.id}>
                  <span className={`badge ${change.kind}`}>{KIND_LABEL[change.kind]}</span>{' '}
                  {describe(change)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nicio schimbare pentru grupa ta la ultimele rulări.</p>
          )}
        </Panel>
      ) : null}

      {admin}
    </>
  );
}

const STATUS_LABEL: Record<string, string> = {
  success: 'reușit',
  partial: 'parțial',
  failed: 'eșuat',
};

/** the n0 path from the plan a file goes in the same pipeline a scraper would use */
function ImportPanel() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: (chosen: File) => {
      const body = new FormData();
      body.append('file', chosen);
      return api<{ data: ScheduleImportDto }>('/schedule/import', { method: 'POST', body }).then(
        (r) => r.data,
      );
    },
    onSuccess: () => {
      setFile(null);
      if (input.current) input.current.value = '';
      void qc.invalidateQueries({ queryKey: ['schedule'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const report = upload.data;

  return (
    <Panel
      title="Import de orar"
      hint="Doar pentru administratori. Fișierul trece prin același pipeline ca un scraper: normalizare, diff, notificări."
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) upload.mutate(file);
        }}
      >
        <span className="label">Fișierul orarului, .xlsx sau .csv, maximum 2 MB</span>
        <span className="file-field">
          <label className="button">
            Alege fișierul
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <span className="hint">{file ? file.name : 'Niciun fișier ales'}</span>
        </span>
        {upload.isError ? (
          <p className="error">
            {upload.error instanceof ApiError ? upload.error.message : 'Importul nu a pornit'}
          </p>
        ) : null}
        <p className="filters">
          <button type="submit" className="primary" disabled={!file || upload.isPending}>
            {upload.isPending ? 'Se importă…' : 'Importă'}
          </button>
        </p>
      </form>

      {upload.isPending ? <Spinner small /> : null}

      {report ? (
        <>
          <h3>Rularea {report.runId}</h3>
          <dl className="facts">
            <dt>Rezultat</dt>
            <dd>{STATUS_LABEL[report.status] ?? report.status}</dd>
            <dt>Citite</dt>
            <dd>{report.found}</dd>
            <dt>Adăugate</dt>
            <dd>{report.added}</dd>
            <dt>Modificate</dt>
            <dd>{report.changed}</dd>
            <dt>Scoase</dt>
            <dd>{report.removed}</dd>
          </dl>
          {report.unresolvedSubjects.length > 0 ? (
            <p className="hint">
              Discipline nerecunoscute, păstrate ca text: {report.unresolvedSubjects.join(', ')}
            </p>
          ) : null}
          {report.errors.length > 0 ? (
            <ul className="changes">
              {report.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function describe(change: ScheduleChangeDto): string {
  const after = change.after as { subject?: string; room?: string | null } | null;
  const before = change.before as { subject?: string; room?: string | null } | null;
  const subject = after?.subject ?? before?.subject ?? 'oră';
  if (change.kind === 'changed' && before && after && before.room !== after.room) {
    return `${subject}: sala ${before.room ?? '-'} → ${after.room ?? '-'}`;
  }
  return subject;
}
