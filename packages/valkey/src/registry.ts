/** A room's mode, fixed when the room is created (design §10.1). */
export type RoomMode = '1v1' | 'ffa';

/** Where a room is in its lifecycle (design §10.1). */
export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'results';

/** What the registry holds for one room: `room:{code}` (design §9.5). */
export interface RoomRecord {
  /** The `host:port` of the game pod that owns the room. */
  podAddress: string;
  /** The current period of ownership, incremented when the room changes owner (design §9.3). */
  epoch: number;
  mode: RoomMode;
  phase: RoomPhase;
  /** The host's session id. Quick-match rooms have none. */
  hostId?: string;
}

/** The fields of a room that change during its life. `hostId: null` clears the host. */
export interface RoomUpdate {
  phase?: RoomPhase;
  hostId?: string | null;
}

/** The shared record of which game pod owns each room, keyed by room code (design §9.2). */
export interface Registry {
  /** Records a new room. Returns false, changing nothing, if the code is already in use. */
  create(code: string, room: RoomRecord): Promise<boolean>;
  get(code: string): Promise<RoomRecord | undefined>;
  /** Changes a room's phase or host. Returns false if there is no such room. */
  update(code: string, update: RoomUpdate): Promise<boolean>;
  /**
   * Gives the room to another game pod, incrementing its epoch, in one atomic step (phase-2
   * recovery, design §9.7). Returns the room as it now is, or undefined if there is no such room.
   */
  reassign(code: string, podAddress: string): Promise<RoomRecord | undefined>;
  /** Removes the room, freeing its code. */
  delete(code: string): Promise<void>;
}
