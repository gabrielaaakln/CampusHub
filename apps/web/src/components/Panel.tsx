import type { ReactNode } from 'react';

export function Panel({
  title,
  hint,
  aside,
  filled,
  inverted,
  bare,
  children,
}: {
  title?: string;
  hint?: string;
  /** short status that belongs on the same rule as the title */
  aside?: ReactNode;
  filled?: boolean;
  /** reversed out for the one thing on the page that is happening right now */
  inverted?: boolean;
  /** a toolbar is not content so it loses the frame */
  bare?: boolean;
  children?: ReactNode;
}) {
  const className = [
    'panel',
    filled ? 'filled' : '',
    inverted ? 'inverted' : '',
    bare ? 'bare' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={className}>
      {title || hint || aside ? (
        <header className="panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {hint ? <p className="hint">{hint}</p> : null}
          </div>
          {aside}
        </header>
      ) : null}
      {children ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}

export function PageHead({
  title,
  lead,
  eyebrow,
  back,
  size,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  /** the way out of a detail page sits above the title not inside the content */
  back?: ReactNode;
  size?: 'md';
}) {
  return (
    <header className={size === 'md' ? 'page-head md' : 'page-head'}>
      {back ? <p className="back">{back}</p> : null}
      {eyebrow ? <span className="label">{eyebrow}</span> : null}
      <h1>{title}</h1>
      {lead ? <p>{lead}</p> : null}
    </header>
  );
}
