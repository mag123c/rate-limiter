import { RateLimiter } from "../rate-limiter";
import { SlidingWindowCounterConfig } from "./config";

type WindowCounter = {
  count: number;
  windowStart: number;
};

export class SlidingWindowCounterRateLimiter implements RateLimiter {
  private previousWindows: Map<string, WindowCounter> = new Map();
  private currentWindows: Map<string, WindowCounter> = new Map();

  constructor(private config: SlidingWindowCounterConfig) {}

  tryConsume(key: string): void {
    const now = Date.now();
    const currentWindowStart = this.getCurrentWindowStart(now);
    
    this.updateWindows(key, currentWindowStart);
    
    // 현재 요청을 추가한 후의 예상 rate 계산
    const wouldBeRate = this.calculatePotentialRate(key, now, currentWindowStart);
    
    if (wouldBeRate > this.config.threshold) {
      throw new Error(`Rate Limit Exceeded for key: ${key}`);
    }
    
    this.increaseCounter(key);
  }

  private increaseCounter(key: string): void {
    const currentWindow = this.currentWindows.get(key);
    if (!currentWindow) {
      throw new Error(`Window not found for key: ${key}`);
    }
    currentWindow.count++;
  }

  private updateWindows(key: string, currentWindowStart: number): void {
    let currentWindow = this.currentWindows.get(key);
    
    if (!currentWindow || currentWindow.windowStart !== currentWindowStart) {
      if (currentWindow) {
        this.previousWindows.set(key, currentWindow);
      }
      currentWindow = { count: 0, windowStart: currentWindowStart };
      this.currentWindows.set(key, currentWindow);
    }
  }

  private calculatePotentialRate(key: string, now: number, currentWindowStart: number): number {
    const currentWindow = this.currentWindows.get(key);
    if (!currentWindow) {
      return 1; // 윈도우가 없으면 새 요청 1개만 계산
    }

    const previousWindow = this.previousWindows.get(key);
    const previousWindowStart = currentWindowStart - this.config.windowSizeMs;

    // 현재 윈도우 카운트에 1을 추가한 값으로 계산
    let rate = currentWindow.count + 1;

    if (previousWindow && previousWindow.windowStart === previousWindowStart) {
      // 현재 윈도우에서 경과한 시간
      const elapsedInCurrentWindow = now - currentWindowStart;
      // 이전 윈도우와 겹치는 시간
      const overlapTime = this.config.windowSizeMs - elapsedInCurrentWindow;
      // 이전 윈도우와 겹치는 비율
      const overlapRatio = overlapTime / this.config.windowSizeMs;
      // 슬라이딩 윈도우 카운터 공식: 현재 윈도우 + (이전 윈도우 × 겹치는 비율)
      rate = currentWindow.count + 1 + Math.floor(previousWindow.count * overlapRatio);
    }

    return rate;
  }

  private getCurrentWindowStart(now: number): number {
    return Math.floor(now / this.config.windowSizeMs) * this.config.windowSizeMs;
  }

  cleanup(): void {
    const now = Date.now();
    const currentWindowStart = this.getCurrentWindowStart(now);
    const previousWindowStart = currentWindowStart - this.config.windowSizeMs;

    this.previousWindows.forEach((window, key) => {
      if (window.windowStart < previousWindowStart) {
        this.previousWindows.delete(key);
      }
    });

    this.currentWindows.forEach((window, key) => {
      if (window.windowStart < currentWindowStart) {
        this.previousWindows.set(key, window);
        this.currentWindows.delete(key);
      }
    });
  }
}