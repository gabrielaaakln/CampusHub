import { useState } from 'react';
import { Link } from 'react-router';
import type { ReportStatus } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useReports, useResolveReport } from '../lib/useModeration.js';
import { useSession } from '../lib/useSession.js';

const TARGET_LABEL: Record<string, string> = {
  post: 'postare',
  comment: 'comentariu',
  listing: 'anunț',
  user: 'cont',
};

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'În așteptare',
  resolved: 'Rezolvate',
  dismissed: 'Respinse',
};

const WHEN = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export function ModerationPage() {
  const { user } = useSession();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [page, setPage] = useState(1);

  const reports = useReports(status, page);
  const resolve = useResolveReport();

  if (!user || user.role === 'student') {
    return (
      <>
        <PageHead title="Moderare" lead="Zona asta e pentru moderatori." />
        <Panel title="Acces închis">
          <p className="filters">
            <Link className="button" to="/">
              ‹ Înapoi la Acum
            </Link>
          </p>
        </Panel>
      </>
    );
  }

  const meta = reports.data?.meta;
  const rows = reports.data?.data ?? [];

  return (
    <>
      <PageHead
        title="Moderare"
        lead="Rapoartele trimise de studenți. Ștergerea e logică: firul discuției rămâne întreg, iar autorul primește o notificare."
        eyebrow={meta ? `${meta.counts.open} în așteptare` : undefined}
      />

      <Panel bare>
        <p className="filters">
          {(['open', 'resolved', 'dismissed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              disabled={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {STATUS_LABEL[value]}
              {meta ? ` (${meta.counts[value]})` : ''}
            </button>
          ))}
        </p>
      </Panel>

      <Panel
        title={STATUS_LABEL[status]}
        aside={meta ? <span className="badge">{meta.total} rapoarte</span> : null}
      >
        {reports.isPending ? (
          <Spinner small />
        ) : rows.length > 0 ? (
          <ul className="posts">
            {rows.map((report) => (
              <li key={report.id}>
                <div>
                  <span className="label hint">
                    {TARGET_LABEL[report.targetType] ?? report.targetType}
                    {report.target?.isDeleted ? ' · deja șters' : ''}
                  </span>
                  <strong>{report.target?.title ?? 'Conținut care nu mai există'}</strong>
                  {report.target?.excerpt ? (
                    <p className="quote">„{report.target.excerpt}”</p>
                  ) : null}

                  <dl className="meta">
                    <div>
                      <dt>Motivul raportării</dt>
                      <dd>{report.reason ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Raportat de</dt>
                      <dd>{report.reporter?.displayName ?? 'Utilizator șters'}</dd>
                    </div>
                    <div>
                      <dt>Când</dt>
                      <dd>{WHEN.format(new Date(report.createdAt))}</dd>
                    </div>
                    {report.status === 'open' ? null : (
                      <div>
                        <dt>{STATUS_LABEL[report.status]}</dt>
                        <dd>{report.handledBy?.displayName ?? 'un moderator'}</dd>
                      </div>
                    )}
                  </dl>

                  {report.target?.link ? (
                    <p className="filters">
                      <Link className="link" to={report.target.link}>
                        Deschide conținutul
                      </Link>
                    </p>
                  ) : null}
                </div>
                {report.status === 'open' ? (
                  <div className="actions">
                    {report.targetType !== 'user' && report.target && !report.target.isDeleted ? (
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({
                            id: report.id,
                            status: 'resolved',
                            deleteTarget: true,
                          })
                        }
                      >
                        Șterge conținutul
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() =>
                        resolve.mutate({ id: report.id, status: 'resolved', deleteTarget: false })
                      }
                    >
                      Rezolvat, fără ștergere
                    </button>
                    <button
                      type="button"
                      disabled={resolve.isPending}
                      onClick={() =>
                        resolve.mutate({ id: report.id, status: 'dismissed', deleteTarget: false })
                      }
                    >
                      Respinge
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nimic aici. Coada e goală.</p>
        )}

        {resolve.isError ? <p className="error">{resolve.error.message}</p> : null}

        {meta && (meta.page > 1 || meta.has_next) ? (
          <p className="pager">
            <button type="button" disabled={meta.page === 1} onClick={() => setPage(page - 1)}>
              ‹ Înapoi
            </button>
            <span className="hint">pagina {meta.page}</span>
            <button type="button" disabled={!meta.has_next} onClick={() => setPage(page + 1)}>
              Înainte ›
            </button>
          </p>
        ) : null}
      </Panel>

      <Panel title="Ce se șterge" hint="Regula după care se rezolvă coada, aceeași pentru toți.">
        <ul className="posts">
          <li>
            <div>
              <strong>Lucrări, proiecte sau teme la comandă</strong>
              <small>
                Din anunțuri și din forum, oferite sau cerute. Tehnoredactarea unui text scris de
                autor rămâne permisă.
              </small>
            </div>
          </li>
          <li>
            <div>
              <strong>Bunuri restricționate</strong>
              <small>Alcool, tutun, substanțe, medicamente, arme, materiale copiate ilegal.</small>
            </div>
          </li>
          <li>
            <div>
              <strong>Date personale ale altcuiva</strong>
              <small>Adrese, numere de telefon, note sau situații școlare publicate fără acord.</small>
            </div>
          </li>
          <li>
            <div>
              <strong>Atacuri la persoană, hărțuire, conținut ilegal</strong>
              <small>
                Un dezacord aprins nu e motiv de ștergere; „Respinge" e un răspuns la fel de bun ca
                „Șterge".
              </small>
            </div>
          </li>
        </ul>
        <p className="hint">
          Ștergerea e logică și trimite o notificare autorului. Un cont nu se șterge din panoul
          ăsta.
        </p>
      </Panel>
    </>
  );
}
