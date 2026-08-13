import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PageHead, Panel } from '../components/Panel.js';
import { useFeature } from '../lib/useAppConfig.js';
import { useLogin, useSession } from '../lib/useSession.js';

export function LoginPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const login = useLogin();
  const sso = useFeature('sso');
  const password = useFeature('passwordLogin');
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');

  // the sso callback has nowhere to put an error but the address bar
  const ssoError = params.get('eroare');

  if (user) {
    return (
      <>
        <PageHead title="Ești conectat" size="md" eyebrow="Cont" lead={user.email} />
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
    login.mutate({ email, password: secret }, { onSuccess: () => void navigate('/') });
  }

  return (
    <>
      <PageHead
        title="Intră"
        lead={
          sso
            ? 'Cu contul instituțional TUIASI. Parola se tastează pe pagina universității, nu aici.'
            : 'Cu adresa instituțională și parola ta.'
        }
      />

      {ssoError ? (
        <Panel title="Autentificarea nu a reușit">
          <p className="error">{ssoError}</p>
          <p className="hint">
            Dacă mesajul cere aprobarea unui administrator, contul instituțional nu poate autoriza
            singur aplicația. Scrie-i echipei și intri între timp cu un cont de test.
          </p>
        </Panel>
      ) : null}

      {sso ? (
        <Panel
          title="Cont instituțional"
          hint="Te trimite la Microsoft, care te duce mai departe la pagina de login a universității."
        >
          <p className="filters">
            {/* a full page navigation on purpose the redirect chain leaves the application */}
            <a className="button primary" href="/api/v1/auth/sso/start">
              Intră cu contul TUIASI
            </a>
          </p>
          <p className="hint">
            Intră doar conturile <strong>@tuiasi.ro</strong> și <strong>@student.tuiasi.ro</strong>.
          </p>
        </Panel>
      ) : null}

      {password ? (
        <Panel
          title={sso ? 'Cont de test' : 'Autentificare'}
          hint={sso ? 'Pentru conturile de demonstrație și pentru dezvoltare.' : undefined}
        >
          <form onSubmit={onSubmit} className="form">
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
              Parolă
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {login.isError ? <p className="error">{login.error.message}</p> : null}
            <p className="filters">
              <button type="submit" className={sso ? '' : 'primary'} disabled={login.isPending}>
                Intră în cont
              </button>
            </p>
          </form>
        </Panel>
      ) : null}
    </>
  );
}
