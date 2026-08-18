import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useRights } from '../lib/useRights.js';

export function RightsPage() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? undefined;
  const category = params.get('categorie') ?? undefined;
  const page = Number(params.get('pagina')) || 1;

  const rights = useRights({ q, category, page });
  const [search, setSearch] = useState(q ?? '');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const meta = rights.data?.meta;
  const articles = rights.data?.data ?? [];

  return (
    <>
      <PageHead
        title="Drepturi"
        lead="Ce poți cere și de unde începi. Fiecare intrare trimite la regulamentul oficial acolo unde el există."
        eyebrow={meta ? `${meta.total} intrări · ${meta.categories.length} categorii` : undefined}
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
            placeholder="Caută: bursa, contestatie, camin"
            aria-label="Caută în drepturi"
          />
          <button type="submit">Caută</button>
          {q ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setParam('q', null);
              }}
            >
              Renunță la căutare
            </button>
          ) : null}
        </form>

        <p className="filters">
          <button
            type="button"
            className="chip"
            disabled={!category}
            onClick={() => setParam('categorie', null)}
          >
            Toate
          </button>
          {(meta?.categories ?? []).map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              disabled={category === name}
              onClick={() => setParam('categorie', name)}
            >
              {name}
            </button>
          ))}
        </p>
      </Panel>

      <Panel
        title={category ?? 'Toate drepturile'}
        aside={meta ? <span className="badge">{meta.total}</span> : null}
      >
        {rights.isPending ? (
          <Spinner small />
        ) : articles.length > 0 ? (
          <ul className="posts">
            {articles.map((article) => (
              <li key={article.id}>
                <div>
                  <span className="label hint">{article.category}</span>
                  <strong>{article.title}</strong>
                  <p className="content">{article.summary}</p>
                  {article.officialUrl ? (
                    <p className="filters">
                      <a className="link" href={article.officialUrl} target="_blank" rel="noreferrer">
                        Regulamentul oficial ↗
                      </a>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            Nimic pentru căutarea asta. Încearcă un cuvânt mai scurt: căutarea merge și fără
            diacritice.
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
