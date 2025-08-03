export class Queue<T> {
  private list: T[] = [];

  add(item: T): void {
    this.list.push(item);
  }

  poll(): T | null {
    return this.list.shift() ?? null;
  }

  size(): number {
    return this.list.length;
  }

  isEmpty(): boolean {
    return this.list.length === 0;
  }
}
