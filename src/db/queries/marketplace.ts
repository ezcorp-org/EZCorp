import { eq, desc, sql, and, ilike, or } from "drizzle-orm";
import { getDb } from "../connection";
import { marketplaceListings } from "../schema";
import type { MarketplaceListing } from "../schema";
import { generateSlug } from "../../extensions/manifest";

export type { MarketplaceListing };

export interface CreateListingData {
  authorId: string;
  agentConfigId?: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  latestVersion: string;
}

export async function createListing(data: CreateListingData): Promise<MarketplaceListing> {
  const slug = generateSlug(data.name);
  const row = {
    authorId: data.authorId,
    agentConfigId: data.agentConfigId ?? null,
    name: data.name,
    description: data.description,
    slug,
    category: data.category,
    tags: data.tags,
    latestVersion: data.latestVersion,
  };

  const [listing] = await getDb().insert(marketplaceListings).values(row).returning();
  return listing!;
}

export async function getListingById(id: string): Promise<MarketplaceListing | undefined> {
  const [listing] = await getDb()
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.id, id), sql`${marketplaceListings.status} != 'removed'`));
  return listing;
}

export async function getListingBySlug(slug: string): Promise<MarketplaceListing | undefined> {
  const [listing] = await getDb()
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.slug, slug), sql`${marketplaceListings.status} != 'removed'`));
  return listing;
}

export interface BrowseOptions {
  query?: string;
  category?: string;
  tag?: string;
  sort?: "rating" | "popular" | "newest";
  limit?: number;
  offset?: number;
}

export async function browseMarketplace(opts: BrowseOptions): Promise<MarketplaceListing[]> {
  const conditions = [eq(marketplaceListings.status, "active")];

  if (opts.category) {
    conditions.push(eq(marketplaceListings.category, opts.category));
  }

  if (opts.query) {
    const pattern = `%${opts.query}%`;
    conditions.push(
      or(
        ilike(marketplaceListings.name, pattern),
        ilike(marketplaceListings.description, pattern),
      )!,
    );
  }

  if (opts.tag) {
    conditions.push(sql`${marketplaceListings.tags} @> ${JSON.stringify([opts.tag])}::jsonb`);
  }

  let orderBy;
  switch (opts.sort) {
    case "popular":
      orderBy = desc(marketplaceListings.installCount);
      break;
    case "rating":
      orderBy = sql`(${marketplaceListings.ratingPositive} * 100) / (${marketplaceListings.ratingTotal} + 1) DESC`;
      break;
    default:
      orderBy = desc(marketplaceListings.createdAt);
      break;
  }

  return getDb()
    .select()
    .from(marketplaceListings)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(opts.limit ?? 20)
    .offset(opts.offset ?? 0);
}

export async function deleteListing(id: string): Promise<boolean> {
  const result = await getDb()
    .delete(marketplaceListings)
    .where(eq(marketplaceListings.id, id))
    .returning({ id: marketplaceListings.id });
  return result.length > 0;
}

export async function updateListingStatus(id: string, status: "active" | "flagged" | "removed"): Promise<void> {
  await getDb()
    .update(marketplaceListings)
    .set({ status, updatedAt: new Date() })
    .where(eq(marketplaceListings.id, id));
}

export async function incrementInstallCount(id: string): Promise<void> {
  await getDb()
    .update(marketplaceListings)
    .set({
      installCount: sql`${marketplaceListings.installCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceListings.id, id));
}

export async function getListingsByAuthor(authorId: string): Promise<MarketplaceListing[]> {
  return getDb()
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.authorId, authorId))
    .orderBy(desc(marketplaceListings.createdAt));
}

export async function getFeaturedListings(limit = 6): Promise<MarketplaceListing[]> {
  return getDb()
    .select()
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.status, "active")))
    .orderBy(desc(marketplaceListings.featured), desc(marketplaceListings.installCount))
    .limit(limit);
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Phase 49.3 — aggregate active-listing tag counts for the marketplace
 * category sidebar. Results are sorted by descending count, then tag
 * name asc so the chip order is stable across requests.
 *
 * Uses Postgres' `jsonb_array_elements_text` to unnest the `tags`
 * array column. Cheaper than pulling every row's tags into the app
 * and counting in JS — the SQL engine groups + sorts in one pass and
 * we ship only the aggregate.
 *
 * Aggregation source: `marketplace_listings` ONLY. Installed-extension
 * `manifest.tags` are deliberately excluded — categories filter the
 * public marketplace, and installed extensions don't appear there.
 * Including installed-only tags would surface chips that match zero
 * listings (misleading UX). v1.5 may add a separate "My installed
 * extensions" tag filter on the Installed tab if user research
 * validates the need. Spec §49.3.1 mentioned aggregating both sources,
 * but that wording was loose — the implementation is intentionally
 * marketplace-only.
 */
export async function getMarketplaceTagCounts(): Promise<TagCount[]> {
  const rows = await getDb().execute(
    sql`
      SELECT tag, COUNT(*)::int AS count
      FROM ${marketplaceListings},
           jsonb_array_elements_text(${marketplaceListings.tags}) AS tag
      WHERE ${marketplaceListings.status} = 'active'
      GROUP BY tag
      ORDER BY count DESC, tag ASC
    `,
  );
  // PGlite occasionally returns COUNT as a string — coerce defensively.
  // Drizzle's `execute()` returns either an array (postgres-js) or
  // `{ rows: [...] }` (PGlite); normalise so the caller always gets a
  // flat array. Cast through `unknown` because the return type from
  // `execute()` varies by adapter.
  type Row = { tag: string; count: string | number };
  const result = rows as unknown as Row[] | { rows: Row[] };
  const list: Row[] = Array.isArray(result) ? result : (result.rows ?? []);
  return list.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
