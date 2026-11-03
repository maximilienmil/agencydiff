// Line icons for Circle: 24px grid, 2px rounded strokes, drawn in currentColor.

const PATHS: Record<string, string[]> = {
  back: ["M15 5l-7 7 7 7"],
  chevron: ["M9 6l6 6-6 6"],
  settings: [
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
    "M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.4h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z",
  ],
  pin: ["M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z", "M12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20.5a7.5 7.5 0 0 1 15 0"],
  bell: ["M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  lock: ["M6.5 10.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"],
  hourglass: ["M7 3.5h10", "M7 20.5h10", "M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5", "M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5"],
  sparkle: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6", "M12 17h.01"],
  sun: ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2.5v2", "M12 19.5v2", "M4.6 4.6l1.4 1.4", "M18 18l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.6 19.4L6 18", "M18 6l1.4-1.4"],
  heart: ["M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"],
  comment: ["M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.4-4.6A8 8 0 1 1 20.5 11.5z"],
  share: ["M21 3.5L10.5 13.5", "M21 3.5l-6.5 17-4-7-7-4z"],
  bookmark: ["M6.5 3.5h11v17l-5.5-4-5.5 4z"],
  dots: ["M5.5 12h.01", "M12 12h.01", "M18.5 12h.01"],
};

export function Icon({ name }: { name: keyof typeof PATHS | string }) {
  const paths = PATHS[name] ?? [];
  const bold = name === "dots";
  return (
    <svg
      className={`ic ic-${name}`}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={bold ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Leading icon and tint for top-level settings rows, keyed by row label. */
export const ROW_ICONS: Record<string, { icon: string; tone: string }> = {
  Account: { icon: "user", tone: "blue" },
  Notifications: { icon: "bell", tone: "red" },
  Privacy: { icon: "lock", tone: "navy" },
  "Messaging & privacy": { icon: "lock", tone: "navy" },
  Location: { icon: "pin", tone: "green" },
  "Screen Time": { icon: "hourglass", tone: "violet" },
  "Circle+": { icon: "sparkle", tone: "plus" },
  Appearance: { icon: "sun", tone: "amber" },
  Help: { icon: "help", tone: "slate" },
};
