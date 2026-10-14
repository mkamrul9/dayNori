/**
 * Mobile Authentication Adapter
 *
 * Implements the security contract for the mobile organizer shell:
 * - Defaults strictly to unauthenticated (`isAuthenticated === false`).
 * - Protects private destinations (e.g., Journal, private items, vault records).
 * - Queues pending destinations when an unauthenticated user attempts to access protected routes.
 * - Supports synthetic authentication context strictly for testing and development review.
 * - Does NOT implement full multi-factor or provider authentication, which belongs to Phase 09.
 */

export interface MobileUser {
  id: string;
  name: string;
  workspaceId: string;
}

export class MobileAuthAdapter {
  private authenticated: boolean = false;
  private currentUser: MobileUser | null = null;
  private pendingDestination: string | null = null;
  private listeners: Array<() => void> = [];

  constructor(initialAuthenticated = false) {
    this.authenticated = initialAuthenticated;
    if (initialAuthenticated) {
      this.currentUser = {
        id: 'usr_synthetic_default',
        name: 'Alex Morgan',
        workspaceId: 'ws_personal_default',
      };
    }
  }

  public isAuthenticated(): boolean {
    return this.authenticated;
  }

  public getCurrentUser(): MobileUser | null {
    return this.currentUser;
  }

  public getPendingDestination(): string | null {
    return this.pendingDestination;
  }

  public setPendingDestination(dest: string | null): void {
    this.pendingDestination = dest;
  }

  public loginSynthetic(user?: MobileUser): void {
    this.authenticated = true;
    this.currentUser = user || {
      id: 'usr_synthetic_demo',
      name: 'Alex Morgan',
      workspaceId: 'ws_personal_demo',
    };
    this.notify();
  }

  public logout(): void {
    this.authenticated = false;
    this.currentUser = null;
    this.pendingDestination = null;
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

// Global default instance for mobile app runtime
export const defaultAuthAdapter = new MobileAuthAdapter(false);
