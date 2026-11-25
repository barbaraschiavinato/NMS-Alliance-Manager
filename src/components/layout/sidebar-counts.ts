// Sidebar counters shared by every Sidebar instance. Each page renders its own Sidebar, so it remounts on every
// navigation: the counters live here instead, and a remount within reuseMs shows them without asking the server again.
// Change events, the periodic refresh and returning to the tab always reload them.
export type SidebarCounts = Readonly<{
  unread: number;
  help: number;
  taxi: number;
  farms: number | null;
  pets: number | null;
}>;

const emptyCounts: SidebarCounts = { unread: 0, help: 0, taxi: 0, farms: null, pets: null };
const reuseMs = 30 * 1000;

let memberId = "";
let counts = emptyCounts;
let loadedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function subscribeSidebarCounts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readSidebarCounts(forMemberId: string): SidebarCounts {
  return forMemberId === memberId ? counts : emptyCounts;
}

export function readServerSidebarCounts(): SidebarCounts {
  return emptyCounts;
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" ? value : fallback;
}

async function fetchCounts(forMemberId: string) {
  try {
    const response = await fetch("/api/sidebar-counts", { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object" || forMemberId !== memberId) return;
    const record = body as Record<string, unknown>;
    // A missing or invalid counter keeps its previous value.
    counts = {
      unread: numberOr(record.unread, counts.unread),
      help: numberOr(record.help, counts.help),
      taxi: numberOr(record.taxi, counts.taxi),
      farms: numberOr(record.farms, counts.farms),
      pets: numberOr(record.pets, counts.pets),
    };
    loadedAt = Date.now();
    for (const listener of listeners) listener();
  } catch {
    // The counters are informational only.
  }
}

export function loadSidebarCounts(forMemberId: string, { force = false }: Readonly<{ force?: boolean }> = {}) {
  if (forMemberId !== memberId) {
    memberId = forMemberId;
    counts = emptyCounts;
    loadedAt = 0;
    pending = null;
  }
  if (!force && (pending || Date.now() - loadedAt < reuseMs)) return pending ?? Promise.resolve();
  const request = fetchCounts(forMemberId).finally(() => {
    if (pending === request) pending = null;
  });
  pending = request;
  return request;
}

export function resetSidebarCounts() {
  memberId = "";
  counts = emptyCounts;
  loadedAt = 0;
  pending = null;
}
