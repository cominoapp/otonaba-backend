import dotenv from 'dotenv';
dotenv.config();

import pkg from 'pg';
const { Pool } = pkg;

console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('🔍 DATABASE_URL preview:', process.env.DATABASE_URL?.substring(0, 30) + '...');

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
    process.exit(1);
  }
};