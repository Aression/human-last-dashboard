import type {
  Assessment,
  Attribution,
  Capability,
  Claim,
  Dataset,
  Evidence,
  Forecast,
  ObservedEvent,
  OpenQuestion,
  Source,
} from "./types";
import zhOverlay from "../data/i18n/records.zh.json";
import zhCapabilities from "../data/i18n/capabilities.zh.json";

/**
 * Translating record text without translating quotations.
 *
 * The record types carry authored prose (`statement`, `observation`,
 * `rationale`, …). A Chinese interface needs that prose in Chinese, but it must
 * never touch `Claim.source_span`: a quotation belongs to the document it was
 * taken from, and rewriting it would break the one field a reader can check
 * against the source. So translations live in a side file keyed by record id
 * (`data/i18n/records.zh.json`) and are applied as an overlay, field by field,
 * instead of becoming localized fields on the record types themselves.
 *
 * Consequences that are deliberate:
 * - A record with no translation renders in English. A missing translation is
 *   visible, not silently invented.
 * - The overlay cannot add or remove records, and cannot rename ids, so the
 *   English and Chinese views always describe the same dataset.
 * - The overlay is checked against the dataset at module load: an entry whose
 *   id no longer exists, or whose field the type does not have, fails the build
 *   rather than quietly disappearing.
 */

export type RecordLocale = "en" | "zh";

/** One translated collection: record id → field → text (or list of texts). */
type FieldText = string | readonly string[];
type OverlaySection = Record<string, Record<string, FieldText>>;

interface OverlayFile {
  note?: string;
  locale?: string;
  sources?: OverlaySection;
  claims?: OverlaySection;
  evidence?: OverlaySection;
  assessments?: OverlaySection;
  events?: OverlaySection;
  attributions?: OverlaySection;
  forecasts?: OverlaySection;
  questions?: OverlaySection;
}

const OVERLAY: OverlayFile = zhOverlay as OverlayFile;

/** Which dataset collection each overlay section applies to. */
const SECTIONS = [
  "sources",
  "claims",
  "evidence",
  "assessments",
  "events",
  "attributions",
  "forecasts",
  "questions",
] as const;

type Section = (typeof SECTIONS)[number];

/**
 * The capability taxonomy's translated fields.
 *
 * Capabilities are not a `SECTIONS` entry: their criteria are keyed by criterion
 * id rather than by record id, and `nonCriteria` is an order-matched array with
 * no flat-field equivalent. Keeping them out of `SECTIONS` also keeps
 * `overlaySummary()` a statement about records only.
 */
export interface CapabilityOverlayEntry {
  name?: string;
  description?: string;
  /** Order-matched with the capability's English `nonCriteria`. */
  nonCriteria?: string[];
  /** Order-matched with the capability's English `knownBottlenecks`. */
  knownBottlenecks?: string[];
}

export interface CapabilityOverlayFile {
  note?: string;
  locale?: string;
  capabilities?: Record<string, CapabilityOverlayEntry>;
  criteria?: Record<string, { text?: string }>;
}

const CAPABILITY_OVERLAY = zhCapabilities as CapabilityOverlayFile;

/** Fields a capability entry may translate; anything else is a typo. */
const CAPABILITY_FIELDS = ["name", "description", "nonCriteria", "knownBottlenecks"];

/** The record fields a section is allowed to translate. */
const TRANSLATABLE: Record<Section, readonly string[]> = {
  sources: ["title"],
  claims: ["statement"],
  evidence: ["observation", "limitations"],
  assessments: ["rationale", "conditions", "limitations"],
  events: ["title", "description"],
  attributions: [
    "hypothesis",
    "mechanism",
    "alternatives",
    "discriminating_tests",
  ],
  forecasts: ["statement", "resolution_criteria", "rationale"],
  questions: ["question", "blocking"],
};

type AnyRecord = Record<string, unknown> & { id: string };

function collectionOf(dataset: Dataset, section: Section): AnyRecord[] {
  return dataset[section] as unknown as AnyRecord[];
}

/**
 * Check the overlay against the dataset it will be applied to.
 *
 * Returns one message per problem instead of throwing, so both the CLI and the
 * build gate can report every broken entry at once.
 */
export function validateOverlay(dataset: Dataset): string[] {
  const problems: string[] = [];

  for (const section of SECTIONS) {
    const overlay = OVERLAY[section];
    if (!overlay) continue;

    const byId = new Map(collectionOf(dataset, section).map((r) => [r.id, r]));
    const allowed = TRANSLATABLE[section];

    for (const [id, fields] of Object.entries(overlay)) {
      const record = byId.get(id);
      if (!record) {
        problems.push(
          `data/i18n/records.zh.json: ${section}.${id} has no such record in the dataset`,
        );
        continue;
      }
      for (const [field, text] of Object.entries(fields)) {
        if (!allowed.includes(field)) {
          problems.push(
            `data/i18n/records.zh.json: ${section}.${id}.${field} is not a translatable field (allowed: ${allowed.join(", ")})`,
          );
          continue;
        }
        if (typeof text === "string") {
          if (text.trim() === "") {
            problems.push(
              `data/i18n/records.zh.json: ${section}.${id}.${field} is an empty translation`,
            );
          }
        } else if (!Array.isArray(text) || text.some((t) => typeof t !== "string")) {
          problems.push(
            `data/i18n/records.zh.json: ${section}.${id}.${field} must be a string or a list of strings`,
          );
        }
      }
    }
  }

  problems.push(...validateCapabilityOverlay(dataset));

  return problems;
}

/**
 * Check the capability overlay against the taxonomy carried by `dataset`.
 *
 * Capabilities are validated separately from the record sections: criteria are
 * keyed by criterion id, and the order-matched `nonCriteria` array has no
 * flat-field equivalent. Coverage is required rather than optional — the
 * taxonomy is small, and a missing entry would leave a Chinese reader with an
 * English stage definition next to a translated one.
 */
export function validateCapabilityOverlay(
  dataset: Dataset,
  overlay: CapabilityOverlayFile = CAPABILITY_OVERLAY,
): string[] {
  const problems: string[] = [];
  const where = "data/i18n/capabilities.zh.json";

  const capabilities = Array.isArray(dataset.capabilities)
    ? dataset.capabilities
    : [];
  const entries = overlay.capabilities ?? {};
  const criteria = overlay.criteria ?? {};

  const known = new Set(capabilities.map((c) => c.id));
  for (const id of Object.keys(entries)) {
    if (!known.has(id)) {
      problems.push(`${where}: capabilities.${id} has no such record in the dataset`);
    }
  }

  const knownCriteria = new Set(
    capabilities.flatMap((c) => c.criteria.map((k) => k.id)),
  );
  for (const id of Object.keys(criteria)) {
    if (!knownCriteria.has(id)) {
      problems.push(
        `${where}: criteria.${id} has no such record in the dataset (no criterion with that id)`,
      );
    }
  }

  for (const capability of capabilities) {
    const entry = entries[capability.id];
    if (!entry) {
      problems.push(
        `${where}: capabilities.${capability.id} is missing (it has ${capability.criteria.length} criteria in the data)`,
      );
      continue;
    }

    for (const field of ["name", "description"] as const) {
      const text = entry[field];
      if (typeof text !== "string" || text.trim() === "") {
        problems.push(
          `${where}: capabilities.${capability.id}.${field} is missing or empty`,
        );
      }
    }

    const nonCriteria = entry.nonCriteria;
    if (!Array.isArray(nonCriteria)) {
      problems.push(
        `${where}: capabilities.${capability.id}.nonCriteria must be a list of strings`,
      );
    } else {
      if (nonCriteria.length !== capability.nonCriteria.length) {
        problems.push(
          `${where}: capabilities.${capability.id}.nonCriteria has ${nonCriteria.length} entries but the capability has ${capability.nonCriteria.length}; the array is order-matched, so the count must match`,
        );
      }
      if (nonCriteria.some((text) => typeof text !== "string" || text.trim() === "")) {
        problems.push(
          `${where}: capabilities.${capability.id}.nonCriteria contains a non-string or empty translation`,
        );
      }
    }

    const bottlenecks = entry.knownBottlenecks;
    if (bottlenecks !== undefined) {
      if (!Array.isArray(bottlenecks)) {
        problems.push(
          `${where}: capabilities.${capability.id}.knownBottlenecks must be a list of strings`,
        );
      } else {
        if (bottlenecks.length !== capability.knownBottlenecks.length) {
          problems.push(
            `${where}: capabilities.${capability.id}.knownBottlenecks has ${bottlenecks.length} entries but the capability has ${capability.knownBottlenecks.length}; the array is order-matched, so the count must match`,
          );
        }
        if (bottlenecks.some((text) => typeof text !== "string" || text.trim() === "")) {
          problems.push(
            `${where}: capabilities.${capability.id}.knownBottlenecks contains a non-string or empty translation`,
          );
        }
      }
    }

    for (const criterion of capability.criteria) {
      const text = criteria[criterion.id]?.text;
      if (typeof text !== "string" || text.trim() === "") {
        problems.push(`${where}: criteria.${criterion.id}.text is missing or empty`);
      }
    }
  }

  for (const [id, entry] of Object.entries(entries)) {
    for (const field of Object.keys(entry)) {
      if (!CAPABILITY_FIELDS.includes(field)) {
        problems.push(
          `${where}: capabilities.${id}.${field} is not a translatable field (allowed: ${CAPABILITY_FIELDS.join(", ")})`,
        );
      }
    }
  }
  for (const [id, entry] of Object.entries(criteria)) {
    for (const field of Object.keys(entry)) {
      if (field !== "text") {
        problems.push(
          `${where}: criteria.${id}.${field} is not a translatable field (allowed: text)`,
        );
      }
    }
  }

  return problems;
}

export function assertValidOverlay(dataset: Dataset): void {
  const problems = validateOverlay(dataset);
  if (problems.length > 0) {
    throw new Error(
      `Chinese translation overlay is out of date (${problems.length} problem(s)):\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
  }
}

/**
 * Apply the overlay for `locale`.
 *
 * `en` returns the dataset unchanged (same object), so the English site keeps
 * rendering the published records with no copy of them.
 */
export function localizeDataset<T extends Dataset>(
  dataset: T,
  locale: RecordLocale,
): T {
  if (locale === "en") return dataset;

  const localized = { ...dataset } as Record<string, unknown>;

  for (const section of SECTIONS) {
    const overlay = OVERLAY[section];
    if (!overlay) continue;

    const records = collectionOf(dataset, section);
    localized[section] = records.map((record) => {
      const fields = overlay[record.id];
      if (!fields) return record;
      // Only allowed fields reach here: `validateOverlay` rejects the rest.
      return { ...record, ...fields } as AnyRecord;
    });
  }

  if (Array.isArray(dataset.capabilities)) {
    localized.capabilities = applyCapabilityOverlay(dataset.capabilities);
  }

  return localized as T;
}

/**
 * Apply the capability overlay: name, description, each criterion text, and the
 * order-matched `nonCriteria`. Ids, levels and numbers are carried over as-is.
 */
function applyCapabilityOverlay(capabilities: Capability[]): Capability[] {
  const entries = CAPABILITY_OVERLAY.capabilities ?? {};
  const criteria = CAPABILITY_OVERLAY.criteria ?? {};

  return capabilities.map((capability) => {
    const entry = entries[capability.id];
    if (!entry) return capability;

    return {
      ...capability,
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.nonCriteria ? { nonCriteria: [...entry.nonCriteria] } : {}),
      ...(entry.knownBottlenecks ? { knownBottlenecks: [...entry.knownBottlenecks] } : {}),
      criteria: capability.criteria.map((criterion) => {
        const text = criteria[criterion.id]?.text;
        return text ? { ...criterion, text } : criterion;
      }),
    };
  });
}

/** True when the overlay translates this record — used by tests and tooling. */
export function hasTranslation(section: Section, id: string): boolean {
  return Boolean(OVERLAY[section]?.[id]);
}

/** Counts per section, for the validation summary line. */
export function overlaySummary(): { section: Section; translated: number }[] {
  return SECTIONS.map((section) => ({
    section,
    translated: Object.keys(OVERLAY[section] ?? {}).length,
  }));
}

export type {
  Assessment,
  Attribution,
  Claim,
  Evidence,
  Forecast,
  ObservedEvent,
  OpenQuestion,
  Source,
};
