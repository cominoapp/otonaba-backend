import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ データベース接続成功');
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not Set');
    client.release();
  } catch (error) {
    console.error('❌ データベース接続失敗:', error);
    process.exit(1);
  }
};