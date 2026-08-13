import { Link } from 'react-router';
import { PageHead, Panel } from '../components/Panel.js';

export function NotFoundPage() {
  return (
    <>
      <PageHead title="404" lead="Adresa asta nu duce nicăieri." />
      <Panel title="Unde mergi mai departe">
        <p className="filters">
          <Link className="button primary" to="/">
            Acum
          </Link>
          <Link className="button" to="/orar">
            Orar
          </Link>
          <Link className="button" to="/harta">
            Hartă
          </Link>
        </p>
      </Panel>
    </>
  );
}
