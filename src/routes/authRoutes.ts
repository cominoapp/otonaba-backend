import express, { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/database.js';
import { register, login } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// ユーザー登録
router.post('/register', register);

// ログイン
router.post('/login', login);

// 비밀번호 변경 (인증 필요)
router.put('/change-password', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: '現在のパスワードと新しいパスワードを入力してください' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'パスワードは6文字以上にしてください' });
    }

    // 현재 비밀번호 확인
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: '現在のパスワードが正しくありません' });
    }

    // 새 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 비밀번호 업데이트
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'パスワードが変更されました' });
  } catch (error) {
    console.error('비밀번호 변경 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;