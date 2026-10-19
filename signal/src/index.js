import { DurableObject } from 'cloudflare:workers';
import { handleFetch, RoomCore, RateCore } from './logic.js';

// One instance per roomId. Holds the offer and answer for at most ROOM_TTL_MS.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new RoomCore(ctx.storage);
  }

  handle(op) {
    return this.core.handle(op);
  }

  alarm() {
    return this.core.alarm();
  }
}

// One instance per client IP. Holds a write counter for at most RATE_WINDOW_MS.
export class RateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new RateCore(ctx.storage);
  }

  hit() {
    return this.core.hit();
  }

  alarm() {
    return this.core.alarm();
  }
}

export default {
  fetch: (request, env) => handleFetch(request, env),
};
