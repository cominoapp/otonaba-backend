import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// 受信メッセージ一覧
router.get('/inbox', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      `SELECT 
        m.id, m.subject, m.content, m.is_read, m.created_at,
        u.nickname as sender_nickname, u.age_group as sender_age_group, m.sender_id,
        COUNT(mr.id) as reply_count
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN message_replies mr ON m.id = mr.message_id
      WHERE m.receiver_id = $1
      GROUP BY m.id, u.nickname, u.age_group
      ORDER BY m.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('受信メッセージ取得失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 送信メッセージ一覧
router.get('/sent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      `SELECT 
        m.id, m.subject, m.content, m.is_read, m.created_at,
        u.nickname as receiver_nickname, u.age_group as receiver_age_group, m.receiver_id,
        COUNT(mr.id) as reply_count
      FROM messages m
      JOIN users u ON m.receiver_id = u.id
      LEFT JOIN message_replies mr ON m.id = mr.message_id
      WHERE m.sender_id = $1
      GROUP BY m.id, u.nickname, u.age_group
      ORDER BY m.created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('送信メッセージ取得失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// メッセージ詳細 (返信含む)
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // メッセージ取得
    const messageResult = await pool.query(
      `SELECT 
        m.*,
        sender.nickname as sender_nickname, sender.age_group as sender_age_group,
        receiver.nickname as receiver_nickname, receiver.age_group as receiver_age_group
      FROM messages m
      JOIN users sender ON m.sender_id = sender.id
      JOIN users receiver ON m.receiver_id = receiver.id
      WHERE m.id = $1 AND (m.sender_id = $2 OR m.receiver_id = $2)`,
      [id, userId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ message: 'メッセージが見つかりません' });
    }

    const message = messageResult.rows[0];

    // 既読処理
    if (message.receiver_id === userId && !message.is_read) {
      await pool.query('UPDATE messages SET is_read = TRUE WHERE id = $1', [id]);
      message.is_read = true;
    }

    // 返信取得
    const repliesResult = await pool.query(
      `SELECT 
        mr.id, mr.content, mr.created_at, mr.user_id,
        u.nickname, u.age_group
      FROM message_replies mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1
      ORDER BY mr.created_at ASC`,
      [id]
    );

    res.json({
      ...message,
      replies: repliesResult.rows
    });
  } catch (error) {
    console.error('メッセージ詳細取得失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// メッセージ送信
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { receiver_id, subject, content } = req.body;
    const senderId = (req as any).user.id;

    if (!receiver_id || !subject || !content) {
      return res.status(400).json({ message: '必須項目を入力してください' });
    }

    if (receiver_id === senderId) {
      return res.status(400).json({ message: '自分にメッセージを送ることはできません' });
    }

    // 受信者確認
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [receiver_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'ユーザーが見つかりません' });
    }

    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, subject, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [senderId, receiver_id, subject, content]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('メッセージ送信失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// メッセージ返信作成
router.post('/:id/reply', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = (req as any).user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: '返信内容を入力してください' });
    }

    // メッセージ存在および権限確認
    const messageCheck = await pool.query(
      'SELECT sender_id, receiver_id FROM messages WHERE id = $1',
      [id]
    );

    if (messageCheck.rows.length === 0) {
      return res.status(404).json({ message: 'メッセージが見つかりません' });
    }

    const { sender_id, receiver_id } = messageCheck.rows[0];
    if (sender_id !== userId && receiver_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    // 返信作成
    const result = await pool.query(
      `INSERT INTO message_replies (message_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, userId, content]
    );

    // 返信作成者情報含む
    const replyWithUser = await pool.query(
      `SELECT 
        mr.id, mr.content, mr.created_at, mr.user_id,
        u.nickname, u.age_group
      FROM message_replies mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(replyWithUser.rows[0]);
  } catch (error) {
    console.error('返信作成失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// メッセージ削除
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const checkResult = await pool.query(
      'SELECT receiver_id FROM messages WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'メッセージが見つかりません' });
    }

    if (checkResult.rows[0].receiver_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    await pool.query('DELETE FROM messages WHERE id = $1', [id]);

    res.json({ message: 'メッセージが削除されました' });
  } catch (error) {
    console.error('メッセージ削除失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 未読メッセージ数
router.get('/unread/count', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = $1 AND is_read = FALSE',
      [userId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error('未読メッセージ数取得失敗:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;