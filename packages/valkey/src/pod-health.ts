/** A game pod's heartbeat: `pod:{id}` (design §9.1, §9.5). */
export interface PodHeartbeat {
  podId: string;
  /** The `host:port` gateways reach the pod at: its own pod IP. */
  address: string;
  /** How many rooms it hosts, for placing new rooms on the least-loaded pod (design §9.2). */
  roomCount: number;
  engineVersion: number;
  /** Shutting down: it takes no new rooms (design §9.7). */
  draining: boolean;
}

/**
 * Game pods' heartbeats. A pod beats every 2 s, and a heartbeat counts for 5 s, so a pod that
 * stops beating drops out on its own. Used for room placement now, and for detecting dead pods in
 * phase 2 (design §9.7).
 */
export interface PodHealth {
  /** Writes the pod's heartbeat, restarting its TTL. */
  beat(heartbeat: PodHeartbeat): Promise<void>;
  get(podId: string): Promise<PodHeartbeat | undefined>;
  /** Every pod with a live heartbeat, in no particular order. */
  list(): Promise<PodHeartbeat[]>;
  /** Drops the pod's heartbeat at once, as a pod does as it exits. */
  remove(podId: string): Promise<void>;
}
