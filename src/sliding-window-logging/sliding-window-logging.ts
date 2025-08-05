import { RateLimiter } from "../rate-limiter";
import { SlidingWindowLoggingConfig } from "./config";

export class SlidingWindowLoggingRateLimiter implements RateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  constructor(private config: SlidingWindowLoggingConfig) {}

  tryConsume(key: string): void {
    const now = Date.now();
    if (!this.canConsumeRequest(key, now)) {
      throw new Error(`Rate limit exceeded`);
    }
    this.addTimestamp(key, now);
  }

  private canConsumeRequest(key: string, now: number): boolean {
    let timestamps = this.timestamps.get(key);
    if (!timestamps) {
      timestamps = [];
      this.timestamps.set(key, timestamps);
    }

    const windowStart = now - this.config.windowSizeMs;

    // 윈도우 내의 요청만 필터링
    const validTimestamps = timestamps.filter(
      (timestamp) => timestamp >= windowStart
    );

    // 메모리 효율을 위해 오래된 타임스탬프 제거
    if (validTimestamps.length !== timestamps.length) {
      this.timestamps.set(key, validTimestamps);
    }

    return validTimestamps.length < this.config.threshold;
  }

  private addTimestamp(key: string, now: number): void {
    const timestamps = this.timestamps.get(key);
    if (!timestamps) {
      throw new Error(`Timestamps not found for key: ${key}`);
    }
    timestamps.push(now);
  }
}
