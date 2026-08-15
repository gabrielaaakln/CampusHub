import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ForumCommentDto, SessionUser } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { ReportButton } from '../components/ReportButton.js';
import { Votes } from '../components/Votes.js';
import { ApiError } from '../lib/apiClient.js';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useDeletePost,
  usePost,
  useVote,
} from '../lib/useForum.js';
import { useSession } from '../lib/useSession.js';

/** the author or anyone above a student the server checks the same thing again */
const canRemove = (user: SessionUser | null, authorId: number | undefined) =>
  user !== null && (user.role !== 'student' || user.id === authorId);

const WHEN = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

type CommentNode = ForumCommentDto & { children: CommentNode[] };

/** the server sends a flat list with the parent on each row the shape is rebuilt here */
function toTree(list: ForumCommentDto[]): CommentNode[] {
  const nodes = new Map<number, CommentNode>();
  for (const comment of list) nodes.set(comment.id, { ...comment, children: [] });

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentCommentId === null ? null : nodes.get(node.parentCommentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function PostPage() {
  const { id } = useParams();
  const postId = Number(id);
  const { user } = useSession();

  const navigate = useNavigate();
  const post = usePost(postId);
  const comments = useComments(postId);
  const votePost = useVote('posts');
  const create = useCreateComment(postId);
  const removePost = useDeletePost();
  const [text, setText] = useState('');

  if (post.isPending) {
    return (
      <Panel>
        <Spinner small />
      </Panel>
    );
  }
  if (post.isError) {
    const message = post.error instanceof ApiError ? post.error.message : 'Eroare necunoscută';
    return <Panel title="Postarea nu s-a încărcat" hint={message} />;
  }

  const data = post.data;
  const tree = toTree(comments.data ?? []);

  return (
    <>
      <PageHead
        title={data.title}
        size="md"
        back={
          <Link className="link" to="/forum">
            ‹ Toate postările
          </Link>
        }
        eyebrow={`${data.categoryName}${data.subject ? ` · ${data.subject.name}` : ''}`}
        lead={`${data.author?.displayName ?? 'Utilizator șters'}${
          data.author?.groupName ? `, grupa ${data.author.groupName}` : ''
        } · ${WHEN.format(new Date(data.createdAt))}`}
      />

      {/* the vote column sits beside the box and the actions under it not inside the content */}
      <div className="lead-row">
        <Votes
          score={data.score}
          myVote={data.myVote}
          disabled={!user || votePost.isPending}
          onVote={(value) => votePost.mutate({ id: data.id, value })}
        />
        <div className="lead-main">
          <Panel>
            {data.content ? (
              <p className="content">{data.content}</p>
            ) : (
              <p className="empty">Postarea nu are text, doar titlu.</p>
            )}
          </Panel>
          {data.isDeleted ? null : (
            <p className="row-actions">
              <ReportButton targetType="post" targetId={data.id} />
              {canRemove(user, data.author?.id) ? (
                <button
                  type="button"
                  className="link"
                  disabled={removePost.isPending}
                  onClick={() =>
                    removePost.mutate(data.id, { onSuccess: () => void navigate('/forum') })
                  }
                >
                  Șterge postarea
                </button>
              ) : null}
            </p>
          )}
        </div>
      </div>

      <Panel title="Comentarii" aside={<span className="badge">{data.commentCount}</span>}>
        {comments.isPending ? (
          <Spinner small />
        ) : tree.length > 0 ? (
          <ul className="thread">
            {tree.map((node) => (
              <Comment key={node.id} node={node} postId={postId} user={user} />
            ))}
          </ul>
        ) : (
          <p className="empty">Niciun comentariu. Fii primul care răspunde.</p>
        )}

        {user ? (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ content: text }, { onSuccess: () => setText('') });
            }}
          >
            <label>
              Răspunsul tău
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} required />
            </label>
            {create.isError ? <p className="error">{create.error.message}</p> : null}
            <p>
              <button
                type="submit"
                className="primary"
                disabled={create.isPending || text.trim().length === 0}
              >
                Trimite
              </button>
            </p>
          </form>
        ) : (
          <p className="hint">
            <Link to="/intra">Intră în cont</Link> ca să răspunzi.
          </p>
        )}
      </Panel>
    </>
  );
}

function Comment({
  node,
  postId,
  user,
}: {
  node: CommentNode;
  postId: number;
  user: SessionUser | null;
}) {
  const vote = useVote('comments');
  const remove = useDeleteComment();
  const reply = useCreateComment(postId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  return (
    <li>
      <div className="comment">
        <Votes
          score={node.score}
          myVote={node.myVote}
          disabled={!user || node.isDeleted || vote.isPending}
          onVote={(value) => vote.mutate({ id: node.id, value })}
        />
        <div>
          <p className="content">{node.content}</p>
          <small>
            {node.author?.displayName ?? 'Utilizator șters'} ·{' '}
            {WHEN.format(new Date(node.createdAt))}
          </small>
          {node.isDeleted ? null : (
            <p className="filters">
              {user && node.depth < 5 ? (
                <button type="button" className="link" onClick={() => setOpen(!open)}>
                  {open ? 'Renunț' : 'Răspunde'}
                </button>
              ) : null}
              <ReportButton targetType="comment" targetId={node.id} />
              {canRemove(user, node.author?.id) ? (
                <button
                  type="button"
                  className="link"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(node.id)}
                >
                  Șterge
                </button>
              ) : null}
            </p>
          )}

          {open ? (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                reply.mutate(
                  { content: text, parentCommentId: node.id },
                  {
                    onSuccess: () => {
                      setText('');
                      setOpen(false);
                    },
                  },
                );
              }}
            >
              <label>
                Răspuns pentru {node.author?.displayName ?? 'comentariu'}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  required
                />
              </label>
              {reply.isError ? <p className="error">{reply.error.message}</p> : null}
              <p className="filters">
                <button
                  type="submit"
                  className="primary"
                  disabled={reply.isPending || text.trim().length === 0}
                >
                  Trimite
                </button>
              </p>
            </form>
          ) : null}
        </div>
      </div>

      {node.children.length > 0 ? (
        <ul className="thread">
          {node.children.map((child) => (
            <Comment key={child.id} node={child} postId={postId} user={user} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
