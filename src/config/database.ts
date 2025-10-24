import pkg from 'pg';
const { Pool } = pkg;

console.log('🔍 All env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ データベース接続成功');
    client.release();
  } catch (error) {
    console.error('❌ データベース接続失敗:', error);
    console.error('DATABASE_URL value:', process.env.DATABASE_URL);
    process.exit(1);
  }
};