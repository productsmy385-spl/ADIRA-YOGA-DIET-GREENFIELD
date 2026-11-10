import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  FileKey,
  FileText,
  Globe,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Salad,
  TrendingUp,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon and one hue per destination — the "colourful domain-specific icons" of the
 * brief. Shared by the sidebar, the drawer and the bottom bar so a destination looks the
 * same wherever it appears.
 *
 * Every class is a token utility from globals.css (`accent-*`), never a Tailwind palette
 * ramp: the previous map used `orange-500`, `pink-600` etc., which bypassed the palette
 * the brief defines.
 */

export type NavTone = "green" | "blue" | "turquoise" | "orange" | "violet" | "pink" | "red";

export interface NavVisual {
  Icon: LucideIcon;
  tone: NavTone;
}

/** Tile paint at rest, and when the destination is the current page. */
export const TONE_CLASSES: Record<NavTone, { rest: string; active: string; ring: string }> = {
  green: {
    rest: "bg-accent-green/14 text-accent-green-ink",
    active: "bg-accent-green text-accent-green-fg",
    ring: "focus-visible:ring-accent-green/50",
  },
  blue: {
    rest: "bg-accent-blue/14 text-accent-blue-ink",
    active: "bg-accent-blue text-accent-blue-fg",
    ring: "focus-visible:ring-accent-blue/50",
  },
  turquoise: {
    rest: "bg-accent-cyan/18 text-accent-cyan-ink",
    active: "bg-accent-cyan text-accent-cyan-fg",
    ring: "focus-visible:ring-accent-cyan/50",
  },
  orange: {
    rest: "bg-accent-orange/16 text-accent-orange-ink",
    active: "bg-accent-orange text-accent-orange-fg",
    ring: "focus-visible:ring-accent-orange/50",
  },
  violet: {
    rest: "bg-accent-violet/16 text-accent-violet-ink",
    active: "bg-accent-violet text-accent-violet-fg",
    ring: "focus-visible:ring-accent-violet/50",
  },
  pink: {
    rest: "bg-accent-pink/16 text-accent-pink-ink",
    active: "bg-accent-pink text-accent-pink-fg",
    ring: "focus-visible:ring-accent-pink/50",
  },
  red: {
    rest: "bg-accent-red/12 text-accent-red-ink",
    active: "bg-accent-red text-accent-red-fg",
    ring: "focus-visible:ring-accent-red/50",
  },
};

const DEFAULT: NavVisual = { Icon: LayoutDashboard, tone: "green" };

const VISUALS: Record<string, NavVisual> = {
  "/admin": DEFAULT,
  "/trainer": DEFAULT,
  "/staff": DEFAULT,
  "/dashboard": DEFAULT,
  "/today": { Icon: CalendarCheck, tone: "green" },
  "/admin/access-requests": { Icon: KeyRound, tone: "blue" },
  "/admin/programmes": { Icon: CalendarPlus, tone: "red" },
  "/admin/yoga": { Icon: Activity, tone: "turquoise" },
  "/admin/sessions": { Icon: CalendarClock, tone: "blue" },
  "/admin/diet": { Icon: Salad, tone: "orange" },
  "/admin/reports": { Icon: FileText, tone: "violet" },
  "/reports": { Icon: FileText, tone: "violet" },
  "/admin/analytics": { Icon: BarChart3, tone: "blue" },
  "/admin/members": { Icon: Users, tone: "pink" },
  "/admin/team": { Icon: UserCog, tone: "violet" },
  "/admin/website": { Icon: Globe, tone: "green" },
  "/progress": { Icon: TrendingUp, tone: "violet" },
  "/notifications": { Icon: Bell, tone: "pink" },
  "/profile": { Icon: User, tone: "blue" },
  "/super-admin": DEFAULT,
  "/super-admin/organizations": { Icon: Building2, tone: "turquoise" },
  "/super-admin/admins": { Icon: FileKey, tone: "violet" },
  "/super-admin/audit": { Icon: Fingerprint, tone: "orange" },
};

export function visualFor(href: string): NavVisual {
  return VISUALS[href] ?? DEFAULT;
}
