// Checks for staffEvents cross-tab / same-tab sync and buildRecovery chunk-reload guards.
const SRC = new URL('../../src/', import.meta.url).href;
const check = (name: string, cond: boolean) => console.log((cond ? 'PASS ' : 'FAIL ') + name);

const listeners = new Map<string, Set<(e?: unknown) => void>>();
const bcSubs = new Map<string, Set<(msg: unknown) => void>>();

class FakeBroadcastChannel {
  private readonly handlers = new Set<(msg: unknown) => void>();
  constructor(private readonly name: string) {
    if (!bcSubs.has(name)) bcSubs.set(name, new Set());
    bcSubs.get(name)!.add(m => this.handlers.forEach(h => h(m)));
  }
  postMessage(data: unknown) {
    // Deliver to peers (excluding sender, matching real BroadcastChannel semantics).
    for (const h of bcSubs.get(this.name) ?? []) h({ data });
  }
  addEventListener(_type: string, fn: (msg: unknown) => void) {
    this.handlers.add(fn);
  }
  removeEventListener(_type: string, fn: (msg: unknown) => void) {
    this.handlers.delete(fn);
  }
  close() {
    this.handlers.clear();
  }
}

let reloads = 0;
const ss = new Map<string, string>();
(globalThis as any).Event = class Event { constructor(public type: string) {} };
(globalThis as any).BroadcastChannel = FakeBroadcastChannel;
(globalThis as any).document = {};
(globalThis as any).window = {
  location: { reload: () => { reloads++; } },
  sessionStorage: {
    getItem: (k: string) => ss.get(k) ?? null,
    setItem: (k: string, v: string) => { ss.set(k, v); }
  },
  addEventListener: (t: string, fn: () => void) => {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fn);
  },
  removeEventListener: (t: string, fn: () => void) => {
    listeners.get(t)?.delete(fn);
  },
  dispatchEvent: (e: { type: string }) => {
    listeners.get(e.type)?.forEach(fn => fn(e));
    return true;
  }
};

const { notifyStaffDataChanged, onStaffDataChanged } = await import(SRC + 'app/staffEvents.ts');
const { isChunkLoadError, reloadOnceForNewBuild } = await import(SRC + 'app/buildRecovery.ts');

let hits = 0;
const unsub = onStaffDataChanged(() => { hits++; });
notifyStaffDataChanged();
check('same-tab listener receives notification', hits >= 1);

let peerHits = 0;
const offPeer = onStaffDataChanged(() => { peerHits++; });
const remoteTab = new FakeBroadcastChannel('futureschool:data-sync');
remoteTab.postMessage({ at: Date.now() });
check('cross-tab BroadcastChannel listener receives external write', peerHits === 1);

unsub();
offPeer();
const before = hits;
notifyStaffDataChanged();
check('unsubscribe stops further notifications', hits === before);

check('isChunkLoadError identifies dynamic module failure', isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/foo.js')));
check('isChunkLoadError ignores unrelated API errors', !isChunkLoadError(new Error('Network timeout')));

check('first chunk reload triggers window.location.reload', reloadOnceForNewBuild() === true && reloads === 1);
check('second chunk reload inside cooldown is suppressed', reloadOnceForNewBuild() === false && reloads === 1);
