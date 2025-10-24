import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { pool } from '../config/database.js';

const router = express.Router();

// 게시글 목록 조회 (검색 + 카테고리 필터 + 댓글 개수 + 좋아요 개수)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, page = 1, limit = 3, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT 
        p.id, p.title, p.content, p.category, p.views, p.created_at,
        u.nickname as author_nickname, u.age_group as author_age_group,
        COUNT(DISTINCT c.id) as comment_count,
        COUNT(DISTINCT l.id) as like_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN comments c ON p.id = c.post_id
      LEFT JOIN likes l ON p.id = l.post_id
    `;

    const params: any[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`p.category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(p.title ILIKE $${paramIndex} OR p.content ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` GROUP BY p.id, u.nickname, u.age_group ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), offset);

    const result = await pool.query(query, params);

    // 전체 개수 조회
    let countQuery = 'SELECT COUNT(*) FROM posts p';
    const countParams: any[] = [];
    let countParamIndex = 1;
    const countConditions: string[] = [];

    if (category) {
      countConditions.push(`p.category = $${countParamIndex}`);
      countParams.push(category);
      countParamIndex++;
    }

    if (search) {
      countConditions.push(`(p.title ILIKE $${countParamIndex} OR p.content ILIKE $${countParamIndex})`);
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (countConditions.length > 0) {
      countQuery += ' WHERE ' + countConditions.join(' AND ');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      posts: result.rows,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('게시글 목록 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

// 게시글 상세 조회 (좋아요 개수 포함)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query('UPDATE posts SET views = views + 1 WHERE id = $1', [id]);

    const result = await pool.query(
      `SELECT 
        p.id, p.title, p.content, p.category, p.views, p.created_at, p.updated_at,
        p.user_id,
        u.nickname as author_nickname, u.age_group as author_age_group,
        COUNT(DISTINCT l.id) as like_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN likes l ON p.id = l.post_id
      WHERE p.id = $1
      GROUP BY p.id, u.nickname, u.age_group`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '投稿が見つかりません' });
    }

    const post = result.rows[0];

    // 이미지 조회
    const imagesResult = await pool.query(
      'SELECT id, image_url, cloudinary_id FROM post_images WHERE post_id = $1 ORDER BY created_at ASC',
      [id]
    );

    post.images = imagesResult.rows;

    res.json(post);
  } catch (error) {
    console.error('게시글 조회 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { title, content, category = '一般', images = [] } = req.body;
    const userId = (req as any).user.id;

    if (!title || !content) {
      return res.status(400).json({ message: 'タイトルと内容を入力してください' });
    }

    // 게시글 생성
    const result = await pool.query(
      `INSERT INTO posts (user_id, title, content, category)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, title, content, category]
    );

    const post = result.rows[0];

    // 이미지 저장
    if (images && images.length > 0) {
      for (const image of images) {
        await pool.query(
          `INSERT INTO post_images (post_id, image_url, cloudinary_id)
           VALUES ($1, $2, $3)`,
          [post.id, image.url, image.cloudinary_id]
        );
      }
    }

    res.status(201).json(post);
  } catch (error) {
    console.error('게시글 작성 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, category } = req.body;
    const userId = (req as any).user.id;

    const checkResult = await pool.query(
      'SELECT user_id FROM posts WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: '投稿が見つかりません' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    const result = await pool.query(
      `UPDATE posts 
       SET title = $1, content = $2, category = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [title, content, category, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('게시글 수정 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const checkResult = await pool.query(
      'SELECT user_id FROM posts WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: '投稿が見つかりません' });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ message: '権限がありません' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [id]);

    res.json({ message: '投稿が削除されました' });
  } catch (error) {
    console.error('게시글 삭제 실패:', error);
    res.status(500).json({ message: 'サーバーエラーが発生しました' });
  }
});

export default router;