import { 
  createRateLimiterMiddleware,
  RateLimiterMiddlewareOptions 
} from '../middleware/rate-limiter-factory';
import { SlidingWindowLoggingRateLimiter } from './sliding-window-logging';
import { SlidingWindowLoggingConfig } from './config';

export function createSlidingWindowLoggingMiddleware(
  config: SlidingWindowLoggingConfig,
  options?: RateLimiterMiddlewareOptions
) {
  const rateLimiter = new SlidingWindowLoggingRateLimiter(config);
  return createRateLimiterMiddleware(rateLimiter, options);
}