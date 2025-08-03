export interface TokenBucketConfig {
  capacity: number; // 버킷 최대 토큰 개수
  consumePerRequest: number; // 요청 당 소모량
  refillRate: number; // 재충전 시 개수
}
