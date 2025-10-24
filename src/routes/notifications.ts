import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 알림 목록 조회
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      `SELECT 
        n.id, n.type, n.content, n.post_id, n.is_read, n.created_at,
        u.nickname as from_user_nickname
      FROM notifications n
      LEFT JOIN users u ON n.from_user_id = u.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('알림 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 안읽은 알림 개수
router.get('/unread/count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('안읽은 알림 개수 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 알림 읽음 처리
router.put('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ message: '通知を既読にしました' });
  } catch (error) {
    console.error('알림 읽음 처리 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 모든 알림 읽음 처리
router.put('/read-all', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({ message: 'すべての通知を既読にしました' });
  } catch (error) {
    console.error('모든 알림 읽음 처리 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 알림 삭제
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ message: '通知が削除されました' });
  } catch (error) {
    console.error('알림 삭제 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 알림 생성 함수 (내부 사용)
export const createNotification = async (
  userId: string,
  type: string,
  content: string,
  postId: number | null,
  fromUserId: string
) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, content, post_id, from_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, content, postId, fromUserId]
    );
  } catch (error) {
    console.error('알림 생성 실패:', error);
  }
};

export default router;