import type { Lifelog } from '../clients/limitless.js';

export interface DailyLogEntry {
  timestamp: string;
  content: string;
}

export class DailyLogger {
  private logs: DailyLogEntry[] = [];

  /**
   * Lifelogから日記エントリーを追加
   */
  addLifelog(lifelog: Lifelog): void {
    if (!lifelog.contents || lifelog.contents.length === 0) {
      return;
    }

    const timestamp = new Date(lifelog.startTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });

    // contentsから全ての内容を結合
    const content = lifelog.contents.map((c) => c.content).join('\n');

    this.logs.push({
      timestamp,
      content,
    });
  }

  /**
   * 日記形式のMarkdownを生成
   */
  generateMarkdown(date: string): string {
    if (this.logs.length === 0) {
      return `# ${date} の記録\n\n今日は記録がありません。\n`;
    }

    const header = `# ${date} の記録\n\n`;

    const entries = this.logs
      .map((log) => {
        return `## ${log.timestamp}\n${log.content}\n\n---\n`;
      })
      .join('\n');

    return header + entries;
  }

  /**
   * ログをクリア
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * ログ件数を取得
   */
  getLogCount(): number {
    return this.logs.length;
  }
}
