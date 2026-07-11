// Live-mode plumbing. __CONVEX_URL__ is baked at build time from the repo-root
// .convex-url file the convex lane writes. Empty string means mock mode.
import { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';

declare const __CONVEX_URL__: string;

export const CONVEX_URL: string = typeof __CONVEX_URL__ === 'string' ? __CONVEX_URL__ : '';
export const LIVE = CONVEX_URL.length > 0;

export const convexClient = LIVE ? new ConvexReactClient(CONVEX_URL) : null;
export { api };

// This browser's own tenant identity, set when the user signs up here.
const KEY = 'ca.myUserId';
export function getMyUserId(): string | null {
  return localStorage.getItem(KEY);
}
export function setMyUserId(id: string) {
  localStorage.setItem(KEY, id);
}
export function clearMyUserId() {
  localStorage.removeItem(KEY);
}
