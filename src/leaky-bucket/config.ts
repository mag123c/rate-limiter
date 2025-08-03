export interface LeakyBucketConfig {
  capacity: number; // 큐의 최대 크기
  leakRate: number; // 초당 처리 개수
}
