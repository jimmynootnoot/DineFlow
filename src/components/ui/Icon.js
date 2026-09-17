/* Authored icon set — one consistent 1.5px stroke on a 24px grid,
   inherits currentColor. Replaces the emoji and unicode glyphs that
   were standing in for an icon system. No dependency; these are
   hand-written paths, not a library. */

const P = {
  grid:      'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  bag:       'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2',
  list:      'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  book:      'M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2V5zM8 3v18',
  chart:     'M5 20V10M12 20V4M19 20v-7',
  flame:     'M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.5.7-2.8 1.6-3.9.5 1 1.2 1.6 2 1.9C10.3 8 10.8 5.6 12 3z',
  package:   'M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8',
  utensils:  'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 1-2 3-2 5s.5 3 2 3v10',
  clock:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alert:     'M12 4L2.5 20h19L12 4zM12 10v4M12 17.5h.01',
  award:     'M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8.5 13L7 21l5-2.5L17 21l-1.5-8',
  pencil:    'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM15 6l3 3',
  trash:     'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  check:     'M4 12.5l5 5L20 6.5',
  sprout:    'M12 21v-7M12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 14c0-3 2-5 5-5 0 3-2 5-5 5z',
  card:      'M2 7h20v10H2zM2 11h20M6 15h3',
  note:      'M6 3h8l4 4v14H6zM14 3v4h4',
  play:      'M8 5l11 7-11 7V5z',
  x:         'M6 6l12 12M18 6L6 18',
  download:  'M12 3v12M7 11l5 5 5-5M4 20h16',
  refresh:   'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  search:    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus:      'M12 5v14M5 12h14',
  minus:     'M5 12h14',
  arrowRight:'M4 12h15M13 6l6 6-6 6',
  logout:    'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  peso:      'M7 20V4h5a4.5 4.5 0 0 1 0 9H7M5 9h10M5 12.5h10',
  message:   'M4 5h16v11H9l-5 4V5zM8 9h8M8 12h5',
  users:     'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 4a3 3 0 0 1 0 6',
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.5 }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
