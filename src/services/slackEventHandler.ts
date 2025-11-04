import { WebClient } from '@slack/web-api';
import type { AppConfig } from '../config.js';
import { GitHubClient } from './githubClient.js';
import { OcrService } from './ocrService.js';
import { postToSlack } from './slackNotifier.js';
import { SummarizerService } from './summarizerService.js';

export interface SlackReactionEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item: {
    type: 'message';
    channel: string;
    ts: string;
  };
  event_ts: string;
}

export class SlackEventHandler {
  private readonly slackClient: WebClient;
  private readonly ocrService: OcrService | null = null;
  private readonly summarizerService: SummarizerService | null = null;
  private readonly githubClient: GitHubClient | null = null;
  private readonly triggerEmoji: string;

  constructor(private readonly config: AppConfig) {
    if (!config.slackBotToken) {
      throw new Error('SLACK_BOT_TOKEN is required for Slack OCR');
    }

    this.slackClient = new WebClient(config.slackBotToken);
    this.triggerEmoji = config.ocrTriggerEmoji;

    // OCRサービス初期化
    if (config.slackBotToken) {
      this.ocrService = new OcrService(
        config.slackBotToken,
        config.googleCloudCredentialsPath,
        config.googleCloudCredentialsJson,
      );
    }

    // 要約サービス初期化
    if (config.anthropicApiKey) {
      this.summarizerService = new SummarizerService(config.anthropicApiKey);
    }

    // GitHubクライアント初期化
    if (config.githubToken && config.githubOwner && config.githubRepo) {
      this.githubClient = new GitHubClient(config);
    }
  }

  /**
   * Slack reaction_added イベントを処理
   */
  async handleReactionAdded(event: SlackReactionEvent): Promise<void> {
    console.log(`[slack-event] Received reaction: ${event.reaction} on message ${event.item.ts}`);

    // トリガー絵文字でない場合は無視
    if (event.reaction !== this.triggerEmoji) {
      console.log(`[slack-event] Ignoring reaction (not trigger emoji: ${this.triggerEmoji})`);
      return;
    }

    console.log(`[slack-event] Trigger emoji detected, processing OCR...`);

    try {
      // メッセージを取得
      const message = await this.fetchMessage(event.item.channel, event.item.ts);

      // 画像URLを抽出
      const imageUrl = this.extractImageUrl(message);
      if (!imageUrl) {
        console.log(`[slack-event] No image found in message`);
        await this.postErrorNotification(event.item.channel, 'メッセージに画像が見つかりませんでした。');
        return;
      }

      // OCR実行
      if (!this.ocrService) {
        throw new Error('OCR service not initialized');
      }
      const ocrResult = await this.ocrService.extractTextFromSlackImage(imageUrl);

      if (!ocrResult.text || ocrResult.text.trim().length === 0) {
        console.log(`[slack-event] No text detected in image`);
        await this.postErrorNotification(event.item.channel, 'テキストが検出されませんでした。');
        return;
      }

      // 要約生成
      if (!this.summarizerService) {
        throw new Error('Summarizer service not initialized');
      }

      const channelInfo = await this.getChannelInfo(event.item.channel);
      const messageUser = typeof message.user === 'string' ? message.user : event.user;
      const userInfo = await this.getUserInfo(messageUser);

      const summaryResult = await this.summarizerService.summarizeOcrText(ocrResult.text, {
        channelName: channelInfo.name,
        userName: userInfo.name,
        timestamp: new Date(parseFloat(event.item.ts) * 1000).toISOString(),
      });

      // GitHubに保存
      await this.saveToGitHub({
        ocrText: ocrResult.text,
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints,
        metadata: {
          channelName: channelInfo.name,
          userName: userInfo.name,
          timestamp: new Date(parseFloat(event.item.ts) * 1000).toISOString(),
          imageUrl,
          confidence: ocrResult.confidence,
        },
      });

      // Slackに成功通知
      await this.postSuccessNotification(event.item.channel, {
        summary: summaryResult.summary,
        keyPoints: summaryResult.keyPoints,
        confidence: ocrResult.confidence,
      });

      console.log(`[slack-event] OCR processing completed successfully`);
    } catch (error) {
      console.error(`[slack-event] Failed to process OCR:`, error);
      await this.postErrorNotification(
        event.item.channel,
        `OCR処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Slackメッセージを取得
   */
  private async fetchMessage(channel: string, ts: string): Promise<Record<string, unknown>> {
    const result = await this.slackClient.conversations.history({
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    });

    if (!result.messages || result.messages.length === 0) {
      throw new Error('Message not found');
    }

    return result.messages[0] as Record<string, unknown>;
  }

  /**
   * メッセージから画像URLを抽出
   */
  private extractImageUrl(message: Record<string, unknown>): string | null {
    const files = message.files as Array<{ url_private?: string; mimetype?: string }> | undefined;

    if (!files || files.length === 0) {
      return null;
    }

    // 画像ファイルを探す
    const imageFile = files.find((file) => file.mimetype?.startsWith('image/'));

    return imageFile?.url_private || null;
  }

  /**
   * チャンネル情報を取得
   */
  private async getChannelInfo(channelId: string): Promise<{ name: string }> {
    try {
      const result = await this.slackClient.conversations.info({ channel: channelId });
      const channel = result.channel as { name?: string } | undefined;
      return { name: channel?.name || channelId };
    } catch (error) {
      console.error(`[slack-event] Failed to get channel info:`, error);
      return { name: channelId };
    }
  }

  /**
   * ユーザー情報を取得
   */
  private async getUserInfo(userId: string): Promise<{ name: string }> {
    try {
      const result = await this.slackClient.users.info({ user: userId });
      const user = result.user as { name?: string; real_name?: string } | undefined;
      return { name: user?.real_name || user?.name || userId };
    } catch (error) {
      console.error(`[slack-event] Failed to get user info:`, error);
      return { name: userId };
    }
  }

  /**
   * GitHubに保存
   */
  private async saveToGitHub(params: {
    ocrText: string;
    summary: string;
    keyPoints: string[];
    metadata: {
      channelName?: string;
      userName?: string;
      timestamp?: string;
      imageUrl?: string;
      confidence?: number;
    };
  }): Promise<void> {
    if (!this.githubClient) {
      console.log(`[slack-event] GitHub client not initialized, skipping save`);
      return;
    }

    const timestamp = params.metadata.timestamp || new Date().toISOString();
    const fileName = `ocr_${timestamp.replace(/[:.]/g, '-')}.md`;
    const filePath = `${this.config.ocrGithubPath}/${fileName}`;

    const markdown = `# OCR Result

**Date**: ${timestamp}
**Channel**: ${params.metadata.channelName || 'N/A'}
**User**: ${params.metadata.userName || 'N/A'}
**Confidence**: ${params.metadata.confidence?.toFixed(2) || 'N/A'}

## Summary
${params.summary}

## Key Points
${params.keyPoints.map((point) => `- ${point}`).join('\n')}

## Extracted Text
\`\`\`
${params.ocrText}
\`\`\`

${params.metadata.imageUrl ? `## Original Image\n![Image](${params.metadata.imageUrl})` : ''}
`;

    await this.githubClient.createOrUpdateFile({
      path: filePath,
      content: markdown,
      message: `Add OCR result: ${fileName}`,
    });

    console.log(`[slack-event] Saved to GitHub: ${filePath}`);
  }

  /**
   * 成功通知をSlackに投稿
   */
  private async postSuccessNotification(
    channel: string,
    result: {
      summary: string;
      keyPoints: string[];
      confidence: number;
    },
  ): Promise<void> {
    const message = `✅ OCR処理が完了しました！

**要約**
${result.summary}

**重要ポイント**
${result.keyPoints.map((point) => `• ${point}`).join('\n')}

_Confidence: ${(result.confidence * 100).toFixed(1)}%_
`;

    await postToSlack(this.config, message);
  }

  /**
   * エラー通知をSlackに投稿
   */
  private async postErrorNotification(channel: string, errorMessage: string): Promise<void> {
    await postToSlack(this.config, `❌ OCR処理エラー\n\n${errorMessage}`);
  }
}
