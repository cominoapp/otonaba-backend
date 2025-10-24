import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

// ユーザー登録
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nickname, age_group } = req.body;

    // バリデーション
    if (!email || !password || !nickname || !age_group) {
      return res.status(400).json({ 
        success: false,
        message: '全ての項目を入力してください' 
      });
    }

    // メールアドレスの重複チェック
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'このメールアドレスは既に登録されています' 
      });
    }

    // パスワードをハッシュ化
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ユーザーを作成
    const result = await pool.query(
      `INSERT INTO users (email, password, nickname, age_group) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, nickname, age_group, trust_score, created_at`,
      [email, hashedPassword, nickname, age_group]
    );

    const user = result.rows[0];

    // JWTトークンを生成
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'ユーザー登録が完了しました',
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        age_group: user.age_group,
        trust_score: user.trust_score,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('登録エラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
};

// ログイン
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // バリデーション
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'メールアドレスとパスワードを入力してください' 
      });
    }

    // ユーザーを検索
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: 'メールアドレスまたはパスワードが間違っています' 
      });
    }

    const user = result.rows[0];

    // パスワードを確認
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'メールアドレスまたはパスワードが間違っています' 
      });
    }

    // JWTトークンを生成
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'ログインに成功しました',
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        age_group: user.age_group,
        trust_score: user.trust_score
      }
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    res.status(500).json({ 
      success: false,
      message: 'サーバーエラーが発生しました' 
    });
  }
};

// プロフィール取得
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await pool.query(
      'SELECT id, email, nickname, age_group, trust_score, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('プロフィール取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};

// パスワード変更
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { currentPassword, newPassword } = req.body;

    // バリデーション
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '現在のパスワードと新しいパスワードを入力してください'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'パスワードは6文字以上で入力してください'
      });
    }

    // 現在のユーザー情報を取得
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    const user = result.rows[0];

    // 現在のパスワードを確認
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '現在のパスワードが間違っています'
      });
    }

    // 新しいパスワードをハッシュ化
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // パスワードを更新
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: 'パスワードを変更しました'
    });
  } catch (error) {
    console.error('パスワード変更エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};