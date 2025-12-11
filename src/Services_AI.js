class AiService {
  constructor() {
    this.apiKey = getGeminiApiKey();
    // フラグがOFF、またはキーがない場合は無効化
    this.isEnabled = CONFIG.FEATURES.USE_GEMINI && !!this.apiKey;
  }

  /**
   * 猫になりきって返信を生成
   * @param {Object} metrics 体重などの数値データ
   * @param {string} userMessage ユーザーからのメール本文
   * @param {Array} healthTags 健康状態タグ
   */
  generateCatReply(metrics, userMessage, healthTags) {
    if (!this.isEnabled) {
      return null; // AIを使わない場合はnullを返し、従来のロジックへ
    }

    const systemPrompt = `
      あなたは私の飼い猫です。名前は特に名乗らなくていいです。
      少し生意気ですが、飼い主（私）のことは好きです。語尾は「ニャ」です。
      
      現在の状況:
      - 体重: ${metrics.currentWeight}kg (目標まであと ${metrics.diff}kg)
      - 今日の体調: ${healthTags.join(', ') || '特になし'}
      - 飼い主のメッセージ: "${userMessage}"
      
      この状況を踏まえて、100文字以内で返信してください。
      ダイエットの進捗が良い時は褒めて、悪い時は叱ってください。
      体調について言及があれば、それを気遣ってください。
    `;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.SYSTEM.GEMINI_MODEL}:generateContent?key=${this.apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: systemPrompt }] }]
      };

      const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(url, options);
      const json = JSON.parse(response.getContentText());

      if (json.candidates && json.candidates[0].content) {
        return json.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      console.error("Gemini API Error:", e);
    }
    return null; // エラー時もnullでフォールバック
  }
}
