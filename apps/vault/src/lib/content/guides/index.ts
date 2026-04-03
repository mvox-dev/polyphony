// Guide metadata and content registry
// Guides are imported as raw markdown strings via Vite's ?raw suffix

import singerEt from "./singer-et.md?raw";
import singerLv from "./singer-lv.md?raw";
import conductorEt from "./conductor-et.md?raw";
import conductorLv from "./conductor-lv.md?raw";
import librarianEt from "./librarian-et.md?raw";
import librarianLv from "./librarian-lv.md?raw";
import sectionLeaderEt from "./section-leader-et.md?raw";
import sectionLeaderLv from "./section-leader-lv.md?raw";
import adminEt from "./admin-et.md?raw";
import adminLv from "./admin-lv.md?raw";

export interface GuideInfo {
  slug: string;
  /** Roles that should see this guide. Empty = everyone (singer guide). */
  roles: string[];
  titles: Record<string, string>;
  descriptions: Record<string, string>;
  content: Record<string, string>;
  /** Icon emoji for the guide card */
  icon: string;
  /** Display order */
  order: number;
}

export const guides: GuideInfo[] = [
  {
    slug: "singer",
    roles: [], // Everyone sees this
    titles: {
      et: "Laulja teejuht",
      en: "Singer Guide",
      lv: "Dziedātāja rokasgrāmata",
    },
    descriptions: {
      et: "Juhend koorilauljale igapäevaseks kasutamiseks",
      en: "Daily usage guide for choir singers",
      lv: "Rokasgrāmata koristam ikdienas lietošanai",
    },
    content: {
      et: singerEt,
      lv: singerLv,
    },
    icon: "🎵",
    order: 1,
  },
  {
    slug: "conductor",
    roles: ["conductor"],
    titles: {
      et: "Dirigendi teejuht",
      en: "Conductor Guide",
      lv: "Diriģenta rokasgrāmata",
    },
    descriptions: {
      et: "Juhend proovide ja kontsertide haldamiseks",
      en: "Guide for managing rehearsals and concerts",
      lv: "Rokasgrāmata mēģinājumu un koncertu pārvaldīšanai",
    },
    content: {
      et: conductorEt,
      lv: conductorLv,
    },
    icon: "🎼",
    order: 2,
  },
  {
    slug: "librarian",
    roles: ["librarian"],
    titles: {
      et: "Raamatukoguhoidja teejuht",
      en: "Librarian Guide",
      lv: "Bibliotekāra rokasgrāmata",
    },
    descriptions: {
      et: "Juhend noodikogu haldamiseks ja korrashoiuks",
      en: "Guide for managing and maintaining the score library",
      lv: "Rokasgrāmata nošu krājuma pārvaldīšanai un uzturēšanai",
    },
    content: {
      et: librarianEt,
      lv: librarianLv,
    },
    icon: "📚",
    order: 3,
  },
  {
    slug: "section-leader",
    roles: ["section_leader"],
    titles: {
      et: "Häälerühma vanema teejuht",
      en: "Section Leader Guide",
      lv: "Balsu grupas vadītāja rokasgrāmata",
    },
    descriptions: {
      et: "Juhend rühmavanemale kohaloleku märkimiseks",
      en: "Guide for section leaders on attendance marking",
      lv: "Rokasgrāmata apmeklējuma atzīmēšanai",
    },
    content: {
      et: sectionLeaderEt,
      lv: sectionLeaderLv,
    },
    icon: "👥",
    order: 4,
  },
  {
    slug: "admin",
    roles: ["admin", "owner"],
    titles: {
      et: "Administraatori teejuht",
      en: "Admin Guide",
      lv: "Administratora rokasgrāmata",
    },
    descriptions: {
      et: "Ülevaade rollidest ja õigustest — kes mida teha saab",
      en: "Overview of roles and permissions — who can do what",
      lv: "Pārskats par lomām un tiesībām — kurš ko var darīt",
    },
    content: {
      et: adminEt,
      lv: adminLv,
    },
    icon: "⚙️",
    order: 5,
  },
];

export function getGuideBySlug(slug: string): GuideInfo | undefined {
  return guides.find((g) => g.slug === slug);
}

/**
 * Get guides relevant to a member's roles.
 * The singer guide is always included.
 * If no roles provided (not logged in), show all guides.
 */
export function getGuidesForRoles(roles?: string[]): GuideInfo[] {
  if (!roles || roles.length === 0) {
    return [...guides].sort((a, b) => a.order - b.order);
  }

  return guides
    .filter((g) => {
      // Singer guide = always shown
      if (g.roles.length === 0) return true;
      // Owner sees everything
      if (roles.includes("owner")) return true;
      // Show if any of the member's roles matches
      return g.roles.some((r) => roles.includes(r));
    })
    .sort((a, b) => a.order - b.order);
}
