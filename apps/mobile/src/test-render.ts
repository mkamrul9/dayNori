import React from 'react';

export interface MountedNode {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<MountedNode | string | number | null | undefined>;
  findByProps: (match: Record<string, unknown>) => MountedNode;
  findAllByProps: (match: Record<string, unknown>) => MountedNode[];
}

export interface ReactTestRenderer {
  root: MountedNode;
  toJSON: () => unknown;
  update: (nextElement: React.ReactElement) => void;
  unmount: () => void;
}

interface HookEffect {
  cb: () => void | (() => void);
  deps?: readonly unknown[];
  cleanup?: () => void;
}

interface ReactInternals {
  ReactCurrentDispatcher?: {
    current: unknown;
  };
}

function findInNode(
  node: MountedNode | unknown,
  match: Record<string, unknown>
): MountedNode | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = node as MountedNode;
  if (candidate.props) {
    const isMatch = Object.entries(match).every(([k, v]) => candidate.props[k] === v);
    if (isMatch) return candidate;
  }
  if (Array.isArray(candidate.children)) {
    for (const c of candidate.children) {
      const found = findInNode(c, match);
      if (found) return found;
    }
  }
  return null;
}

function findAllInNode(
  node: MountedNode | unknown,
  match: Record<string, unknown>,
  acc: MountedNode[] = []
): MountedNode[] {
  if (!node || typeof node !== 'object') return acc;
  const candidate = node as MountedNode;
  if (candidate.props) {
    const isMatch = Object.entries(match).every(([k, v]) => candidate.props[k] === v);
    if (isMatch) acc.push(candidate);
  }
  if (Array.isArray(candidate.children)) {
    for (const c of candidate.children) {
      findAllInNode(c, match, acc);
    }
  }
  return acc;
}

export class MiniTestRenderer implements ReactTestRenderer {
  element: React.ReactElement;
  hookStates: Map<string, unknown[]>;
  pendingEffects: Array<() => void>;
  isRendering: boolean;
  root: MountedNode;

  constructor(element: React.ReactElement) {
    this.element = element;
    this.hookStates = new Map();
    this.pendingEffects = [];
    this.isRendering = false;
    this.root = this.createEmptyNode();
    this.renderRoot(element);
  }

  createEmptyNode(): MountedNode {
    const node: MountedNode = {
      type: 'Empty',
      props: {},
      children: [],
      findByProps: (match) => {
        throw new Error(`No mounted node matching ${JSON.stringify(match)}`);
      },
      findAllByProps: () => [],
    };
    return node;
  }

  renderRoot(element: React.ReactElement): MountedNode {
    this.isRendering = true;
    let node: MountedNode;
    try {
      node = (this.renderNode(element, 'root') || this.createEmptyNode()) as MountedNode;
    } finally {
      this.isRendering = false;
    }
    this.root = node;
    this.flushEffects();
    return this.root;
  }

  reRender(): void {
    if (this.isRendering) return;
    this.renderRoot(this.element);
  }

  flushEffects(): void {
    let loops = 0;
    while (this.pendingEffects.length > 0 && loops < 20) {
      loops++;
      const batch = this.pendingEffects.slice();
      this.pendingEffects = [];
      for (const eff of batch) {
        eff();
      }
    }
  }

  renderNode(element: unknown, keyPath: string): MountedNode | string | number | null | undefined {
    if (element === null || element === undefined || typeof element === 'boolean') {
      return null;
    }
    if (typeof element === 'string' || typeof element === 'number') {
      return element;
    }
    if (!React.isValidElement(element)) {
      return null;
    }

    if (typeof element.type === 'function') {
      const fnComp = element.type as { displayName?: string; name?: string };
      const compName = fnComp.displayName || fnComp.name || 'Component';
      const compKey = `${keyPath}@${compName}`;
      let hooks = this.hookStates.get(compKey);
      if (!hooks) {
        hooks = [];
        this.hookStates.set(compKey, hooks);
      }
      let hookIndex = 0;
      const dispatcher = {
        useState: <T>(init: T | (() => T)): [T, (action: T | ((prev: T) => T)) => void] => {
          const idx = hookIndex++;
          if (hooks!.length <= idx) {
            hooks![idx] = typeof init === 'function' ? (init as () => T)() : init;
          }
          const setState = (action: T | ((prev: T) => T)) => {
            const currentVal = hooks![idx] as T;
            const next =
              typeof action === 'function' ? (action as (prev: T) => T)(currentVal) : action;
            if (Object.is(hooks![idx], next)) return;
            hooks![idx] = next;
            this.reRender();
          };
          return [hooks![idx] as T, setState];
        },
        useRef: <T>(init: T): { current: T } => {
          const idx = hookIndex++;
          if (hooks!.length <= idx) {
            hooks![idx] = { current: init };
          }
          return hooks![idx] as { current: T };
        },
        useMemo: <T>(fn: () => T): T => fn(),
        useCallback: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
        useEffect: (cb: () => void | (() => void), deps?: readonly unknown[]) => {
          const idx = hookIndex++;
          const prev = hooks![idx] as HookEffect | undefined;
          const hasChanged =
            !prev || !deps || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]));
          const effectRecord: HookEffect = { cb, deps, cleanup: prev?.cleanup };
          hooks![idx] = effectRecord;
          if (hasChanged) {
            this.pendingEffects.push(() => {
              if (typeof effectRecord.cleanup === 'function') {
                try {
                  effectRecord.cleanup();
                } catch {
                  // ignore test cleanup errors
                }
              }
              const cleanup = cb();
              if (typeof cleanup === 'function') {
                effectRecord.cleanup = cleanup;
              }
            });
          }
        },
        useContext: <T>(ctx: { _currentValue?: T }): T | undefined =>
          ctx ? ctx._currentValue : undefined,
        useId: () => `id-${compKey}`,
      };

      const internals = (React as unknown as Record<string, unknown>)
        .__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as ReactInternals | undefined;
      if (internals?.ReactCurrentDispatcher) {
        internals.ReactCurrentDispatcher.current = dispatcher;
      }

      let evaluated: unknown;
      try {
        const Component = element.type as (props: Record<string, unknown>) => React.ReactNode;
        evaluated = Component(element.props as Record<string, unknown>);
      } finally {
        if (internals?.ReactCurrentDispatcher) {
          internals.ReactCurrentDispatcher.current = null;
        }
      }

      // Render the result of the function component
      return this.renderNode(evaluated, `${compKey}/rendered`);
    }

    const props = { ...((element.props as Record<string, unknown>) || {}) };
    const rawChildren = React.Children.toArray(props.children as React.ReactNode);
    const children: Array<MountedNode | string | number | null | undefined> = rawChildren.map(
      (child, i) => this.renderNode(child, `${keyPath}.${i}`)
    );

    const node: MountedNode = {
      type: element.type,
      props,
      children,
      findByProps: (match: Record<string, unknown>) => {
        const found = findInNode(node, match);
        if (!found) {
          throw new Error(`No mounted node matching ${JSON.stringify(match)}`);
        }
        return found;
      },
      findAllByProps: (match: Record<string, unknown>) => findAllInNode(node, match),
    };

    return node;
  }

  toJSON(): unknown {
    return this.root;
  }

  update(nextElement: React.ReactElement): void {
    this.element = nextElement;
    this.renderRoot(nextElement);
  }

  unmount(): void {
    for (const hooks of this.hookStates.values()) {
      for (const hook of hooks) {
        if (hook && typeof (hook as HookEffect).cleanup === 'function') {
          try {
            (hook as HookEffect).cleanup!();
          } catch {
            // ignore test teardown errors
          }
        }
      }
    }
    this.pendingEffects = [];
    this.hookStates.clear();
  }
}

export function create(element: React.ReactElement): ReactTestRenderer {
  return new MiniTestRenderer(element);
}

export function act(callback: () => void): void {
  callback();
}

export const TestRenderer = {
  create,
  act,
};

export default TestRenderer;
