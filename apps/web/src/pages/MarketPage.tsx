import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ListingDto, ListingKind } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useAnswerRequest, useCreateListing, useListings, useMyRequests } from '../lib/useMarket.js';
import { useSession } from '../lib/useSession.js';

const KIND_LABEL: Record<string, string> = { produs: 'produs', serviciu: 'serviciu' };
const STATUS_LABEL: Record<string, string> = {
  activ: 'activ',
  rezervat: 'rezervat',
  inchis: 'închis',
};
const REQUEST_LABEL: Record<string, string> = {
  pending: 'în așteptare',
  accepted: 'acceptată',
  declined: 'refuzată',
  completed: 'încheiată',
};

export function priceOf(listing: ListingDto): string {
  if (listing.price === null) return 'preț la discuție';
  const amount = `${listing.price.toLocaleString('ro-RO')} ${listing.currency}`;
  return listing.priceUnit ? `${amount} / ${listing.priceUnit}` : amount;
}

export function MarketPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();

  const kind = (params.get('tip') as ListingKind | null) ?? undefined;
  const q = params.get('q') ?? undefined;
  const mine = params.get('ale-mele') === 'da';
  const page = Number(params.get('pagina')) || 1;

  const listings = useListings({ kind, q, mine, page });
  const [search, setSearch] = useState(q ?? '');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const meta = listings.data?.meta;

  return (
    <>
      <PageHead
        title="Anunțuri"
        lead="Cărți, materiale și meditații între studenți. Aplicația nu procesează plăți, doar pune în legătură două persoane."
        eyebrow={meta ? `${meta.total} anunțuri active` : undefined}
      />

      <Panel bare>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', search.trim() || null);
          }}
        >
          <input
            className="search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută în titluri"
            aria-label="Caută un anunț"
          />
          <button type="submit">Caută</button>
        </form>

        <p className="filters">
          <button type="button" className="chip" disabled={!kind} onClick={() => setParam('tip', null)}>
            Toate
          </button>
          <button
            type="button"
            className="chip"
            disabled={kind === 'produs'}
            onClick={() => setParam('tip', 'produs')}
          >
            Produse
          </button>
          <button
            type="button"
            className="chip"
            disabled={kind === 'serviciu'}
            onClick={() => setParam('tip', 'serviciu')}
          >
            Servicii și meditații
          </button>
          {user ? (
            <button
              type="button"
              className="chip"
              disabled={mine}
              onClick={() => setParam('ale-mele', mine ? null : 'da')}
            >
              Ale mele
            </button>
          ) : null}
          {mine ? (
            <button type="button" onClick={() => setParam('ale-mele', null)}>
              Renunță la filtru
            </button>
          ) : null}
        </p>

        {user ? <NewListing /> : <p className="hint">Intră în cont ca să publici un anunț.</p>}
      </Panel>

      <Panel title="Anunțuri" aside={meta ? <span className="badge">{meta.total}</span> : null}>
        {listings.isPending ? (
          <Spinner small />
        ) : listings.data && listings.data.data.length > 0 ? (
          <ul className="posts">
            {listings.data.data.map((listing) => (
              <li key={listing.id}>
                <div>
                  <Link to={`/anunturi/${listing.id}`}>
                    <strong>{listing.title}</strong>
                  </Link>
                  <small>
                    {KIND_LABEL[listing.kind]} · {priceOf(listing)} ·{' '}
                    {STATUS_LABEL[listing.status] ?? listing.status}
                    {listing.subject ? ` · ${listing.subject.name}` : ''}
                    {listing.isMine ? ` · ${listing.requestCount} cereri` : ''}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Niciun anunț care să corespundă filtrelor.</p>
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

      {user ? <Requests /> : null}

      <Rules />
    </>
  );
}

/** the clause the plan asks for it is also the rule moderators apply to the queue */
function Rules() {
  return (
    <Panel
      title="Reguli pentru anunțuri"
      hint="Se aplică tuturor anunțurilor, indiferent de tip."
    >
      <p className="content">
        Poți publica ce ține de studiu și de viața de student: cărți, cursuri, materiale,
        echipamente, meditații și ajutor la învățat.
      </p>
      <h3>Nu se publică</h3>
      <ul className="posts">
        <li>
          <div>
            <strong>Lucrări, proiecte, teme, referate sau lucrări de licență scrise la comandă</strong>
            <small>
              Nici oferite, nici cerute. E fraudă academică și se sancționează de facultate.
              Tehnoredactarea sau corectarea unui text scris de tine e altceva și e permisă.
            </small>
          </div>
        </li>
        <li>
          <div>
            <strong>Bunuri restricționate</strong>
            <small>
              Alcool, tutun, substanțe, medicamente, arme, precum și cărți sau software copiate
              ilegal.
            </small>
          </div>
        </li>
        <li>
          <div>
            <strong>Anunțuri care nu sunt ale tale</strong>
            <small>Nu publica în numele altcuiva și nu republica anunțuri de pe alte platforme.</small>
          </div>
        </li>
      </ul>
      <p className="hint">
        Un anunț care încalcă regulile se raportează din pagina lui. Moderatorul îl șterge, iar
        autorul primește o notificare cu motivul. Aplicația nu procesează plăți: înțelegerea și banii
        rămân între cele două persoane.
      </p>
    </Panel>
  );
}

function Requests() {
  const requests = useMyRequests();
  const answer = useAnswerRequest();

  const received = requests.data?.received ?? [];
  const sent = requests.data?.sent ?? [];
  if (received.length === 0 && sent.length === 0) return null;

  return (
    <Panel title="Cereri de contact" hint="Contactul trece prin aplicație, nu prin adrese de email.">
      {received.length > 0 ? (
        <>
          <h3>Pentru anunțurile mele</h3>
          <ul className="posts">
            {received.map((request) => (
              <li key={request.id}>
                <div>
                  <Link to={`/anunturi/${request.listingId}`}>
                    <strong>{request.listingTitle}</strong>
                  </Link>
                  {request.message ? <p className="content">{request.message}</p> : null}
                  <small>
                    {request.requester?.displayName ?? 'Utilizator șters'}
                    {request.requester?.groupName ? `, grupa ${request.requester.groupName}` : ''} ·{' '}
                    {REQUEST_LABEL[request.status]}
                  </small>
                </div>
                {request.status === 'pending' ? (
                  <div className="actions">
                    <button
                      type="button"
                      disabled={answer.isPending}
                      onClick={() => answer.mutate({ id: request.id, status: 'accepted' })}
                    >
                      Acceptă
                    </button>
                    <button
                      type="button"
                      disabled={answer.isPending}
                      onClick={() => answer.mutate({ id: request.id, status: 'declined' })}
                    >
                      Refuză
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sent.length > 0 ? (
        <>
          <h3>Trimise de mine</h3>
          <ul className="posts">
            {sent.map((request) => (
              <li key={request.id}>
                <div>
                  <Link to={`/anunturi/${request.listingId}`}>
                    <strong>{request.listingTitle}</strong>
                  </Link>
                  <small>{REQUEST_LABEL[request.status]}</small>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

function NewListing() {
  const create = useCreateListing();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ListingKind>('produs');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');

  if (!open) {
    return (
      <p>
        <button type="button" onClick={() => setOpen(true)}>
          Publică un anunț
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
            kind,
            title,
            description: description || undefined,
            price: price === '' ? null : Number(price),
            priceUnit: unit || undefined,
          },
          {
            onSuccess: () => {
              setTitle('');
              setDescription('');
              setPrice('');
              setUnit('');
              setOpen(false);
            },
          },
        );
      }}
    >
      <label>
        Tip
        <select value={kind} onChange={(e) => setKind(e.target.value as ListingKind)}>
          <option value="produs">Produs</option>
          <option value="serviciu">Serviciu sau meditații</option>
        </select>
      </label>
      <label>
        Titlu
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={5} required />
      </label>
      <label>
        Descriere
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>
      <label>
        Preț în lei, gol dacă e la discuție
        <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label>
        Pe unitate, dacă e cazul
        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Oră, lucrare" />
      </label>
      <p className="hint">
        Prin publicare confirmi că anunțul respectă regulile din josul paginii: fără bunuri
        restricționate și fără lucrări sau proiecte la comandă.
      </p>
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
