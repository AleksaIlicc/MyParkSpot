import * as redis from "redis";

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("error", (err) => {
  console.error("Error connecting to Redis:", err);
});

export default client;
