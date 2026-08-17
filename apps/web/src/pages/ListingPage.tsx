import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { ReportButton } from '../components/ReportButton.js';
import { ApiError } from '../lib/apiClient.js';
import { useAskContact, useListing, useUpdateListing } from '../lib/useMarket.js';
import { useSession } from '../lib/useSession.js';
import { priceOf } from './MarketPage.js';

const WHEN = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });

const STATUS_LABEL: Record<string, string> = {
  activ: 'activ',
  rezervat: 'rezervat',
  inchis: 'închis',
};

const REQUEST_LABEL: Record<string, string> = {
  pending: 'Cererea ta așteaptă răspuns.',
  accepted: 'Cererea ta a fost acceptată. Vei fi contactat.',
  declined: 'Cererea ta a fost refuzată.',
  completed: 'Tranzacția e încheiată.',
};

export function ListingPage() {
  const { id } = useParams();
  const listingId = Number(id);
  const { user } = useSession();

  const listing = useListing(listingId);
  const update = useUpdateListing(listingId);
  const ask = useAskContact(listingId);
  const [message, setMessage] = useState('');

  if (listing.isPending) {
    return (
      <Panel>
        <Spinner small />
      </Panel>
    );
  }
  if (listing.isError) {
    const text = listing.error instanceof ApiError ? listing.error.message : 'Eroare necunoscută';
    return <Panel title="Anunțul nu s-a încărcat" hint={text} />;
  }

  const data = listing.data;

  return (
    <>
      <PageHead
        title={data.title}
        size="md"
        back={
          <Link className="link" to="/anunturi">
            ‹ Toate anunțurile
          </Link>
        }
        eyebrow={`${data.kind === 'serviciu' ? 'Serviciu' : 'Produs'} · ${
          STATUS_LABEL[data.status] ?? data.status
        }`}
        lead={priceOf(data)}
      />

      <Panel>
        {data.description ? <p className="content">{data.description}</p> : null}
        <dl className="facts">
          <dt>Publicat de</dt>
          <dd>
            {data.author?.displayName ?? 'Utilizator șters'}
            {data.author?.groupName ? <small> · grupa {data.author.groupName}</small> : null}
          </dd>
          <dt>Publicat</dt>
          <dd>{WHEN.format(new Date(data.createdAt))}</dd>
          {data.subject ? (
            <>
              <dt>Disciplină</dt>
              <dd>{data.subject.name}</dd>
            </>
          ) : null}
        </dl>
        {data.isMine ? null : (
          <p className="filters">
            <ReportButton targetType="listing" targetId={data.id} />
          </p>
        )}
      </Panel>

      {data.isMine ? (
        <Panel
          title="Anunțul tău"
          aside={<span className="badge">{data.requestCount} cereri</span>}
        >
          <p className="filters">
            {(['activ', 'rezervat', 'inchis'] as const).map((status) => (
              <button
                key={status}
                type="button"
                className="chip"
                disabled={data.status === status || update.isPending}
                onClick={() => update.mutate({ status })}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </p>
          <p className="hint">Cererile primite se rezolvă din pagina de anunțuri.</p>
        </Panel>
      ) : !user ? (
        <Panel title="Contact">
          <p className="hint">
            <Link to="/intra">Intră în cont</Link> ca să ceri contactul.
          </p>
        </Panel>
      ) : data.myRequestStatus ? (
        <Panel title="Contact" hint={REQUEST_LABEL[data.myRequestStatus]} />
      ) : (
        <Panel
          title="Cere contactul"
          hint="Autorul primește o notificare. Adresa ta de email nu se vede niciodată."
        >
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              ask.mutate({ message: message || undefined }, { onSuccess: () => setMessage('') });
            }}
          >
            <label>
              Mesaj, opțional
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Când ești disponibil?"
              />
            </label>
            {ask.isError ? <p className="error">{ask.error.message}</p> : null}
            <p>
              <button
                type="submit"
                className="primary"
                disabled={ask.isPending || data.status === 'inchis'}
              >
                Trimite cererea
              </button>
            </p>
          </form>
        </Panel>
      )}
    </>
  );
}
