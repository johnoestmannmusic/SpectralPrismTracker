/**
 * Browser stand-in for `node:events` (FEAT-175).
 *
 * Ink's `App` and `StdinContext` instantiate `EventEmitter` directly, as do
 * several transitive dependencies. This is a small, dependency-free
 * implementation of the surface they use.
 */

type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private handlers = new Map<string, Set<Listener>>();
  private onceWrappers = new Map<Listener, Listener>();
  private maxListeners = 10;

  on(event: string, listener: Listener): this {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(listener);
    return this;
  }

  addListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  once(event: string, listener: Listener): this {
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.onceWrappers.set(listener, wrapper);
    return this.on(event, wrapper);
  }

  prependListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  off(event: string, listener: Listener): this {
    const set = this.handlers.get(event);
    const wrapper = this.onceWrappers.get(listener);
    if (set) {
      set.delete(listener);
      if (wrapper) set.delete(wrapper);
      if (set.size === 0) this.handlers.delete(event);
    }
    this.onceWrappers.delete(listener);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event === undefined) this.handlers.clear();
    else this.handlers.delete(event);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return false;
    for (const listener of [...set]) {
      try {
        listener(...args);
      } catch {
        /* listener errors must not break the emitter */
      }
    }
    return true;
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  listeners(event: string): Listener[] {
    return [...(this.handlers.get(event) ?? [])];
  }

  setMaxListeners(count: number): this {
    this.maxListeners = count;
    return this;
  }

  getMaxListeners(): number {
    return this.maxListeners;
  }
}

export default EventEmitter;
