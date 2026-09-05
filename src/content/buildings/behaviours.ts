import type { BuildingKind } from '../../core/types';

export type BuildingCategory = 'seat' | 'spawner' | 'sink' | 'modifier' | 'static-defence' | 'frontier';

export interface BuildingBehaviour {
  readonly categories: readonly BuildingCategory[];
  /** The hero behaviour this building creates or changes. */
  readonly changes: string;
  /** The spatial trade-off that makes placement a player decision. */
  readonly placementDecision: string;
  /** The dominant traffic pattern, useful for both AI and map debugging. */
  readonly traffic: string;
}

/**
 * Design metadata, not simulation logic. It keeps the Q1/Q2 test beside the
 * numeric building data so future additions cannot become spreadsheet entries.
 */
export const BUILDING_BEHAVIOURS: Readonly<Record<BuildingKind, BuildingBehaviour>> = {
  palace: {
    categories: ['seat'],
    changes: 'Anchors tax deposits, stipends, Palace progression, and the loss condition.',
    placementDecision: 'Fixed start position defines the logistics network.',
    traffic: 'Tax collectors terminate every deposit route here.',
  },
  warriorsGuild: {
    categories: ['spawner'],
    changes: 'Spawns warriors and gives them a home, heal point, and gold bank.',
    placementDecision: 'Forward placement garrisons danger; rear placement shortens safe tax routes.',
    traffic: 'Heroes radiate from and return here; collectors run Palace–guild loops.',
  },
  roguesGuild: {
    categories: ['spawner'],
    changes: 'Spawns rogues and gives them a home, heal point, and gold bank.',
    placementDecision: 'Forward placement changes where autonomous scouts recover and idle.',
    traffic: 'Heroes radiate from and return here; collectors run Palace–guild loops.',
  },
  rangersLodge: {
    categories: ['spawner'],
    changes: 'Spawns rangers and gives them a home, heal point, and gold bank.',
    placementDecision: 'A frontier lodge turns ranger discovery and response into a local presence.',
    traffic: 'Heroes radiate from and return here; collectors run Palace–guild loops.',
  },
  marketplace: {
    categories: ['sink'],
    changes: 'Wounded heroes buy healing potions; their gold returns to the treasury.',
    placementDecision: 'Front placement shortens a wounded hero’s lifeline but exposes the sink.',
    traffic: 'Frequent, low-value visits biased toward injured heroes.',
  },
  blacksmith: {
    categories: ['sink'],
    changes: 'Healthy, wealthy heroes spend on weapon and armour upgrades.',
    placementDecision: 'Its infrequent, well-defended traffic makes a rear location attractive.',
    traffic: 'Infrequent, high-value visits by stronger heroes.',
  },
  inn: {
    categories: ['sink', 'modifier'],
    changes: 'Heroes rest, recover, and exchange discovered lairs and flags.',
    placementDecision: 'Central placement accelerates knowledge spread; remote placement delays it.',
    traffic: 'The social hub for idle, wounded, and wealthy heroes.',
  },
  guardhouse: {
    categories: ['static-defence'],
    changes: 'Posts two guards who patrol and engage without leaving their eight-tile leash.',
    placementDecision: 'Protect a marketplace road, tax route, or choke point—never all three.',
    traffic: 'Creates none; it shields traffic generated elsewhere.',
  },
};
