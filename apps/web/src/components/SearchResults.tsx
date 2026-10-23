"use client";

import Link from "next/link";
import { Post, PostCard, PostCardSkeleton } from "./PostCard";
import { Profile, ProfileCard } from "./ProfileCard";

type ResultTab = "posts" | "profiles";

interface SearchResultsProps {
  tab: ResultTab;
  query: string;
  posts?: Post[];
  profiles?: Profile[];
  loading?: boolean;
  error?: string | null;
}

/**
 * SearchResults — renders search hits for posts or profiles.
 *
 * All colours use CSS custom property tokens (var(--foreground), etc.) so the
 * component responds correctly to both light and dark themes without any
 * hardcoded colour values.
 */
export function SearchResults({
  tab,
  query,
  posts = [],
  profiles = [],
  loading = false,
  error = null,
}: SearchResultsProps) {
  const hasQuery = query.trim().length > 0;
  const hasPostResults = posts.length > 0;
  const hasProfileResults = profiles.length > 0;

  if (!hasQuery) {
    return null;
  }

  if (error) {
    return (
      <div
        className="rounded-xl border border-[var(--color-error)]/50 bg-[var(--color-error-light)]/20 px-5 py-4 text-sm text-[var(--color-error)]"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (tab === "posts") {
    return (
      <div className="space-y-4" aria-live="polite" aria-label="Post search results">
        {loading &&
          Array.from({ length: 5 }, (_, i) => <PostCardSkeleton key={i} />)}

        {!loading && hasPostResults &&
          posts.map((post) => (
            <div key={post.id}>
              <PostCard post={post} query={query} />
              <Link href={`/posts/${post.id}`} className="sr-only">
                View post by {post.username ?? post.author}
              </Link>
            </div>
          ))}

        {!loading && !hasPostResults && (
          <EmptyState query={query} kind="posts" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite" aria-label="Profile search results">
      {loading && (
        <ProfileListSkeleton />
      )}

        {!loading && hasProfileResults &&
        profiles.map((profile) => (
          <div key={profile.address}>
            <ProfileCard profile={profile} />
            <Link href={`/profile/${profile.address}`} className="sr-only">
              View profile {profile.username ?? profile.address}
            </Link>
          </div>
        ))}

      {!loading && !hasProfileResults && (
        <EmptyState query={query} kind="profiles" />
      )}
    </div>
  );
}

function EmptyState({ query, kind }: { query: string; kind: "posts" | "profiles" }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] px-6 py-12 text-center">
      <p className="text-sm text-[var(--text-muted)]">
        No {kind} found for &ldquo;{query}&rdquo;.
      </p>
    </div>
  );
}

/** Profile list skeleton — matches approximate ProfileCard dimensions to avoid CLS. */
function ProfileListSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading profiles">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4"
        >
          {/* Avatar */}
          <div className="h-12 w-12 shrink-0 rounded-full bg-[var(--bg-tertiary)]" />
          {/* Text lines */}
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-[var(--bg-tertiary)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--bg-tertiary)]" />
            <div className="h-3 w-1/4 rounded bg-[var(--bg-tertiary)]" />
          </div>
          {/* Follow button placeholder */}
          <div className="h-9 w-24 shrink-0 rounded-lg bg-[var(--bg-tertiary)]" />
        </div>
      ))}
    </div>
  );
}
