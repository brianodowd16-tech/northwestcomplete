const PATHS = {
  arrow: "M5 12h14M13 6l6 6-6 6",
  bag: "M6 8h12l-1 12H7L6 8zM9 8a3 3 0 016 0",
  check: "M5 12l5 5L20 7",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  store: "M4 10l1.5-5h13L20 10M4 10h16v10H4zM9 20v-5h6v5",
  chat: "M4 5h16v11H9l-5 4V5z",
  flame: "M12 3c2 3 5 5 5 9a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  pin: "M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
  wrench: "M14 6a4 4 0 005 5l-8 8a2 2 0 01-3-3l8-8a4 4 0 01-2-2z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
  send: "M4 12l16-8-6 16-2-7-8-1z",
  calendar: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
