import { Link } from 'react-router';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useMarkAllRead, useMarkRead, useNotifications } from '../lib/useNotifications.js';
import { useSession } from '../lib/useSession.js';

const WHEN = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const LEAD = 'Ce s-a schimbat la orarul tău, la anunțurile tale și la ce ai postat.';

export function NotificationsPage() {
  const { user } = useSession();
  const list = useNotifications(1);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  if (!user) {
    return (
      <>
        <PageHead title="Notificări" lead={LEAD} />
        <Panel title="Ai nevoie de cont">
          <p className="content">Intră în cont ca să vezi notificările tale.</p>
        </Panel>
      </>
    );
  }
  if (list.isPending) {
    return (
      <>
        <PageHead title="Notificări" lead={LEAD} />
        <Panel>
          <Spinner small />
        </Panel>
      </>
    );
  }

  const items = list.data?.data ?? [];
  const unread = list.data?.meta.unread ?? 0;

  return (
    <>
      <PageHead
        title="Notificări"
        lead={LEAD}
        eyebrow={unread > 0 ? `${unread} necitite` : 'Le-ai citit pe toate'}
      />

      <Panel
        title="Toate"
        aside={
          unread > 0 ? (
            <button type="button" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              Marchează tot ca citit
            </button>
          ) : null
        }
      >
        {items.length === 0 ? (
          <p className="empty">Nicio notificare deocamdată.</p>
        ) : (
          <ul className="notifications">
            {items.map((item) => (
              <li key={item.id} className={item.isRead ? 'read' : 'unread'}>
                <div>
                  <strong>{item.title}</strong>
                  {item.body ? <p>{item.body}</p> : null}
                  <small>{WHEN.format(new Date(item.createdAt))}</small>
                </div>
                <div className="actions">
                  {item.link ? (
                    <Link className="button" to={item.link}>
                      Deschide
                    </Link>
                  ) : null}
                  {item.isRead ? null : (
                    <button type="button" onClick={() => markRead.mutate(item.id)}>
                      Am citit
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
