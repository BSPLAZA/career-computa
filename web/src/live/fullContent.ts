// Full artifact content for the signed-in user. The public digestQueue ships a
// 280-char preview; every copy or edit surface swaps in the FULL text via the
// tenant-scoped public.getArtifact query (owner userId, or a brief token for
// the /brief link surface). Contents are cached per artifact id for the session.
import { useEffect, useRef, useState } from 'react';
import { api, convexClient, getMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';

const cache = new Map<string, string>();

// Fetches full content for the given artifact ids (owner-scoped by default,
// brief-token-scoped when briefToken is set). Returns artifactId -> full content;
// ids that are still loading or denied are simply absent, so callers fall back
// to the preview and keep the honest "capped" label.
export function useFullContents(artifactIds: string[], briefToken?: string): Record<string, string> {
  const [, bump] = useState(0);
  const inFlight = useRef(new Set<string>());
  const key = artifactIds.join('|');

  useEffect(() => {
    if (!convexClient) return;
    const myId = getMyUserId();
    const missing = artifactIds.filter(id => !cache.has(id) && !inFlight.current.has(id));
    if (missing.length === 0) return;
    if (!myId && !briefToken) return;
    let cancelled = false;
    for (const id of missing) inFlight.current.add(id);
    (async () => {
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(missing.slice(i, i + 6).map(async id => {
          try {
            const a = await convexClient!.query(api.public.getArtifact, {
              artifactId: id as Id<'artifacts'>,
              ...(myId ? { userId: myId as Id<'users'> } : {}),
              ...(briefToken ? { briefToken } : {}),
            });
            if (a) cache.set(id, a.content);
          } catch {
            // transient failure: preview fallback stays honest, retry next mount
          } finally {
            inFlight.current.delete(id);
          }
        }));
        if (cancelled) return;
        bump(n => n + 1);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, briefToken]);

  const out: Record<string, string> = {};
  for (const id of artifactIds) {
    const c = cache.get(id);
    if (c !== undefined) out[id] = c;
  }
  return out;
}
