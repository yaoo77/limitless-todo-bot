import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';

import type { AppConfig } from '../config.js';
import { type SlackReactionEvent, SlackEventHandler } from '../services/slackEventHandler.js';

export class ExpressServer {
  private readonly app: express.Application;
  private readonly eventHandler: SlackEventHandler;
  private readonly signingSecret: string;

  constructor(private readonly config: AppConfig) {
    if (!config.slackSigningSecret) {
      throw new Error('SLACK_SIGNING_SECRET is required for Slack OCR');
    }

    this.signingSecret = config.slackSigningSecret;
    this.app = express();
    this.eventHandler = new SlackEventHandler(config);

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * ミドルウェアのセットアップ
   */
  private setupMiddleware(): void {
    // rawBodyを保存するミドルウェア（署名検証用）
    this.app.use(
      express.json({
        verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
  }

  /**
   * ルートのセットアップ
   */
  private setupRoutes(): void {
    // ヘルスチェック
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Slackイベントエンドポイント
    this.app.post('/slack/events', async (req: Request, res: Response) => {
      try {
        // 署名検証
        if (!this.verifySlackRequest(req)) {
          console.error(`[express] Invalid Slack signature`);
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }

        const payload = req.body as {
          type?: string;
          challenge?: string;
          event?: SlackReactionEvent;
        };

        // URL検証チャレンジ
        if (payload.type === 'url_verification') {
          console.log(`[express] Responding to URL verification challenge`);
          res.json({ challenge: payload.challenge });
          return;
        }

        // イベント処理
        if (payload.type === 'event_callback' && payload.event) {
          const event = payload.event;

          // 即座に200を返す（Slackの3秒ルール対応）
          res.status(200).send('');

          // reaction_addedイベントの処理
          if (event.type === 'reaction_added') {
            console.log(`[express] Processing reaction_added event`);
            await this.eventHandler.handleReactionAdded(event);
          } else {
            console.log(`[express] Ignoring event type: ${event.type}`);
          }

          return;
        }

        // その他のリクエスト
        console.log(`[express] Unknown payload type: ${payload.type}`);
        res.status(400).json({ error: 'Unknown payload type' });
      } catch (error) {
        console.error(`[express] Error handling Slack event:`, error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Slackリクエストの署名を検証
   */
  private verifySlackRequest(req: Request & { rawBody?: Buffer }): boolean {
    const slackSignature = req.headers['x-slack-signature'] as string | undefined;
    const slackTimestamp = req.headers['x-slack-request-timestamp'] as string | undefined;

    if (!slackSignature || !slackTimestamp) {
      console.error(`[express] Missing Slack signature headers`);
      return false;
    }

    // タイムスタンプチェック（5分以内）
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(slackTimestamp, 10);
    if (Math.abs(currentTime - requestTime) > 60 * 5) {
      console.error(`[express] Request timestamp too old`);
      return false;
    }

    // 署名検証
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const sigBasestring = `v0:${slackTimestamp}:${rawBody}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', this.signingSecret)
      .update(sigBasestring)
      .digest('hex')}`;

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(slackSignature, 'utf8'),
    );

    if (!isValid) {
      console.error(`[express] Invalid Slack signature`);
    }

    return isValid;
  }

  /**
   * サーバー起動
   */
  start(): void {
    const port = this.config.expressPort;

    this.app.listen(port, () => {
      console.log(`[express] Server listening on port ${port}`);
      console.log(`[express] Slack events endpoint: http://localhost:${port}/slack/events`);
      console.log(`[express] Health check: http://localhost:${port}/health`);
    });
  }
}
