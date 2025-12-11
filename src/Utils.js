class Parser {
  static parseBody(text) {
    // 体重抽出
    const weightMatch = text.match(/(\d+(\.\d+)?)/);
    const weight = weightMatch ? parseFloat(weightMatch[0]) : null;

    // 健康タグ検知
    const healthTags = [];
    if (/うんち|便|快便/.test(text)) healthTags.push("うんち");
    if (/吐|ゲロ/.test(text)) healthTags.push("嘔吐");
    if (/元気/.test(text)) healthTags.push("元気");
    if (/食欲/.test(text)) healthTags.push("食欲あり");

    // 在庫補充コマンド検知 (例: "補充" または "買った")
    const isStockRefill = /補充|買った|購入/.test(text);

    return {
      weight,
      healthTags,
      isStockRefill,
      originalText: text
    };
  }
}

class Formatter {
  // ...既存のFormatterメソッド...
  
  // AIのテキストを優先しつつ、なければ既存ロジックを使うラッパー
  static formatReply(aiText, defaultText, stockAlert) {
    let body = aiText || defaultText;
    
    if (stockAlert) {
      body += `\n\n【⚠️警告】ごはんの在庫が少なくなってるニャ！そろそろ注文して！`;
    }
    return body;
  }
}
