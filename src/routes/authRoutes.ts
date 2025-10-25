import express from 'express';
import { register, login, getProfile, changePassword, updateProfile } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// ユーザー登録
router.post('/register', register);

// ログイン
router.post('/login', login);

// プロフィール取得
router.get('/profile', authenticateToken, getProfile);

// パスワード変更
router.put('/change-password', authenticateToken, changePassword);

// プロフィール更新
router.put('/profile', authenticateToken, updateProfile);

export default router;