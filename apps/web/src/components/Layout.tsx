import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router';
import type { FeatureKey } from '@campushub/shared';
import { Icon, type IconName } from './Icon.js';
import { useAppConfig } from '../lib/useAppConfig.js';
import { useLogout, useSession } from '../lib/useSession.js';
import { useTheme } from '../lib/useTheme.js';

type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  feature?: FeatureKey;
  staffOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: '/orar', label: 'Orar', icon: 'orar' },
  { to: '/harta', label: 'Hartă', icon: 'harta' },
];

// what you do about the account rather than what you read sits together at the foot of the rail
const FOOT: NavItem[] = [
  { to: '/profil', label: 'Setări', icon: 'setari' },
];

export function Layout() {
  const { faculty, features } = useAppConfig();
  const { user } = useSession();
  const logout = useLogout();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);

  // on a phone the drawer covers the page so any route change closes it
  useEffect(() => setMenu(false), [pathname]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.body.classList.add('menu-open');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('menu-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const allowed = (item: NavItem) =>
    (!item.feature || features[item.feature]) &&
    (!item.staffOnly || (user !== null && user.role !== 'student'));

  const items = NAV.filter(allowed);
  const foot = FOOT.filter(allowed);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <b>CampusHub</b>
          <span>{faculty?.name ?? 'Platformă universitară'}</span>
        </Link>

        <div className="account">
          <button
            type="button"
            className="icon"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Treci pe tema deschisă' : 'Treci pe tema închisă'}
          >
            <Icon name="theme" size={16} />
          </button>
          {user ? (
            <>
              <Link to="/profil" className="who">
                {user.displayName}
              </Link>
              {/* the label gives way to the icon on a phone so both sides of the bar weigh the same */}
              <button
                type="button"
                className="signout"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-label="Ieși"
              >
                <span>Ieși</span>
                <Icon name="iesire" size={16} />
              </button>
            </>
          ) : (
            <Link to="/intra" className="button primary">
              Intră în cont
            </Link>
          )}
        </div>

        {/* the rail is a drawer only on a phone and this button is its only handle */}
        <button
          type="button"
          className="icon menu-toggle"
          aria-label={menu ? 'Închide meniul' : 'Deschide meniul'}
          aria-expanded={menu}
          aria-controls="rail"
          onClick={() => setMenu((open) => !open)}
        >
          <Icon name={menu ? 'inchide' : 'meniu'} size={16} />
        </button>
      </header>

      <div className="frame">
        {menu ? (
          <button
            type="button"
            className="scrim"
            aria-label="Închide meniul"
            onClick={() => setMenu(false)}
          />
        ) : null}

        <aside id="rail" className={menu ? 'rail open' : 'rail'}>
          <nav>
            <div className="brand rail-brand">
              <b>CampusHub</b>
              <span>{faculty?.name ?? 'Platformă universitară'}</span>
            </div>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}>
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            {/* the account sits apart from the modules at the foot of the rail */}
            <span className="rail-foot">
              {foot.map((item) => (
                <NavLink key={item.to} to={item.to}>
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </span>
          </nav>
        </aside>

        <main>
          <div className="stack">
            <Outlet />
          </div>
          <footer className="foot">
            <span>© {new Date().getFullYear()} CampusHub</span>
            <nav>
              <Link to="/confidentialitate">Confidențialitate</Link>
            </nav>
          </footer>
        </main>
      </div>
    </div>
  );
}
