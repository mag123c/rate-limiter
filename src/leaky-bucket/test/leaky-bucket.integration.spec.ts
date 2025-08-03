import request from "supertest";
import { createApp } from "../../app";
import { createLeakyBucketMiddleware } from "../middleware";

describe("Leaky Bucket Rate Limiter Integration", () => {
  // 각 테스트 후 Leaky Bucket의 interval 정리를 위한 cleanup
  afterEach(() => {
    // Jest의 타이머를 리셋하여 interval 정리
    jest.clearAllTimers();
  });

  it("큐 용량 내에서는 요청이 대기 후 처리됨", async () => {
    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 3,
      leakRate: 10,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(request(app).get("/"));
    }

    const responses = await Promise.all(promises);
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  it("큐 용량을 초과하면 즉시 429 반환", async () => {
    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 2,
      leakRate: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        request(app)
          .get("/")
          .then((res) => res)
          .catch((err) => err.response)
      );
    }

    const responses = await Promise.all(promises);

    // 3번째는 큐가 가득 차서 즉시 429
    const statusCodes = responses.map((r) => r.status).sort();
    expect(statusCodes).toEqual([200, 200, 429]);
  });

  it("처리 속도에 따라 순차적으로 처리됨", async () => {
    const processedTimes: number[] = [];

    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 10,
      leakRate: 5, // 초당 5개 처리 (200ms마다 1개)
    });

    const app = createApp({
      middlewares: [rateLimiter],
      setupRoutes: (app) => {
        app.get("/track", (_req, res) => {
          processedTimes.push(Date.now());
          res.json({ processed: true });
        });
      },
    });

    const promises = [];
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      promises.push(request(app).get("/track"));
    }

    await Promise.all(promises);

    // 처리 간격 확인
    expect(processedTimes).toHaveLength(3);

    if (processedTimes.length >= 2) {
      const gap1 = processedTimes[1] - processedTimes[0];
      expect(gap1).toBeGreaterThanOrEqual(150);
      expect(gap1).toBeLessThan(250);
    }

    if (processedTimes.length >= 3) {
      const gap2 = processedTimes[2] - processedTimes[1];
      expect(gap2).toBeGreaterThanOrEqual(150);
      expect(gap2).toBeLessThan(250);
    }
  });

  it("다른 키는 독립적인 큐를 가짐", async () => {
    const rateLimiter = createLeakyBucketMiddleware(
      {
        capacity: 1,
        leakRate: 10,
      },
      {
        keyGenerator: (req) => req.get("x-user-id") || "default",
      }
    );

    const app = createApp({
      middlewares: [rateLimiter],
    });

    const req1 = request(app).get("/").set("x-user-id", "user1");
    const req2 = request(app).get("/").set("x-user-id", "user2");

    const req3 = request(app).get("/").set("x-user-id", "user1");

    const results = await Promise.allSettled([req1, req2, req3]);

    const res1 = results[0].status === "fulfilled" ? results[0].value : null;
    const res2 = results[1].status === "fulfilled" ? results[1].value : null;
    const res3 =
      results[2].status === "rejected"
        ? results[2].reason.response
        : results[2].status === "fulfilled"
        ? results[2].value
        : null;

    expect(res1?.status).toBe(200);
    expect(res2?.status).toBe(200);

    expect(res3.status).toBe(429);
  }, 10000);
});
