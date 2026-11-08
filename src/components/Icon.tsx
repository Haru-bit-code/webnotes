// Small stroke icon set (24px grid, 1.6 stroke) so the chrome doesn't rely on emoji.
const P: Record<string, React.ReactNode> = {
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  list: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  left: <path d="M15 5l-7 7 7 7" />, right: <path d="M9 5l7 7-7 7" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  pin: <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5z" />,
  device: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  pen: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M10 6l-6 6 6 6M4 12h16" />,
};

export function Icon({ name, className = "" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg className={`ico ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
