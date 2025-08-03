import request from "supertest";
import { createApp } from "../../app";
import { createTokenBucketMiddleware } from "../middleware";

describe("Token Bucket Rate Limiter Integration", () => {
  it("토큰 사용량만큼 잘 사용됨.", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 3,
      refillRate: 1,
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    for (let i = 0; i < 3; i++) {
      const response = await request(app).get("/");
      expect(response.status).toBe(200);
    }
  });

  it("토큰이 없다면 429를 발생시킴", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 2,
      refillRate: 0.1,
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    await request(app).get("/");
    await request(app).get("/");

    // 3번째는 실패
    const response = await request(app).get("/");
    expect(response.status).toBe(429);
    expect(response.body.error).toBe("Too Many Requests");
  });

  it("토큰이 재충전되면 다시 요청을 보낼 수 있음.", async () => {
    const rateLimiter = createTokenBucketMiddleware({
      capacity: 1,
      refillRate: 10,
      consumePerRequest: 1,
    });

    const app = createApp({
      middlewares: [rateLimiter],
    });

    await request(app).get("/");

    // 즉시 요청하면 실패
    let response = await request(app).get("/");
    expect(response.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 100));
    response = await request(app).get("/");
    expect(response.status).toBe(200);
  });
});
