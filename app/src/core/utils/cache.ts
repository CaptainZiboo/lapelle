import TTLCache from "@isaacs/ttlcache";

export default {
  courses: {
    today: new TTLCache({ max: 1000, ttl: 1000 * 60 * 30 }),
    week: new TTLCache({ max: 1000, ttl: 1000 * 60 * 60 * 2 }),
  },
  presences: new TTLCache({ max: 1000, ttl: 1000 * 60 * 2 }),
  notifications: new TTLCache({ max: 1000, ttl: 1000 * 60 * 60 * 1.5 }),
};
