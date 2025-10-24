import pkg from 'pg';
const { Pool } = pkg;

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
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not Set');
    client.release();
  } catch (error) {
    console.error('❌ データベース接続失敗:', error);
    process.exit(1);
  }
};