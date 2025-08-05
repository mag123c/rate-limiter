import request from "supertest";
import { createApp } from "../../app";
import { createLeakyBucketMiddleware } from "../middleware";

describe("Leaky Bucket Rate Limiter Integration", () => {
  let rateLimiter: any;

  afterEach(() => {
    // cleanup을 호출하여 interval 정리
    if (rateLimiter && rateLimiter.limiter && rateLimiter.limiter.cleanup) {
      rateLimiter.limiter.cleanup();
    }
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

  it("다른 IP 주소는 독립적인 큐를 가진다", async () => {
    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 2,  // 각 IP당 큐 용량 2
      leakRate: 10,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    // 같은 IP(1.1.1.1)에서 3번 요청
    const ip1Requests = [];
    for (let i = 0; i < 3; i++) {
      ip1Requests.push(
        request(app)
          .get("/")
          .set("X-Forwarded-For", "1.1.1.1")
          .then((res) => res)
          .catch((err) => err.response)
      );
    }

    // 다른 IP(2.2.2.2)에서 2번 요청
    const ip2Requests = [];
    for (let i = 0; i < 2; i++) {
      ip2Requests.push(
        request(app)
          .get("/")
          .set("X-Forwarded-For", "2.2.2.2")
      );
    }

    const [ip1Results, ip2Results] = await Promise.all([
      Promise.all(ip1Requests),
      Promise.all(ip2Requests),
    ]);

    // IP 1.1.1.1: 2개는 성공, 1개는 429
    const ip1StatusCodes = ip1Results.map((r) => r.status).sort();
    expect(ip1StatusCodes).toEqual([200, 200, 429]);

    // IP 2.2.2.2: 모두 성공
    ip2Results.forEach((result) => {
      expect(result.status).toBe(200);
    });
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

  it("커스텀 키 생성기 사용 시 올바르게 동작", async () => {
    const rateLimiter = createLeakyBucketMiddleware(
      {
        capacity: 1,
        leakRate: 10,
      },
      {
        keyGenerator: (req) =>
          req.headers["api-key"]?.toString() || "anonymous",
      }
    );

    const app = createApp({
      middlewares: [rateLimiter],
    });

    // 각 API 키로 2번씩 요청
    const key1Requests = [];
    for (let i = 0; i < 2; i++) {
      key1Requests.push(
        request(app)
          .get("/")
          .set("api-key", "key1")
          .then((res) => res)
          .catch((err) => err.response)
      );
    }

    const key2Request = request(app).get("/").set("api-key", "key2");

    const [key1Results, key2Result] = await Promise.all([
      Promise.all(key1Requests),
      key2Request,
    ]);

    // key1: 첫 번째는 성공, 두 번째는 429
    expect(key1Results[0].status).toBe(200);
    expect(key1Results[1].status).toBe(429);

    // key2: 성공
    expect(key2Result.status).toBe(200);
  });

  it("skip 옵션 사용 시 특정 요청은 큐에 추가되지 않음", async () => {
    const rateLimiter = createLeakyBucketMiddleware(
      {
        capacity: 2,
        leakRate: 1,
      },
      {
        skip: (req) => req.path === "/health",
      }
    );

    const app = createApp({
      middlewares: [rateLimiter],
      setupRoutes: (app) => {
        app.get("/health", (_req, res) => res.json({ status: "ok" }));
      },
    });

    // health check는 큐에 추가 안됨
    for (let i = 0; i < 10; i++) {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
    }

    // 일반 요청은 큐에 추가 (3개 요청, 2개만 큐에 들어감)
    const normalRequests = [];
    for (let i = 0; i < 3; i++) {
      normalRequests.push(
        request(app)
          .get("/")
          .then((res) => res)
          .catch((err) => err.response)
      );
    }

    const results = await Promise.all(normalRequests);
    const statusCodes = results.map((r) => r.status).sort();
    expect(statusCodes).toEqual([200, 200, 429]);
  });

  it("onLimitReached 콜백이 호출된다", async () => {
    let callbackCalled = false;
    let limitedPath = "";

    const rateLimiter = createLeakyBucketMiddleware(
      {
        capacity: 1,
        leakRate: 100, // 빠른 처리
      },
      {
        onLimitReached: (req, res) => {
          callbackCalled = true;
          limitedPath = req.path;
          res.status(429).json({ error: "Queue is full" });
        },
      }
    );

    const app = createApp({ middlewares: [rateLimiter] });

    // 두 요청을 거의 동시에 보내서 두 번째가 거부되도록
    const promises = [];
    for (let i = 0; i < 2; i++) {
      promises.push(
        request(app)
          .get("/api/test")
          .then((res) => res)
          .catch((err) => err.response)
      );
    }

    const results = await Promise.all(promises);

    expect(callbackCalled).toBe(true);
    expect(limitedPath).toBe("/api/test");
    
    // 하나는 200, 하나는 429
    const statusCodes = results.map(r => r.status).sort();
    expect(statusCodes).toEqual([200, 429]);
    
    const rejectedResponse = results.find(r => r.status === 429);
    expect(rejectedResponse.body.error).toBe("Queue is full");
  }, 10000);

  it("다양한 HTTP 메서드에 대해 동일하게 작동", async () => {
    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 5,
      leakRate: 100, // 빠른 처리
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 6개 요청 (다양한 메서드 5개 + 추가 1개)
    const promises = [
      request(app).get("/"),
      request(app).post("/"),
      request(app).put("/"),
      request(app).delete("/"),
      request(app).patch("/"),
      request(app).get("/"),  // 6번째 요청
    ].map(p => p.then(res => res).catch(err => err.response));

    const responses = await Promise.all(promises);
    const statusCodes = responses.map((r: any) => r.status).sort();
    
    // 5개는 큐에 들어가고, 1개는 429
    expect(statusCodes).toEqual([200, 200, 200, 200, 200, 429]);
  }, 10000);

  it("일정한 속도로 요청 처리 (Leaky Bucket의 특징)", async () => {
    const processedTimes: number[] = [];
    const leakRate = 2; // 초당 2개 처리

    const rateLimiter = createLeakyBucketMiddleware({
      capacity: 10,
      leakRate,
    });

    const app = createApp({
      middlewares: [rateLimiter],
      setupRoutes: (app) => {
        app.get("/steady", (_req, res) => {
          processedTimes.push(Date.now());
          res.json({ processed: true });
        });
      },
    });

    // 5개 요청을 한 번에 보냄
    const promises = Array(5)
      .fill(null)
      .map(() => request(app).get("/steady"));

    await Promise.all(promises);

    // 처리 시간 간격 확인 (약 500ms 간격)
    expect(processedTimes).toHaveLength(5);
    
    for (let i = 1; i < processedTimes.length; i++) {
      const gap = processedTimes[i] - processedTimes[i - 1];
      expect(gap).toBeGreaterThanOrEqual(400); // 여유 있게 400ms
      expect(gap).toBeLessThan(600);
    }
  });
});