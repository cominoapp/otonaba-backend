import express, { Request, Response } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Multer 설정 (메모리 저장)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB 제한
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です'));
    }
  }
});

// 이미지 업로드
router.post('/', authenticateToken, upload.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '画像ファイルを選択してください' });
    }

    // Buffer를 Base64로 변환
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    // Cloudinary에 업로드
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'otonaba',
      resource_type: 'image'
    });

    res.json({
      url: result.secure_url,
      cloudinary_id: result.public_id
    });
  } catch (error) {
    console.error('이미지 업로드 실패:', error);
    res.status(500).json({ message: '画像のアップロードに失敗しました' });
  }
});

// 이미지 삭제
router.delete('/:cloudinaryId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { cloudinaryId } = req.params;
    
    await cloudinary.uploader.destroy(cloudinaryId);

    res.json({ message: '画像が削除されました' });
  } catch (error) {
    console.error('이미지 삭제 실패:', error);
    res.status(500).json({ message: '画像の削除に失敗しました' });
  }
});

export default router;