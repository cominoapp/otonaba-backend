import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { createNotification } from './notifications.js';

const router = express.Router();

// 특정 게시글의 댓글 목록 조회
router.get('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const result = await pool.query(
      `SELECT 
        c.id, c.content, c.created_at, c.updated_at, c.user_id,
        u.nickname as author_nickname, u.age_group as author_age_group
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC`,
      [postId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('댓글 목록 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 댓글 작성 (인증 필요)
router.post('/posts/:postId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = (req as any).user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'コメントを入力してください' });
    }

    // 게시글 작성자 확인
    const postResult = await pool.query(
      'SELECT user_id, title FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: '投稿が見つかりません' });
    }

    const postAuthorId = postResult.rows[0].user_id;
    const postTitle = postResult.rows[0].title;

    // 댓글 작성
    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [postId, userId, content]
    );

    const commentWithUser = await pool.query(
      `SELECT 
        c.id, c.post_id, c.user_id, c.content, c.created_at, c.updated_at,
        u.nickname as author_nickname, u.age_group as author_age_group
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1`,
      [result.rows[0].id]
    );

    // 알림 생성 (자기 게시글이 아닐 때만)
    if (postAuthorId !== userId) {
      await createNotification(
        postAuthorId,
        'comment',
        `「${postTitle}」にコメントがつきました`,
        Number(postId),
        userId
      );
    }

    res.status(201).json(commentWithUser.rows[0]);
  } catch (error) {
    console.error('댓글 작성 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 댓글 수정 (인증 필요, 본인만)
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = (req as any).user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'コメント内容を入力してください' });
    }

    // 작성자 확인
    const checkResult = await pool.query(
      'SELECT user_id FROM comments WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'コメントが見つかりません' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    // 수정
    await pool.query(
      `UPDATE comments 
       SET content = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [content, id]
    );

    // 수정된 댓글 조회
    const result = await pool.query(
      `SELECT 
        c.id, c.content, c.created_at, c.updated_at, c.user_id,
        u.nickname as author_nickname, u.age_group as author_age_group
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('댓글 수정 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 댓글 삭제 (인증 필요, 본인만)
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // 작성자 확인
    const checkResult = await pool.query(
      'SELECT user_id FROM comments WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'コメントが見つかりません' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    // 삭제
    await pool.query('DELETE FROM comments WHERE id = $1', [id]);

    res.json({ message: 'コメントが削除されました' });
  } catch (error) {
    console.error('댓글 삭제 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;