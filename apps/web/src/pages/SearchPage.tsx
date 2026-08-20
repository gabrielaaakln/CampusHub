import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SearchType } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useSearch } from '../lib/useSearch.js';

const TYPE_LABEL: Record<SearchType, string> = {
  post: 'forum',
  listing: 'anunț',
  rights: 'drepturi',
};

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = (params.get('tip') as SearchType | null) ?? undefined;

  const results = useSearch(q, type);
  const [text, setText] = useState(q);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const counts = results.data?.meta.counts;
  const hits = results.data?.data ?? [];

  return (
    <>
      <PageHead
        title="Caută"
        lead="Peste forum, anunțuri și drepturile studentului. Merge și fără diacritice."
        eyebrow={q ? `pentru „${q}”` : undefined}
      />

      <Panel bare>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', text.trim() || null);
          }}
        >
          <input
            className="search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bursa, contestatie, laborator de retele..."
            aria-label="Caută în aplicație"
          />
          <button type="submit" className="primary">
            Caută
          </button>
        </form>

        {counts ? (
          <p className="filters">
            <button type="button" className="chip" disabled={!type} onClick={() => setParam('tip', null)}>
              Tot ({counts.post + counts.listing + counts.rights})
            </button>
            {(Object.keys(TYPE_LABEL) as SearchType[]).map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                disabled={type === value}
                onClick={() => setParam('tip', value)}
              >
                {TYPE_LABEL[value]} ({counts[value]})
              </button>
            ))}
          </p>
        ) : null}
      </Panel>

      <Panel title="Rezultate" aside={<span className="badge">{hits.length}</span>}>
        {q.trim().length < 2 ? (
          <p className="empty">Scrie cel puțin două caractere.</p>
        ) : results.isPending ? (
          <Spinner small />
        ) : hits.length === 0 ? (
          <p className="empty">Nimic pentru „{q}”. Încearcă un cuvânt mai scurt.</p>
        ) : (
          <ul className="posts">
            {hits.map((hit) => (
              <li key={`${hit.type}:${hit.id}`}>
                <div>
                  <span className="label hint">
                    {TYPE_LABEL[hit.type]}
                    {hit.meta ? ` · ${hit.meta}` : ''}
                  </span>
                  <Link to={hit.link}>
                    <strong>{hit.title}</strong>
                  </Link>
                  {hit.excerpt ? <p className="content">{hit.excerpt}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
