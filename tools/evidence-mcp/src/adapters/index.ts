/**
 * Adapter registry.
 *
 * The only entry point discovery uses to reach the network. Adapters are keyed by
 * `AdapterId`, so an id in the config that has no implementation fails loudly here
 * instead of quietly contributing nothing to a run.
 */
import type { Adapter, AdapterId } from "../contracts";
import { ADAPTER_IDS } from "../config";
import { arxivAdapter } from "./arxiv";
import { githubAdapter } from "./github";
import { rssAdapter } from "./rss";

export const adapters: Record<AdapterId, Adapter> = {
  arxiv: arxivAdapter,
  github: githubAdapter,
  rss: rssAdapter,
};

/** Static metadata for docs/UI listing: what each adapter talks to and why. */
export interface AdapterMetadata {
  id: AdapterId;
  label: string;
  /** What one item from this adapter is (a lead, never evidence). */
  produces: string;
  hosts: string[];
  /** True when the adapter reads a credential from the environment. */
  uses_token: boolean;
}

export const staticAdapters: AdapterMetadata[] = [
  {
    id: "arxiv",
    label: arxivAdapter.label,
    produces: "preprint metadata from the arXiv Atom API",
    hosts: ["export.arxiv.org", "arxiv.org"],
    uses_token: false,
  },
  {
    id: "github",
    label: githubAdapter.label,
    produces: "repository metadata from the GitHub repository search API",
    hosts: ["api.github.com", "github.com"],
    uses_token: true,
  },
  {
    id: "rss",
    label: rssAdapter.label,
    produces: "feed entries from configured RSS 2.0 and Atom feeds",
    hosts: [],
    uses_token: false,
  },
];

/** Every adapter id that has an implementation, in config order. */
export function adapterIds(): AdapterId[] {
  return [...ADAPTER_IDS];
}

export function getAdapter(id: AdapterId): Adapter {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`no adapter implementation registered for "${String(id)}"`);
  return adapter;
}

export { arxivAdapter, githubAdapter, rssAdapter };
