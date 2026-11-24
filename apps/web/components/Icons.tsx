// Small stroke icons (24px grid), coloured by currentColor.
const P = (d: string) =>
  function Icon(props: { size?: number }) {
    const s = props.size ?? 22;
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    );
  };

export const IconMenu = P("M4 6h16M4 12h16M4 18h10");
export const IconReceipt = P("M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6");
export const IconStar = P("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z");
export const IconUser = P("M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0");
export const IconTable = P("M3 10h18M5 10v9M19 10v9M7 10l1-5h8l1 5");
export const IconGlass = P("M7 3h10l-1 9a4 4 0 01-8 0L7 3zM12 16v5M8 21h8");
export const IconSearch = P("M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3");
export const IconCheck = P("M5 12l5 5 9-10");
export const IconBell = P("M6 16V11a6 6 0 1112 0v5l2 2H4l2-2zM10 21h4");
export const IconFlame = P("M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z");
export const IconBag = P("M5 8h14l-1 13H6L5 8zM9 8V6a3 3 0 016 0v2");
export const IconCalendar = P("M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z");
