import express, { Request, Response } from 'express';
import { pool } from '../config/database.js';
import { authenticateToken } from '../middleware/authMiddleware.js';


const router = express.Router();

// 게시글 목록 조회 (검색 + 카테고리 필터 + 댓글 개수 + 좋아요 개수)
router.get('/', async (req: Request, res: Response) => {
  try {
    // 쿼리 매개변수 타입 명시적 변환
    const { category, page: rawPage = '1', limit: rawLimit = '3', search } = req.query;
    const page = parseInt(rawPage as string, 10);
    const limit = parseInt(rawLimit as string, 10);
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        p.id, p.title, p.content, p.category, p.views, p.created_at,
        p.user_id, p.updated_at, -- 상세 정보에 필요한 필드 추가
        u.nickname as author_nickname, u.age_group as author_age_group, u.gender as author_gender, u.region as author_region,
        COUNT(DISTINCT c.id) as comment_count,
        COUNT(DISTINCT l.id) as like_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN comments c ON p.id = c.post_id
      LEFT JOIN likes l ON p.id = l.post_id
    `;

    const params: (string | number)[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`p.category = $${paramIndex}`);
      params.push(category as string);
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

    // GROUP BY p.id 로 단순화 (p.id가 PK이므로 모든 p.* 컬럼은 함수적으로 종속됨)
    query += ` GROUP BY p.id, u.nickname, u.age_group, u.gender, u.region, p.user_id, p.title, p.content, p.category, p.views, p.created_at, p.updated_at ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    // NOTE: 안정성을 위해 모든 SELECT 필드를 GROUP BY에 넣는 PostgreSQL 표준 방식 유지

    params.push(limit, offset);

    const result = await pool.query(query, params);

    // 전체 개수 조회
    let countQuery = 'SELECT COUNT(*) FROM posts p';
    const countParams: (string | number)[] = [];
    let countParamIndex = 1;
    const countConditions: string[] = [];

    if (category) {
      countConditions.push(`p.category = $${countParamIndex}`);
      countParams.push(category as string);
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
    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      posts: result.rows,
      pagination: {
        total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(total / limit)
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
        u.gender as author_gender, u.region as author_region, -- ⭐ 필드 추가 ⭐
        COUNT(DISTINCT l.id) as like_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN likes l ON p.id = l.post_id
      WHERE p.id = $1
      GROUP BY p.id, u.nickname, u.age_group, u.gender, u.region, p.user_id, p.title, p.content, p.category, p.views, p.created_at, p.updated_at`,
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
    // NOTE: TypeScript 안정성을 위해 CustomRequest 인터페이스를 사용하거나, req.user가 존재하는지 확인하는 것이 좋습니다.
    const userId = (req as any).user.id; 

    if (!title || !content) {
      return res.status(400).json({ message: 'タイトルと内容を入力してください' });
    }

    // 게시글 생성 (RETURNING *를 사용하여 생성된 모든 필드를 즉시 반환)
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

// 게시글 수정 (토큰 인증 필요)
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

    // 권한 확인: 게시글 소유자와 현재 인증된 사용자가 같은지 확인
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

// 게시글 삭제 (토큰 인증 필요)
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

    // 권한 확인: 게시글 소유자와 현재 인증된 사용자가 같은지 확인
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
