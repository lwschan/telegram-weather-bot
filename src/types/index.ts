declare module 'redis' {
  type IRedisClient = ReturnType<typeof createClient>;
}

export {};
