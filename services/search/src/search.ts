import type { Pool } from "pg";
import { calculatePostRank, calculateProfileRank } from "./ranking";

export interface SearchResult {
  id: string;
  type: "profile" | "post";
  /** Stellar address for profiles, post ID for posts. */
  ref: string;
  /** Username for profiles or a short excerpt for posts. */
  title: string;
  snippet: string | null;
  rank: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CANDIDATE_MULTIPLIER = 5;

function safeLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

interface ProfileRow {
  address: string;
  username: string;
  rank: number;
  reputation_score: number;
}

interface PostRow {
  id: string;
  content: string;
  created_at: Date | string;
  like_count: number;
  tip_total: number;
  rank: number;
}

async function findProfiles(pool: Pool, query: string, limit: number): Promise<SearchResult[]> {
  const { rows } = await pool.query<ProfileRow>(
    `SELECT p.address,
            p.username,
            ts_rank(to_tsvector('english', COALESCE(p.username, '')),
                    websearch_to_tsquery('english', $1)) AS rank,
            COALESCE(r.score, 0)::int AS reputation_score
       FROM profiles AS p
       LEFT JOIN reputation_scores AS r ON r.user_address = p.address
      WHERE to_tsvector('english', COALESCE(p.username, ''))
            @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, p.address ASC
      LIMIT $2`,
    [query, limit * CANDIDATE_MULTIPLIER]
  );

  return rows.map((row) => ({
    id: row.address,
    type: "profile",
    ref: row.address,
    title: row.username,
    snippet: null,
    rank: calculateProfileRank(
      { address: row.address, username: row.username, bio: "", reputationScore: row.reputation_score, tsRank: Number(row.rank) },
      query
    ),
  }));
}

async function findPosts(pool: Pool, query: string, limit: number): Promise<SearchResult[]> {
  const now = new Date();
  const { rows } = await pool.query<PostRow>(
    `SELECT p.id::text AS id,
            p.content,
            p.created_at,
            p.like_count,
            p.tip_total,
            ts_rank(to_tsvector('english', COALESCE(p.content, '')),
                    websearch_to_tsquery('english', $1)) AS rank
       FROM posts AS p
      WHERE p.deleted_at IS NULL
        AND to_tsvector('english', COALESCE(p.content, ''))
            @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC, p.created_at DESC, p.id ASC
      LIMIT $2`,
    [query, limit * CANDIDATE_MULTIPLIER]
  );

  return rows.map((row) => ({
    id: row.id,
    type: "post",
    ref: row.id,
    title: row.content.slice(0, 80),
    snippet: row.content.slice(0, 160),
    rank: calculatePostRank(
      {
        id: row.id,
        author: "",
        content: row.content,
        createdAt: row.created_at,
        likesCount: Number(row.like_count),
        tipsTotal: Number(row.tip_total) / 1_000_000,
        tsRank: Number(row.rank),
      },
      now
    ),
  }));
}

function compareResults(a: SearchResult, b: SearchResult): number {
  return b.rank - a.rank || a.type.localeCompare(b.type) || a.ref.localeCompare(b.ref);
}

/** Search both profiles and posts, then apply the deterministic composite ranking. */
export async function searchAll(pool: Pool, query: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const boundedLimit = safeLimit(limit);
  const [profiles, posts] = await Promise.all([
    findProfiles(pool, query, boundedLimit),
    findPosts(pool, query, boundedLimit),
  ]);
  return [...profiles, ...posts].sort(compareResults).slice(0, boundedLimit);
}

/** Full-text search limited to profiles. */
export async function searchProfiles(
  pool: Pool,
  query: string,
  limit = DEFAULT_LIMIT
): Promise<SearchResult[]> {
  return (await findProfiles(pool, query, safeLimit(limit))).sort(compareResults).slice(0, safeLimit(limit));
}

/** Full-text search limited to posts. */
export async function searchPosts(
  pool: Pool,
  query: string,
  limit = DEFAULT_LIMIT
): Promise<SearchResult[]> {
  return (await findPosts(pool, query, safeLimit(limit))).sort(compareResults).slice(0, safeLimit(limit));
}
