import { useState } from 'react';
import type { ReportTarget } from '@campushub/shared';
import { useReport } from '../lib/useModeration.js';
import { useSession } from '../lib/useSession.js';

/** reporting is available wherever content is shown the queue behind it is for moderators */
export function ReportButton({
  targetType,
  targetId,
  label = 'Raportează',
}: {
  targetType: ReportTarget;
  targetId: number;
  label?: string;
}) {
  const { user } = useSession();
  const report = useReport();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!user) return null;

  if (report.isSuccess) {
    return <small className="hint">Raport trimis. Mulțumim.</small>;
  }

  if (!open) {
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <form
      className="form report"
      onSubmit={(e) => {
        e.preventDefault();
        report.mutate({ targetType, targetId, reason });
      }}
    >
      <label>
        Ce e în neregulă?
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={255}
          required
          placeholder="Pe scurt, ce ar trebui să vadă un moderator"
        />
      </label>
      {report.isError ? <p className="error">{report.error.message}</p> : null}
      <p className="filters">
        <button type="submit" disabled={report.isPending}>
          Trimite raportul
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Renunță
        </button>
      </p>
    </form>
  );
}
