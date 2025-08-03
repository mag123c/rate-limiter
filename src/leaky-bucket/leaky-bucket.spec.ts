import { LeakyBucketRateLimiter } from "./leaky-bucket";

describe("Leaky Bucket", () => {
  it("초당 처리 개수만큼 올바르게 처리한다", async () => {
    jest.useFakeTimers();

    const rateLimiter = new LeakyBucketRateLimiter({
      capacity: 100,
      leakRate: 5,
    });

    let processedCount = 0;

    for (let i = 0; i < 10; i++) {
      await rateLimiter.enqueue("test", () => {
        processedCount++;
      });
    }

    // 1초 경과
    jest.advanceTimersByTime(1000);
    expect(processedCount).toBe(5);

    // 1초 경과
    jest.advanceTimersByTime(1000);
    expect(processedCount).toBe(10);

    jest.useRealTimers();
  });

  it("큐 용량을 초과하면 에러 발생", async () => {
    const rateLimiter = new LeakyBucketRateLimiter({
      capacity: 2,
      leakRate: 1,
    });

    await rateLimiter.enqueue("test", () => {});
    await rateLimiter.enqueue("test", () => {});

    await expect(rateLimiter.enqueue("test", () => {})).rejects.toThrow(
      "Rate Limit Exceed"
    );
  });
});
