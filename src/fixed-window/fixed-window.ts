import { RateLimiter } from "../rate-limiter";
import { FixedWindowConfig } from "./config";

type FixedWindow = {
  counter: number;
  windowStart: number;
};

export class FixedWindowRateLimiter implements RateLimiter {
  private windows: Map<string, FixedWindow> = new Map();

  constructor(private config: FixedWindowConfig) {}

  tryConsume(key: string): void {
    if (!this.isReachedThreshold(key)) {
      throw new Error(`Rate Limit Exceeded for key: ${key}`);
    }
    this.increaseCounter(key);
  }

  private isReachedThreshold(key: string): boolean {
    let window = this.windows.get(key);
    if (!window) {
      window = this.createWindow(key);
    }
    this.initializeCounter(window);
    return window.counter < this.config.threshold;
  }

  private increaseCounter(key: string) {
    const window = this.windows.get(key) as FixedWindow;
    window.counter++;
  }

  private initializeCounter(window: FixedWindow) {
    const now = Date.now();
    if (now - window.windowStart >= this.config.windowSizeMs) {
      window.counter = 0;
      window.windowStart = now;
    }
  }

  private createWindow(key: string): FixedWindow {
    const window: FixedWindow = {
      counter: 0,
      windowStart: Date.now(),
    };
    this.windows.set(key, window);
    return window;
  }
}
