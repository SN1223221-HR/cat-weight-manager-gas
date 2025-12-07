/**
 * cat-weight-manager-gas
 * GitHub: https://github.com/[YourUsername]/cat-weight-manager-gas
 * License: MIT
 */

// ==========================================
// 1. Configuration (設定・定数定義)
// ==========================================
const CONFIG = {
  // 【重要】ここにあなたのスプレッドシートIDを貼ってください
  // URLが https://docs.google.com/spreadsheets/d/abc12345.../edit なら
  // 'abc12345...' の部分です。
  SHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', 
  
  // メール設定
  MAIL: {
    SUBJECT_BASE: "ごはんの時間",
    // 検索クエリ生成: 誤作動防止のため件名を厳密に指定
    SEARCH_QUERY: (subject) => `is:unread subject:"Re: ${subject}"`
  },

  // シート名定義（スプレッドシートのタブ名と一致させること）
  SHEET_NAMES: {
    CONFIG: "設定",
    LOG: "記録"
  },

  // 設定シートのセルマッピング (レイアウト変更時はここを修正)
  CELLS: {
    WEIGHT_CURRENT: "B3",
    WEIGHT_TARGET:  "B4",
    DATE_LIMIT:     "B5",
    THRESHOLD:      "B6",
    KCAL:           "B7",
    ACTIVITY_FACTOR:"B8",
    TIME_START_ROW: 9,   // 給与時間の開始行
    TIME_COL:       2    // 給与時間の列 (B列=2)
  },

  // アプリケーションロジック定数
  CONSTANTS: {
    WEIGHT_IGNORE_LIMIT: 30.0, // これ以上の数値は体重として扱わない(年号誤認防止)
    DATE_FMT_LOG: "yyyy/MM/dd HH:mm:ss",
    DATE_FMT_MAIL: "MM/dd HH:mm",
    TIME_ZONE: "Asia/Tokyo"
  }
};

// ==========================================
// 2. Main Triggers (エントリーポイント)
// ==========================================

/**
 * トリガー実行: 定期的な時刻チェックとリマインダー送信
 * 推奨トリガー設定: 1分〜10分おき
 */
function timeBasedTrigger() {
  try {
    // IDが設定されていない場合はエラーにする
    if (CONFIG.SHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
      throw new Error("スプレッドシートIDが設定されていません。コード内のCONFIG.SHEET_IDを書き換えてください。");
    }

    const repository = new SheetRepository();
    const targetTimes = repository.getFeedingTimes();
    
    // 現在時刻(HH:mm)の取得
    const now = new Date();
    const currentStr = Utilities.formatDate(now, CONFIG.CONSTANTS.TIME_ZONE, "HH:mm");

    // 設定時刻リストに含まれていれば送信
    if (targetTimes.includes(currentStr)) {
      sendRiceReminder();
    }
  } catch (e) {
    console.error("TimeTrigger Error:", e.stack);
  }
}

/**
 * トリガー実行: 未読メールのチェックと記録処理
 * 推奨トリガー設定: 1分おき
 */
function checkMailAndRecord() {
  try {
    if (CONFIG.SHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') return;

    const mailService = new MailService();
    const threads = mailService.findUnreadThreads();

    if (threads.length === 0) return;

    // リポジトリとサービスの初期化
    const repository = new SheetRepository();
    const settings = repository.getSettings();
    const calculator = new DietCalculator(settings);

    // 各スレッドの未読メッセージを処理
    threads.forEach(thread => {
      const messages = thread.getMessages();
      const message = messages[messages.length - 1]; // 最新のメッセージ

      if (message.isUnread()) {
        processSingleMessage(message, repository, calculator);
      }
    });

  } catch (e) {
    console.error("MailCheck Error:", e.stack);
  }
}

/**
 * 個別のメッセージ処理ロジック
 */
function processSingleMessage(message, repository, calculator) {
  const body = message.getPlainBody();
  const mailTime = message.getDate(); // 送信時刻(正確なタイムスタンプ)
  
  // 本文から数値を抽出
  const parsedWeight = Parser.extractWeight(body);
  
  let resultData = {
    date: mailTime,
    action: "完了",
    weight: "",
    advice: ""
  };
  
  let replyBody = "";

  // 体重データが存在し、かつ有効範囲内(30kg未満)の場合
  if (parsedWeight !== null && parsedWeight < CONFIG.CONSTANTS.WEIGHT_IGNORE_LIMIT) {
    // --- A. 体重記録モード ---
    resultData.action = "体重記録";
    resultData.weight = parsedWeight;

    // シート更新・計算・コンテンツ取得
    repository.updateCurrentWeight(parsedWeight);
    const metrics = calculator.calculateMetrics(parsedWeight);
    const catInfo = ContentService.getAdviceOrTrivia(metrics.isOverWeight, metrics.isGoalAchieved);

    // 文面生成
    resultData.advice = Formatter.formatLogAdvice(metrics, catInfo);
    replyBody = Formatter.formatReplyWithWeight(metrics, catInfo);

  } else {
    // --- B. ごはん完了のみモード ---
    const trivia = ContentService.getTrivia();
    
    // ログにはアドバイスを残さないが、返信にはトリビアを載せる
    replyBody = Formatter.formatReplyEmpty(trivia);
  }

  // ログ保存 & 返信 & 既読化
  repository.appendLog(resultData);
  message.reply(replyBody);
  message.markRead();
}

/**
 * リマインダー送信処理
 */
function sendRiceReminder() {
  const now = new Date();
  const timeStr = Utilities.formatDate(now, CONFIG.CONSTANTS.TIME_ZONE, CONFIG.CONSTANTS.DATE_FMT_MAIL);
  const subject = `${CONFIG.MAIL.SUBJECT_BASE} (${timeStr})`;
  const body = Formatter.formatReminderBody(timeStr);
  
  MailApp.sendEmail(Session.getActiveUser().getEmail(), subject, body);
}


// ==========================================
// 3. Domain Logic Classes (ロジック・計算)
// ==========================================

class DietCalculator {
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * 各種指標の計算
   * @param {number} currentWeight 
   * @returns {Object} 計算結果オブジェクト
   */
  calculateMetrics(currentWeight) {
    const s = this.settings;
    
    // カロリー計算 (RER * ActivityFactor)
    // RER = 70 * (体重)^0.75
    const RER = 70 * Math.pow(currentWeight, 0.75);
    const DER = RER * s.activityFactor;
    const gramPerDay = Math.round((DER / s.kcalPer100g) * 100);
    
    // 目標差異
    const diff = parseFloat((currentWeight - s.targetWeight).toFixed(1));
    
    // 残り日数
    const now = new Date();
    const daysLeft = Math.ceil((s.limitDate - now) / (1000 * 60 * 60 * 24));

    return {
      currentWeight: currentWeight,
      gramPerDay: gramPerDay,
      diff: diff,
      daysLeft: daysLeft,
      isOverWeight: currentWeight > (s.targetWeight + s.threshold),
      isGoalAchieved: diff <= 0
    };
  }
}

// ==========================================
// 4. Infrastructure/Services (外部連携)
// ==========================================

class SheetRepository {
  constructor() {
    this.ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    this.configSheet = this.ss.getSheetByName(CONFIG.SHEET_NAMES.CONFIG);
    this.logSheet = this.ss.getSheetByName(CONFIG.SHEET_NAMES.LOG);
  }

  /**
   * 設定値の一括取得
   */
  getSettings() {
    const s = this.configSheet;
    return {
      currentWeight:  s.getRange(CONFIG.CELLS.WEIGHT_CURRENT).getValue(),
      targetWeight:   s.getRange(CONFIG.CELLS.WEIGHT_TARGET).getValue(),
      limitDate:      new Date(s.getRange(CONFIG.CELLS.DATE_LIMIT).getValue()),
      threshold:      s.getRange(CONFIG.CELLS.THRESHOLD).getValue(),
      kcalPer100g:    s.getRange(CONFIG.CELLS.KCAL).getValue(),
      activityFactor: s.getRange(CONFIG.CELLS.ACTIVITY_FACTOR).getValue()
    };
  }

  /**
   * 給与時間リストの取得（空セルを除外）
   */
  getFeedingTimes() {
    const lastRow = this.configSheet.getLastRow();
    if (lastRow < CONFIG.CELLS.TIME_START_ROW) return [];

    const range = this.configSheet.getRange(
      CONFIG.CELLS.TIME_START_ROW, 
      CONFIG.CELLS.TIME_COL, 
      lastRow - CONFIG.CELLS.TIME_START_ROW + 1, 
      1
    );
    // 2次元配列を平坦化し、空文字を除去
    return range.getDisplayValues().flat().filter(t => t !== "");
  }

  updateCurrentWeight(weight) {
    this.configSheet.getRange(CONFIG.CELLS.WEIGHT_CURRENT).setValue(weight);
  }

  appendLog(data) {
    // [日時, アクション, 体重, アドバイス]
    this.logSheet.appendRow([data.date, data.action, data.weight, data.advice]);
  }
}

class MailService {
  findUnreadThreads() {
    const query = CONFIG.MAIL.SEARCH_QUERY(CONFIG.MAIL.SUBJECT_BASE);
    return GmailApp.search(query);
  }
}

class ContentService {
  /**
   * 状況に応じたコンテンツ（アドバイス or 雑学）の取得
   */
  static getAdviceOrTrivia(isOverWeight, isGoalAchieved) {
    if (isOverWeight) {
      return { type: 'alert', text: this.fetchContent("猫 ダイエット 方法") };
    } else if (isGoalAchieved) {
      return { type: 'success', text: "目標達成中です！" };
    } else {
      return { type: 'trivia', text: this.fetchContent("猫 豆知識") };
    }
  }

  static getTrivia() {
    return this.fetchContent("猫 豆知識");
  }

  static fetchContent(keyword) {
    try {
      // ダイエット関連の場合は固定Tipsからランダム表示（APIの質を考慮）
      if (keyword.includes("ダイエット")) {
        const tips = [
          "おやつを少し減らして、遊びの時間を増やしてニャ。",
          "早食い防止のお皿を使うと満足感がアップするニャ。",
          "1日のごはんを数回に分けると空腹感が減るニャ。",
          "ウェットフードを活用してカロリーオフしてみるニャ。"
        ];
        return tips[Math.floor(Math.random() * tips.length)];
      } else {
        // Cat Fact API (English) -> Google Translate (Japanese)
        const response = UrlFetchApp.fetch("https://catfact.ninja/fact");
        const json = JSON.parse(response.getContentText());
        return LanguageApp.translate(json.fact, 'en', 'ja');
      }
    } catch (e) {
      // APIエラー時のフォールバック
      return "猫は世界で一番かわいい生き物です。";
    }
  }
}

// ==========================================
// 5. Utilities (ヘルパー関数・フォーマッタ)
// ==========================================

class Parser {
  static extractWeight(text) {
    const match = text.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : null;
  }
}

class Formatter {
  // 顔文字を使用して親しみやすく、かつ文字化けを防ぐ
  static formatReminderBody(timeStr) {
    return `ごはんの時間だニャ (${timeStr})\n\n` +
           `-- 使い方 --\n` +
           `そのまま返信 → 完了記録のみ\n` +
           `体重を入れて返信 → 記録＆アドバイス\n\n` +
           `待ってるニャ (=^・^=)`;
  }

  static formatLogAdvice(m, content) {
    // 記号を使用して視認性を確保
    let text = `■現在: ${m.currentWeight}kg (目標まで ${m.diff}kg)\n` +
               `■期限: 残り ${m.daysLeft}日\n` +
               `■給与量: 1日 約${m.gramPerDay}g`;
    
    if (content.type === 'alert') {
      text += `\n\n(>_<) 目標オーバーです！\nAIアドバイス: ${content.text}`;
    } else if (content.type === 'success') {
      text += `\n\nヽ(=´▽\`=)ﾉ ${content.text}`;
    } else {
      text += `\n\n(・o・)! 豆知識: ${content.text}`;
    }
    return text;
  }

  static formatReplyWithWeight(m, content) {
    return `[記録OK] ありがとうございます♪\n(体重記録)\n\n${this.formatLogAdvice(m, content)}`;
  }

  static formatReplyEmpty(trivia) {
    return `[記録OK] ごはん完了だニャ♪\n(体重データなし)\n\n(=^・^=) 豆知識: ${trivia}`;
  }
}
