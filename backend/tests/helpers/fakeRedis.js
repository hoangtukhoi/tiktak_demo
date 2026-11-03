/**
 * Redis giả lập trong bộ nhớ — đủ các lệnh backend dùng (get/set có EX, NX, del).
 * Dùng cho integration test để không cần chạy Redis thật.
 */
class FakeRedis {
  constructor() {
    this.store = new Map();
  }

  _alive(key) {
    const item = this.store.get(key);
    if (item && item.expireAt && item.expireAt <= Date.now()) this.store.delete(key);
    return this.store.has(key);
  }

  async get(key) {
    return this._alive(key) ? this.store.get(key).value : null;
  }

  async set(key, value, ...args) {
    const flags = args.map((a) => (typeof a === 'string' ? a.toUpperCase() : a));
    if (flags.includes('NX') && this._alive(key)) return null;
    const ex = flags.indexOf('EX');
    const expireAt = ex >= 0 ? Date.now() + Number(flags[ex + 1]) * 1000 : null;
    this.store.set(key, { value: String(value), expireAt });
    return 'OK';
  }

  async del(...keys) {
    return keys.flat().filter((k) => this.store.delete(k)).length;
  }

  async flushall() {
    this.store.clear();
    return 'OK';
  }

  async publish() {
    return 0;
  }

  async quit() {}
  async connect() {}
  on() {
    return this;
  }
  duplicate() {
    return this;
  }
}

module.exports = new FakeRedis();
