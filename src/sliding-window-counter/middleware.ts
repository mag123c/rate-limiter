import { SlidingWindowCounterRateLimiter } from "./sliding-window-counter";
import { SlidingWindowCounterConfig } from "./config";
import { createRateLimiterMiddleware, RateLimiterMiddlewareOptions } from "../middleware/rate-limiter-factory";

export function createSlidingWindowCounterMiddleware(
  config: SlidingWindowCounterConfig,
  options?: RateLimiterMiddlewareOptions
) {
  const limiter = new SlidingWindowCounterRateLimiter(config);
  return createRateLimiterMiddleware(limiter, options);
}