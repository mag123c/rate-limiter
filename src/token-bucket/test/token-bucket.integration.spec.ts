import request from "supertest";
import { createApp } from "../../app";
import { createTokenBucketMiddleware } from "../middleware";

describe("Token Bucket Rate Limiter Integration", () => {
  it("토큰 사용량만큼 요청을 처리한다", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 3,
      refillRate: 1,
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    // 용량만큼 요청 성공
    for (let i = 0; i < 3; i++) {
      const response = await request(app).get("/");
      expect(response.status).toBe(200);
    }
    
    // 토큰 소진 시 429
    const response = await request(app).get("/");
    expect(response.status).toBe(429);
    expect(response.body.error).toBe("Too Many Requests");
  });

  it("다른 IP 주소는 독립적인 토큰 버킷을 가진다", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 2,
      refillRate: 0.1,
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    // IP 1.1.1.1로 2번 요청
    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1");
    await request(app).get("/").set("X-Forwarded-For", "1.1.1.1");

    // IP 2.2.2.2로 2번 요청
    await request(app).get("/").set("X-Forwarded-For", "2.2.2.2");
    await request(app).get("/").set("X-Forwarded-For", "2.2.2.2");

    // 각 IP별로 토큰 소진 확인
    const response1 = await request(app)
      .get("/")
      .set("X-Forwarded-For", "1.1.1.1");
    const response2 = await request(app)
      .get("/")
      .set("X-Forwarded-For", "2.2.2.2");

    expect(response1.status).toBe(429);
    expect(response2.status).toBe(429);
  });

  it("토큰이 재충전되면 다시 요청을 보낼 수 있다", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 1,
      refillRate: 10, // 초당 10개 충전
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    await request(app).get("/");

    // 즉시 요청하면 실패
    let response = await request(app).get("/");
    expect(response.status).toBe(429);

    // 100ms 후 1개 토큰 충전됨
    await new Promise((resolve) => setTimeout(resolve, 100));
    response = await request(app).get("/");
    expect(response.status).toBe(200);
  });

  it("동시 요청 처리 시 정확한 토큰 소비", async () => {
    const capacity = 50;
    const rateLimiter = createTokenBucketMiddleware({
      capacity,
      refillRate: 0,
      consumePerRequest: 1,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 50개 동시 요청
    const promises = Array(capacity)
      .fill(null)
      .map(() => request(app).get("/"));

    const responses = await Promise.all(promises);
    const successCount = responses.filter((r) => r.status === 200).length;
    const failCount = responses.filter((r) => r.status === 429).length;

    expect(successCount).toBe(capacity);
    expect(failCount).toBe(0);

    // 추가 요청은 실패
    const extraResponse = await request(app).get("/");
    expect(extraResponse.status).toBe(429);
  });

  it("커스텀 키 생성기 사용 시 올바르게 동작", async () => {
    const rateLimiter = createTokenBucketMiddleware(
      {
        capacity: 2,
        refillRate: 0,
        consumePerRequest: 1,
      },
      {
        keyGenerator: (req) => req.headers["api-key"]?.toString() || "anonymous",
      }
    );

    const app = createApp({ middlewares: [rateLimiter] });

    // API 키별로 독립적인 버킷
    await request(app).get("/").set("api-key", "key1");
    await request(app).get("/").set("api-key", "key1");
    await request(app).get("/").set("api-key", "key2");
    await request(app).get("/").set("api-key", "key2");

    // 각 키별로 토큰 소진 확인
    const response1 = await request(app).get("/").set("api-key", "key1");
    const response2 = await request(app).get("/").set("api-key", "key2");

    expect(response1.status).toBe(429);
    expect(response2.status).toBe(429);

    // anonymous 키는 별도 버킷
    const anonymousResponse = await request(app).get("/");
    expect(anonymousResponse.status).toBe(200);
  });

  it("burst traffic 처리 가능 (Token Bucket의 장점)", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 100,
      refillRate: 10, // 초당 10개
      consumePerRequest: 1,
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 한 번에 100개 요청 (burst) 가능
    const promises = Array(100)
      .fill(null)
      .map(() => request(app).get("/"));

    const responses = await Promise.all(promises);
    const allSuccess = responses.every((r) => r.status === 200);
    expect(allSuccess).toBe(true);

    // 토큰 소진 후 즉시 추가 요청은 실패
    const response = await request(app).get("/");
    expect(response.status).toBe(429);
  });

  it("consumePerRequest 옵션이 올바르게 동작", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 10,
      refillRate: 0,
      consumePerRequest: 5, // 요청당 5개 토큰 소비
    });

    const app = createApp({ middlewares: [rateLimiter] });

    // 2번만 요청 가능 (10 / 5 = 2)
    const response1 = await request(app).get("/");
    const response2 = await request(app).get("/");
    const response3 = await request(app).get("/");

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(429);
  });

  it("skip 옵션 사용 시 특정 요청은 토큰 소비하지 않음", async () => {
    const rateLimiter = createTokenBucketMiddleware(
      {
        capacity: 2,
        refillRate: 0,
        consumePerRequest: 1,
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

    // health check는 토큰 소비 안함
    for (let i = 0; i < 10; i++) {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
    }

    // 일반 요청은 토큰 소비
    await request(app).get("/");
    await request(app).get("/");
    const response = await request(app).get("/");
    expect(response.status).toBe(429);
  });
});