/**
 * The previous UI used hash URLs (#/requests/12). Convert such an address to a real path once, so
 * old bookmarks and shared links keep working.
 */
export function legacyHashToPath(hash: string): string | null {
  const m = /^#\/(requests(?:\/(?:new|\d+))?|import|analytics|users)\/?$/.exec(hash);
  if (!m) return null;
  return `/${m[1] === "import" ? "imports" : m[1]}`;
}

export function migrateLegacyHash(): void {
  const path = legacyHashToPath(window.location.hash);
  if (path) window.history.replaceState(null, "", path);
}
