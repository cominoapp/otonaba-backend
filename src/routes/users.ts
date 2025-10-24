import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';

const router = express.Router();

// 닉네임으로 사용자 프로필 조회
router.get('/nickname/:nickname', async (req: Request, res: Response) => {
  try {
    const { nickname } = req.params;

    const result = await pool.query(
      `SELECT id, email, nickname, age_group, trust_score, created_at
       FROM users
       WHERE nickname = $1`,
      [nickname]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('사용자 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 사용자 ID로 게시글 목록 조회
router.get('/:userId/posts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT 
        p.id, p.title, p.category, p.views, p.created_at,
        COUNT(DISTINCT c.id) as comment_count,
        COUNT(DISTINCT l.id) as like_count
      FROM posts p
      LEFT JOIN comments c ON p.id = c.post_id
      LEFT JOIN likes l ON p.id = l.post_id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('사용자 게시글 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;