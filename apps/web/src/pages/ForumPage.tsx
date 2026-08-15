import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { PostSort } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { Votes } from '../components/Votes.js';
import { useCategories, useCreatePost, usePosts, useVote } from '../lib/useForum.js';
import { useSession } from '../lib/useSession.js';

const WHEN = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long' });

export function ForumPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();

  const sort = (params.get('sort') === 'top' ? 'top' : 'new') satisfies PostSort;
  const categoryId = Number(params.get('categorie')) || undefined;
  const page = Number(params.get('pagina')) || 1;

  const categories = useCategories();
  const posts = usePosts({ sort, categoryId, page });
  const vote = useVote('posts');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const meta = posts.data?.meta;

  return (
    <>
      <PageHead
        title="Forum"
        lead="Întrebări și răspunsuri pe discipline. Votează ce a fost util, ca să urce."
        eyebrow={meta ? `${meta.total} postări` : undefined}
      />

      <Panel bare>
        <p className="filters">
          <button
            type="button"
            className="chip"
            disabled={sort === 'new'}
            onClick={() => setParam('sort', 'new')}
          >
            Cele mai noi
          </button>
          <button
            type="button"
            className="chip"
            disabled={sort === 'top'}
            onClick={() => setParam('sort', 'top')}
          >
            Cele mai votate
          </button>
        </p>

        <p className="filters">
          <button
            type="button"
            className="chip"
            disabled={!categoryId}
            onClick={() => setParam('categorie', null)}
          >
            Toate categoriile
          </button>
          {(categories.data ?? []).map((category) => (
            <button
              key={category.id}
              type="button"
              className="chip"
              disabled={categoryId === category.id}
              onClick={() => setParam('categorie', String(category.id))}
            >
              {category.name} ({category.postCount})
            </button>
          ))}
        </p>

        {user ? <NewPost /> : <p className="hint">Intră în cont ca să pui o întrebare.</p>}
      </Panel>

      <Panel title="Postări" aside={meta ? <span className="badge">{meta.total}</span> : null}>
        {posts.isPending ? (
          <Spinner small />
        ) : posts.data && posts.data.data.length > 0 ? (
          <ul className="posts">
            {posts.data.data.map((post) => (
              <li key={post.id}>
                <Votes
                  score={post.score}
                  myVote={post.myVote}
                  disabled={!user || vote.isPending}
                  onVote={(value) => vote.mutate({ id: post.id, value })}
                />
                <div>
                  <Link to={`/forum/${post.id}`}>
                    <strong>{post.title}</strong>
                  </Link>
                  <small>
                    {post.categoryName}
                    {post.subject ? ` · ${post.subject.name}` : ''} ·{' '}
                    {post.author?.displayName ?? 'Utilizator șters'} ·{' '}
                    {WHEN.format(new Date(post.createdAt))} · {post.commentCount} comentarii
                  </small>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nicio postare aici deocamdată.</p>
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

function NewPost() {
  const categories = useCategories();
  const create = useCreatePost();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState(0);

  if (!open) {
    return (
      <p>
        <button type="button" onClick={() => setOpen(true)}>
          Pune o întrebare
        </button>
      </p>
    );
  }

  const chosen = categoryId || categories.data?.[0]?.id || 0;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { categoryId: chosen, title, content: content || undefined },
          {
            onSuccess: () => {
              setTitle('');
              setContent('');
              setOpen(false);
            },
          },
        );
      }}
    >
      <label>
        Categorie
        <select value={chosen} onChange={(e) => setCategoryId(Number(e.target.value))}>
          {(categories.data ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Titlu
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={5} required />
      </label>
      <label>
        Detalii
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
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
