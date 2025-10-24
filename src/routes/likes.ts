import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { createNotification } from './notifications.js';

const router = express.Router();

// 특정 게시글의 좋아요 여부 확인
router.get('/posts/:postId/check', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId = (req as any).user.id;

    const result = await pool.query(
      'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    res.json({ isLiked: result.rows.length > 0 });
  } catch (error) {
    console.error('좋아요 확인 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 좋아요 토글 (추가/제거)
router.post('/posts/:postId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const userId = (req as any).user.id;

    // 게시글 존재 확인
    const postCheck = await pool.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ message: '投稿が見つかりません' });
    }

    // 이미 좋아요했는지 확인
    const likeCheck = await pool.query(
      'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    if (likeCheck.rows.length > 0) {
      // 좋아요 제거
      await pool.query(
        'DELETE FROM likes WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      );
      
      // 좋아요 개수 조회
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM likes WHERE post_id = $1',
        [postId]
      );

      res.json({ 
        isLiked: false, 
        likeCount: parseInt(countResult.rows[0].count),
        message: 'いいねを取り消しました'
      });
    } else {
  // 좋아요 추가
  await pool.query(
    'INSERT INTO likes (post_id, user_id) VALUES ($1, $2)',
    [postId, userId]
  );

  // 게시글 작성자 확인
  const postResult = await pool.query(
    'SELECT user_id, title FROM posts WHERE id = $1',
    [postId]
  );

  const postAuthorId = postResult.rows[0].user_id;
  const postTitle = postResult.rows[0].title;

  // 알림 생성 (자기 게시글이 아닐 때만)
  if (postAuthorId !== userId) {
    await createNotification(
      postAuthorId,
      'like',
      `「${postTitle}」にいいねがつきました`,
      Number(postId),
      userId
    );
  }

      // 좋아요 개수 조회
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM likes WHERE post_id = $1',
        [postId]
      );

      res.json({ 
        isLiked: true, 
        likeCount: parseInt(countResult.rows[0].count),
        message: 'いいねしました'
      });
    }
  } catch (error) {
    console.error('좋아요 토글 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;