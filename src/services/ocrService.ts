import vision from '@google-cloud/vision';
import { WebClient } from '@slack/web-api';
import { fetch, Response } from 'undici';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface OcrResult {
  text: string;
  confidence: number;
}

export class OcrService {
  private readonly visionClient: vision.ImageAnnotatorClient;
  private readonly slackClient: WebClient;

  constructor(
    slackBotToken: string,
    googleCredentialsPath?: string,
  ) {
    this.slackClient = new WebClient(slackBotToken);

    // Google Cloud Vision クライアント初期化
    if (googleCredentialsPath) {
      this.visionClient = new vision.ImageAnnotatorClient({
        keyFilename: googleCredentialsPath,
      });
    } else {
      // 環境変数 GOOGLE_APPLICATION_CREDENTIALS が設定されている場合
      this.visionClient = new vision.ImageAnnotatorClient();
    }
  }

  /**
   * Slack画像URLから画像をダウンロードしてOCR実行
   */
  async extractTextFromSlackImage(imageUrl: string): Promise<OcrResult> {
    console.log(`[ocr] Downloading image from Slack: ${imageUrl}`);

    // Slackから画像をダウンロード
    const imageBuffer = await this.downloadSlackImage(imageUrl);

    // 一時ファイルに保存
    const tempFilePath = path.join(os.tmpdir(), `ocr-${Date.now()}.jpg`);
    await fs.writeFile(tempFilePath, imageBuffer);

    try {
      // OCR実行
      const result = await this.performOcr(tempFilePath);
      return result;
    } finally {
      // 一時ファイル削除
      await fs.unlink(tempFilePath).catch(() => {
        /* ignore */
      });
    }
  }

  /**
   * Slackから画像をダウンロード
   */
  private async downloadSlackImage(imageUrl: string): Promise<Buffer> {
    const response = (await fetch(imageUrl, {
      headers: {
        Authorization: `Bearer ${this.slackClient.token}`,
      },
    })) as Response;

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Google Cloud Vision APIでOCR実行
   */
  private async performOcr(imagePath: string): Promise<OcrResult> {
    console.log(`[ocr] Performing OCR on image: ${imagePath}`);

    const [result] = await this.visionClient.textDetection(imagePath);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      console.log(`[ocr] No text detected`);
      return {
        text: '',
        confidence: 0,
      };
    }

    // 最初の要素が全体のテキスト
    const fullText = detections[0].description || '';
    const confidence = detections[0].confidence || 0;

    console.log(`[ocr] Extracted text (${fullText.length} chars, confidence: ${confidence})`);

    return {
      text: fullText,
      confidence,
    };
  }
}
