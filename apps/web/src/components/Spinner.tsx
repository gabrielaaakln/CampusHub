export function Spinner({ label, small }: { label?: string; small?: boolean }) {
  return (
    <div
      className={small ? 'spinner-container sm' : 'spinner-container'}
      role="status"
      aria-label={label ?? 'Se încarcă'}
    >
      <span className="spinner" />
    </div>
  );
}
