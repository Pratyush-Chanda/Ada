export function createServerCache(clientProvider, logger = console) {
  return {
    async get(key) {
      try {
        const client = await clientProvider();
        if (!client) return null;
        return await client.get(key);
      } catch (error) {
        logger.warn("Ada server cache read failed", error);
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        const client = await clientProvider();
        if (!client) return false;
        await client.set(key, value, { ex: ttlSeconds });
        return true;
      } catch (error) {
        logger.warn("Ada server cache write failed", error);
        return false;
      }
    }
  };
}

let clientPromise = null;

async function getRedisClient() {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;

  if (!clientPromise) {
    clientPromise = import("@upstash/redis")
      .then(({ createClient }) => createClient({ url, token }))
      .catch((error) => {
        console.warn("Ada server cache could not initialize Redis", error);
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

export const serverCache = createServerCache(getRedisClient);
