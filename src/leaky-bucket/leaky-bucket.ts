import { LeakyBucketConfig } from "./config";
import { AsyncRateLimiter } from "../rate-limiter";
import { Queue } from "./queue";

export class LeakyBucketRateLimiter implements AsyncRateLimiter {
  private buckets: Map<string, Queue<() => void>> = new Map();

  constructor(private config: LeakyBucketConfig) {}

  async enqueue(key: string, callback: () => void): Promise<void> {
    let queue = this.buckets.get(key);
    if (!queue) {
      queue = new Queue<() => void>();
      this.buckets.set(key, queue);
      this.startProcessing(key);
    }

    if (queue.size() >= this.config.capacity) {
      throw new Error("Rate Limit Exceed");
    }

    queue.add(callback);
  }

  private startProcessing(key: string) {
    setInterval(() => {
      const queue = this.buckets.get(key);
      if (queue && !queue.isEmpty()) {
        const callback = queue.poll();
        callback?.();
      }
    }, 1000 / this.config.leakRate);
  }
}
