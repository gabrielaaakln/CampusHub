import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { SessionUser } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { Spinner } from '../components/Spinner.js';
import { useGroups } from '../lib/useCatalog.js';
import { useFeature } from '../lib/useAppConfig.js';
import { useDeleteAccount, useSession, useUpdateProfile } from '../lib/useSession.js';

const ROLE_LABEL: Record<string, string> = {
  student: 'student',
  moderator: 'moderator',
  admin: 'administrator',
};

const LEAD = 'Numele afișat, grupa și semigrupa. De ele depind orarul, calendarul și „Acum".';

export function ProfilePage() {
  const { user, isPending } = useSession();
  const registration = useFeature('registration');
  const [params] = useSearchParams();
  // the institutional sign in knows the name and the address and nothing else about the student
  const welcome = params.get('bun-venit') === '1';

  if (isPending) {
    return (
      <Panel>
        <Spinner small />
      </Panel>
    );
  }

  if (!user) {
    return (
      <>
        <PageHead title="Profil" lead={LEAD} />
        <Panel title="Ai nevoie de cont">
          <p className="filters">
            <Link className="button primary" to="/intra">
              Intră în cont
            </Link>
            {registration ? (
              <Link className="button" to="/cont-nou">
                Creează un cont
              </Link>
            ) : null}
          </p>
        </Panel>
      </>
    );
  }

  if (welcome) {
    return (
      <>
        <PageHead
          title="Bine ai venit"
          eyebrow={user.email}
          lead="Contul e gata. Mai lipsește un lucru: grupa, fără de care orarul și calendarul rămân goale."
        />
        <ProfileForm user={user} welcome />
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Profil"
        lead={LEAD}
        eyebrow={`${ROLE_LABEL[user.role] ?? user.role} · ${user.email}`}
      />
      {/* mounted only once the account is loaded so the fields start filled */}
      <ProfileForm user={user} />
      <DangerZone />
    </>
  );
}

function ProfileForm({ user, welcome }: { user: SessionUser; welcome?: boolean }) {
  const navigate = useNavigate();
  const groups = useGroups();
  const save = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [groupId, setGroupId] = useState(user.groupId ?? 0);
  const [subgroup, setSubgroup] = useState(user.subgroup ?? 0);

  const chosen = groups.data?.find((g) => g.id === groupId);
  const maxSubgroups = chosen?.subgroups ?? 4;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        displayName,
        groupId: groupId || null,
        subgroup: groupId && subgroup ? subgroup : null,
      },
      // the welcome screen is a step not a settings page so it hands over once it is done
      { onSuccess: () => welcome && void navigate('/') },
    );
  }

  return (
    <Panel
      title={welcome ? 'Ce mai avem nevoie' : 'Datele tale'}
      hint={
        welcome
          ? 'Universitatea ne-a spus doar cine ești. Restul alegi tu și poți schimba oricând.'
          : 'Adresa nu se schimbă: pe ea se sprijină contul.'
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <label>
          Nume afișat
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
        </label>

        <label>
          Grupa
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(Number(e.target.value));
              setSubgroup(0);
            }}
          >
            <option value={0}>fără grupă</option>
            {(groups.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · anul {group.studyYear}
              </option>
            ))}
          </select>
        </label>

        <label>
          Semigrupa
          <select
            value={subgroup}
            onChange={(e) => setSubgroup(Number(e.target.value))}
            disabled={!groupId}
          >
            <option value={0}>fără semigrupă</option>
            {Array.from({ length: maxSubgroups }, (_, i) => i + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        {save.isError ? <p className="error">{save.error.message}</p> : null}
        {save.isSuccess ? <p className="hint">Salvat.</p> : null}

        <p className="filters">
          <button type="submit" className="primary" disabled={save.isPending}>
            {welcome ? 'Salvează și intră' : 'Salvează'}
          </button>
          {welcome ? null : (
            <Link className="button" to="/orar">
              Vezi orarul
            </Link>
          )}
        </p>
      </form>
    </Panel>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const remove = useDeleteAccount();
  const [confirm, setConfirm] = useState(false);

  return (
    <Panel
      title="Ștergerea contului"
      hint="Contul se anonimizează, nu se șterge fizic: postările rămân fără autor, ca firele de discuție să nu se rupă."
    >
      {confirm ? (
        <>
          <p className="content">
            Numele devine „Utilizator șters", adresa este înlocuită și nu te mai poți autentifica.
            Acțiunea nu se poate anula.
          </p>
          {remove.isError ? <p className="error">{remove.error.message}</p> : null}
          <p className="filters">
            <button
              type="button"
              className="primary"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => void navigate('/') })}
            >
              Șterge contul definitiv
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              Renunț
            </button>
          </p>
        </>
      ) : (
        <p className="filters">
          <button type="button" onClick={() => setConfirm(true)}>
            Vreau să șterg contul
          </button>
        </p>
      )}
    </Panel>
  );
}
