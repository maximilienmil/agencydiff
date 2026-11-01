// Every deliberate agency regression in Circle is a named seed. Baseline runs
// with no seeds, candidate with all of them, and the benchmark can switch each
// one on in isolation (?seeds=DM_HIDE_BLOCK) to measure per-seed recall.
// Ground truth for each seed lives in eval/ground_truth.json.
//
// Seeds prefixed LOC/DM/ST/SUB change the cost, visibility, default or success
// of an intent. Seeds prefixed UI are no-change controls: cosmetic tweaks that
// must not move any intent's numbers, so we can measure false alarms.

export const SEEDS = {
  /** Prompt offers "Continue" + "More options"; declining lives one screen deeper. */
  LOC_HIDE_DECLINE: "Decline hidden behind More options",
  /** Precise location starts on before the user has chosen anything. */
  LOC_DEFAULT_ON: "Precise location on by default",
  /** Turning precise location off asks for confirmation with loss framing. */
  LOC_CONFIRM_SHAME: "Confirm-shaming dialog on turning location off",
  /** Location settings move from Settings to Settings > Privacy > Advanced. */
  LOC_BURY_SETTING: "Location setting buried under Privacy > Advanced",
  /** Location settings offer an options screen instead of a direct toggle. */
  LOC_NO_DIRECT_TOGGLE: "Direct location toggle replaced by options screen",
  /** "Block unknown people" hides behind More options on the messages screen. */
  DM_HIDE_BLOCK: "Block-unknown option hidden behind More options",
  /** Messaging a teen defaults to open to everyone instead of friends only. */
  DM_DEFAULT_EVERYONE: "Message audience defaults to everyone",
  /** Messages move from Privacy to Privacy > Advanced. */
  DM_BURY_MESSAGES: "Message setting buried under Privacy > Advanced",
  /** Choosing to block unknown people asks for confirmation with loss framing. */
  DM_CONFIRM_BLOCK: "Confirm-shaming dialog on blocking unknown messages",
  /** What each audience option means appears only after choosing, not before. */
  DM_INFO_AFTER_CHOICE: "Audience explanations shown after commitment",
  /** Removing a screen-time limit hides behind More options on the limit screen. */
  ST_HIDE_REMOVE: "Remove-limit hidden behind More options",
  /** The 1-hour preset disappears; the smallest limit on offer is 2 hours. */
  ST_MIN_LIMIT_2H: "Smallest daily limit raised to 2 hours",
  /** Daily limit moves from Screen Time to Screen Time > More settings. */
  ST_BURY_LIMIT: "Daily limit buried under More settings",
  /** Setting a daily limit asks for confirmation with loss framing. */
  ST_CONFIRM_LIMIT: "Confirm-shaming dialog on setting a daily limit",
  /** Limit presets only select; a separate Save commits the choice. */
  ST_REQUIRE_SAVE: "Limit choice needs an extra Save tap",
  /** Declining Circle+ hides behind More options on the offer screen. */
  SUB_HIDE_DECLINE: "Decline hidden behind More options",
  /** Cancelling moves from Billing to Billing > Manage plan > Other options. */
  SUB_BURY_CANCEL: "Cancel buried under Billing > Manage plan > Other",
  /** The offer preselects the annual plan instead of monthly. */
  SUB_DEFAULT_ANNUAL: "Circle+ plan defaults to annual",
  /** Cancelling routes through a retention offer that must be dismissed. */
  SUB_RETENTION_OFFER: "Retention offer shown before cancelling",
  /** Price and renewal terms appear only after subscribing, not before. */
  SUB_TERMS_AFTER_CHECKOUT: "Renewal terms shown after commitment",
  /** Control: reworded headings and buttons, same layout and tags. */
  UI_COPY_TWEAK: "Control: copy tweak",
  /** Control: teal accent instead of blue. */
  UI_ACCENT: "Control: accent colour",
  /** Control: settings rows in a different order, same screens and taps. */
  UI_REORDER_SETTINGS: "Control: settings order",
  /** Control: feed posts in reverse order. */
  UI_FEED_SHUFFLE: "Control: feed order",
  /** Control: reworded privacy rows, same destinations. */
  UI_PRIVACY_COPY: "Control: privacy copy",
  /** Control: an extra Appearance row that leads nowhere agency-relevant. */
  UI_EXTRA_ROW: "Control: extra settings row",
} as const;

export type SeedId = keyof typeof SEEDS;

export function activeSeeds(params: URLSearchParams): Set<SeedId> {
  const explicit = params.get("seeds");
  if (explicit !== null) {
    return new Set(explicit.split(",").filter((s): s is SeedId => s in SEEDS));
  }
  return params.get("variant") === "candidate"
    ? new Set(Object.keys(SEEDS) as SeedId[])
    : new Set();
}
