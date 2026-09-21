import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Khởi tạo Connection Pool chuyên nghiệp cho PostgreSQL
const connectionString = `${process.env.DATABASE_URL}`;

const pool = new pg.Pool({
  connectionString,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Ngăn chặn unhandled error event trên các kết nối nhàn rỗi (idle clients)
pool.on('error', (err) => {
  console.warn('[PostgreSQL Pool] Cảnh báo kết nối nhàn rỗi:', err.message);
});

const adapter = new PrismaPg(pool);

// Mẫu thiết kế Prisma Global Singleton (Chống rò rỉ kết nối trên Next.js HMR)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

// Trạng thái bộ đệm kiểm tra sức khỏe CSDL (Circuit Breaker / Health Status Cache)
let lastCheckTime = 0;
let lastCheckStatus = false;
const CACHE_TTL_OFFLINE = 15000; // 15 giây cooldown trước khi thử kết nối lại nếu DB offline
const CACHE_TTL_ONLINE = 60000;  // 60 giây nếu DB đang hoạt động bình thường

/**
 * Hàm kiểm tra tình trạng kết nối CSDL (Health Check & Circuit Breaker)
 * Trả về true nếu kết nối sẵn sàng, false nếu database đang offline.
 * Tự động cache trạng thái để tránh chặn luồng I/O 5000ms trong môi trường ngoại tuyến.
 */
export async function checkDatabaseConnection(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  const ttl = lastCheckStatus ? CACHE_TTL_ONLINE : CACHE_TTL_OFFLINE;

  // Nếu còn trong thời gian hiệu lực của cache và không ép buộc làm mới -> trả về ngay 0ms
  if (!forceRefresh && (now - lastCheckTime < ttl)) {
    return lastCheckStatus;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      lastCheckStatus = true;
      lastCheckTime = Date.now();
      return true;
    } finally {
      client.release();
    }
  } catch (error: any) {
    lastCheckStatus = false;
    lastCheckTime = Date.now();
    return false;
  }
}

/**
 * Hàm đánh dấu CSDL ngoại tuyến ngay lập tức (Chống khoảng mù 60s của Circuit Breaker)
 * Gọi hàm này khi bất kỳ giao dịch Prisma nào bắt gặp lỗi rớt mạng/mất socket kết nối.
 */
export function markDatabaseOffline(): void {
  lastCheckStatus = false;
  lastCheckTime = Date.now();
}

export { pool };