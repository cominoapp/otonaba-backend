import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ データベース接続成功');
    client.release();
  } catch (error) {
    console.error('❌ データベース接続失敗:', error);
    process.exit(1);
  }
};