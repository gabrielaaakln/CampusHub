import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PASSWORD_MIN_LENGTH } from '@campushub/shared';
import { PageHead, Panel } from '../components/Panel.js';
import { useRegister, useSession } from '../lib/useSession.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (user) {
    return (
      <>
        <PageHead title="Ai deja cont" size="md" eyebrow="Cont" lead={user.email} />
        <Panel>
          <p className="filters">
            <Link className="button primary" to="/">
              Mergi la Acum
            </Link>
          </p>
        </Panel>
      </>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    register.mutate({ displayName, email, password }, { onSuccess: () => void navigate('/') });
  }

  return (
    <>
      <PageHead title="Cont nou" lead="Înregistrarea merge doar cu adresa instituțională." />
      <Panel title="Datele tale">
        <form onSubmit={onSubmit} className="form">
          <label>
            Nume afișat
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label>
            Email instituțional
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Parolă, minim {PASSWORD_MIN_LENGTH} caractere
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
          </label>
          {register.isError ? <p className="error">{register.error.message}</p> : null}
          <p className="filters">
            <button type="submit" className="primary" disabled={register.isPending}>
              Creează contul
            </button>
            <Link className="button" to="/intra">
              Am deja cont
            </Link>
          </p>
        </form>
      </Panel>
    </>
  );
}
