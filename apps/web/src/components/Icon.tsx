import type { ReactElement } from 'react';

export type IconName =
  | 'orar'
  | 'harta'
  | 'forum'
  | 'notificari'
  | 'setari'
  | 'theme'
  | 'meniu'
  | 'inchide'
  | 'iesire';

// geometric shapes only squares circles and straight lines the grid has no curves to spare
const PATHS: Record<IconName, ReactElement> = {
  orar: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3.5 2.5" />
    </>
  ),
  harta: (
    <>
      <path d="M2.5 4.5 7.5 2.5v13l-5 2z" />
      <path d="M7.5 2.5 12.5 4.5v13l-5-2z" />
      <path d="M12.5 4.5 17.5 2.5v13l-5 2z" />
    </>
  ),
  forum: (
    <>
      <path d="M2.5 3.5h11v8h-7l-4 3z" />
      <path d="M6.5 15.5h7l4 3v-11h-3" />
    </>
  ),
  notificari: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" />
      <path d="m2.5 4.5 7.5 6 7.5-6" />
    </>
  ),
  setari: (
    <>
      <rect x="4.5" y="4.5" width="11" height="11" />
      <rect x="8" y="8" width="4" height="4" fill="currentColor" stroke="none" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2" />
    </>
  ),
  theme: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" stroke="none" />
    </>
  ),
  meniu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
  inchide: <path d="m4.5 4.5 11 11M15.5 4.5l-11 11" />,
  iesire: (
    <>
      <path d="M8.5 3.5h-5v13h5" />
      <path d="M9.5 10h7M13.5 6.5 17 10l-3.5 3.5" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="miter"
      strokeLinecap="butt"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
