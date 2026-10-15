/**
 * Multi-tab synchronization coordination.
 * Elects a single leader tab to perform network push and pull operations, preventing
 * duplicate work and transaction lock contention across multiple browser windows.
 */

export interface TabCoordinationPort {
  readonly isLeader: boolean;
  start(): void;
  stop(): void;
  requestSync(): void;
  onSyncRequested(callback: () => void): () => void;
  onLeaderChanged(callback: (isLeader: boolean) => void): () => void;
}

export interface TabCoordinatorOptions {
  channelName?: string;
  heartbeatIntervalMs?: number;
  leaseDurationMs?: number;
  tabId?: string;
}

interface CoordinationMessage {
  type: 'heartbeat' | 'claim_leadership' | 'sync_requested' | 'leader_resigning';
  tabId: string;
  timestamp: number;
}

export interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

/**
 * Coordination provider utilizing BroadcastChannel with automatic leader election
 * and crash recovery.
 */
export class BroadcastChannelTabCoordinator implements TabCoordinationPort {
  private channel: BroadcastChannelLike | null = null;
  private readonly channelName: string;
  private readonly tabId: string;
  private readonly heartbeatIntervalMs: number;
  private readonly leaseDurationMs: number;

  private _isLeader = false;
  private leaderLastSeen = 0;
  private leaderId: string | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  private syncListeners = new Set<() => void>();
  private leaderListeners = new Set<(isLeader: boolean) => void>();

  constructor(options?: TabCoordinatorOptions) {
    this.channelName = options?.channelName ?? 'daynori_sync_coordination';
    this.tabId = options?.tabId ?? `tab_${Math.random().toString(36).slice(2, 10)}`;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 1000;
    this.leaseDurationMs = options?.leaseDurationMs ?? 3000;
  }

  get isLeader(): boolean {
    return this._isLeader;
  }

  start(): void {
    const globalWithBC = globalThis as unknown as {
      BroadcastChannel?: new (name: string) => BroadcastChannelLike;
    };

    if (typeof globalWithBC.BroadcastChannel === 'undefined') {
      // In environments without BroadcastChannel (Node tests / Mobile), assume leader
      this.setLeader(true);
      return;
    }

    try {
      const BC = globalWithBC.BroadcastChannel;
      this.channel = new BC(this.channelName);
      if (this.channel) {
        this.channel.onmessage = (event: { data: unknown }) => {
          this.handleMessage(event.data);
        };
      }
    } catch {
      this.setLeader(true);
      return;
    }

    // Try claiming leadership after a short discovery period
    setTimeout(() => {
      const now = Date.now();
      if (!this.leaderId || now - this.leaderLastSeen > this.leaseDurationMs) {
        this.claimLeadership();
      }
    }, 200 + Math.random() * 300);

    // Health check timer for leader crash detection
    this.checkTimer = setInterval(() => {
      const now = Date.now();
      if (!this._isLeader && (!this.leaderId || now - this.leaderLastSeen > this.leaseDurationMs)) {
        this.claimLeadership();
      }
    }, this.heartbeatIntervalMs);
  }

  stop(): void {
    if (this._isLeader && this.channel) {
      try {
        this.channel.postMessage({
          type: 'leader_resigning',
          tabId: this.tabId,
          timestamp: Date.now(),
        });
      } catch {
        /* best-effort */
      }
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.setLeader(false);
  }

  requestSync(): void {
    if (this._isLeader) {
      this.notifySyncRequested();
    } else if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'sync_requested',
          tabId: this.tabId,
          timestamp: Date.now(),
        });
      } catch {
        // Fallback
        this.notifySyncRequested();
      }
    }
  }

  onSyncRequested(callback: () => void): () => void {
    this.syncListeners.add(callback);
    return () => this.syncListeners.delete(callback);
  }

  onLeaderChanged(callback: (isLeader: boolean) => void): () => void {
    this.leaderListeners.add(callback);
    return () => this.leaderListeners.delete(callback);
  }

  private handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const msg = data as Partial<CoordinationMessage>;
    if (typeof msg.type !== 'string' || typeof msg.tabId !== 'string') return;

    const now = Date.now();
    switch (msg.type) {
      case 'heartbeat':
        this.leaderLastSeen = now;
        this.leaderId = msg.tabId;
        if (this._isLeader && msg.tabId !== this.tabId) {
          // Conflict resolution: lower tabId yields leadership
          if (this.tabId > msg.tabId) {
            this.setLeader(false);
          }
        }
        break;

      case 'claim_leadership':
        if (this._isLeader && msg.tabId !== this.tabId) {
          if (this.tabId < msg.tabId) {
            // Defend leadership
            this.sendHeartbeat();
          } else {
            this.setLeader(false);
            this.leaderId = msg.tabId;
            this.leaderLastSeen = now;
          }
        } else {
          this.leaderId = msg.tabId;
          this.leaderLastSeen = now;
        }
        break;

      case 'leader_resigning':
        if (msg.tabId === this.leaderId) {
          this.leaderId = null;
          this.leaderLastSeen = 0;
          this.claimLeadership();
        }
        break;

      case 'sync_requested':
        if (this._isLeader) {
          this.notifySyncRequested();
        }
        break;
    }
  }

  private claimLeadership(): void {
    this.leaderId = this.tabId;
    this.leaderLastSeen = Date.now();
    this.setLeader(true);

    if (this.channel) {
      try {
        this.channel.postMessage({
          type: 'claim_leadership',
          tabId: this.tabId,
          timestamp: Date.now(),
        });
      } catch {
        /* ignore */
      }
    }
    this.sendHeartbeat();
  }

  private sendHeartbeat(): void {
    if (!this._isLeader || !this.channel) return;
    try {
      this.channel.postMessage({
        type: 'heartbeat',
        tabId: this.tabId,
        timestamp: Date.now(),
      });
    } catch {
      /* ignore */
    }
  }

  private setLeader(isLeader: boolean): void {
    if (this._isLeader !== isLeader) {
      this._isLeader = isLeader;

      if (isLeader) {
        if (!this.heartbeatTimer) {
          this.heartbeatTimer = setInterval(
            () => this.sendHeartbeat(),
            this.heartbeatIntervalMs
          );
        }
      } else {
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      }

      for (const listener of this.leaderListeners) {
        try {
          listener(isLeader);
        } catch {
          /* ignore listener errors */
        }
      }
    }
  }

  private notifySyncRequested(): void {
    for (const listener of this.syncListeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Simple standalone coordinator for environments where multi-tab concurrency
 * does not apply (e.g. Node tests, mobile applications).
 */
export class SingleProcessCoordinator implements TabCoordinationPort {
  readonly isLeader = true;
  private syncListeners = new Set<() => void>();

  start(): void {}
  stop(): void {}

  requestSync(): void {
    for (const listener of this.syncListeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  onSyncRequested(callback: () => void): () => void {
    this.syncListeners.add(callback);
    return () => this.syncListeners.delete(callback);
  }

  onLeaderChanged(_callback: (isLeader: boolean) => void): () => void {
    return () => {};
  }
}
