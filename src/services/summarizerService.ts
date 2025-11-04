import Anthropic from '@anthropic-ai/sdk';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

export class SummarizerService {
  private readonly anthropic: Anthropic;

  constructor(anthropicApiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });
  }

  /**
   * OCR抽出テキストを要約
   */
  async summarizeOcrText(
    text: string,
    imageContext?: {
      channelName?: string;
      userName?: string;
      timestamp?: string;
    },
  ): Promise<SummaryResult> {
    console.log(`[summarizer] Summarizing text (${text.length} chars)`);

    if (text.trim().length === 0) {
      return {
        summary: 'テキストが検出されませんでした。',
        keyPoints: [],
      };
    }

    const contextInfo = imageContext
      ? `\n\n画像の投稿情報:\n- チャンネル: ${imageContext.channelName || '不明'}\n- 投稿者: ${imageContext.userName || '不明'}\n- 日時: ${imageContext.timestamp || '不明'}`
      : '';

    const systemPrompt = `あなたは画像から抽出されたテキストを要約する専門家です。
以下のテキストは画像のOCR処理で抽出されたものです。
このテキストを読みやすく整理し、要約してください。

要約のポイント:
- 主要な内容を簡潔にまとめる
- 重要なキーワードや数値を抽出
- 読みやすい日本語で整理
- 箇条書きで重要ポイントを列挙

以下のJSON形式で出力してください:
{
  "summary": "要約文",
  "keyPoints": ["ポイント1", "ポイント2", ...]
}`;

    const userPrompt = `抽出されたテキスト:
${text}${contextInfo}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // JSONをパース
      const result = JSON.parse(content.text) as SummaryResult;

      console.log(`[summarizer] Summary generated (${result.keyPoints.length} key points)`);

      return result;
    } catch (error) {
      console.error(`[summarizer] Failed to generate summary:`, error);
      throw new Error(`要約生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
