const CONFIG = {
  SHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', // ★IDを設定

  // 機能フラグ
  FEATURES: {
    USE_GEMINI: true,      // Geminiを使うか (APIキー設定が必要)
    ENABLE_CHART: true,    // グラフを添付するか
    ENABLE_STOCK: true     // 在庫管理をするか
  },

  SYSTEM: {
    TIME_ZONE: "Asia/Tokyo",
    WEIGHT_IGNORE_LIMIT: 30.0,
    GEMINI_MODEL: "gemini-pro"
  },

  MAIL: {
    SUBJECT_BASE: "ごはんの時間",
    SEARCH_QUERY: (subject) => `is:unread subject:"Re: ${subject}"`,
    TARGET_EMAIL: () => Session.getActiveUser().getEmail()
  },

  SHEETS: {
    CONFIG: "設定",
    LOG: "記録"
  },

  // カラム定義の更新（健康タグや在庫用）
  CELLS: {
    // ...既存の設定...
    WEIGHT_CURRENT:  "B3",
    WEIGHT_TARGET:   "B4",
    DATE_LIMIT:      "B5",
    // 新規: 在庫管理
    STOCK_CURRENT:   "B10", // 新設: 現在の在庫(g)
    STOCK_WARN_LIMIT:"B11", // 新設: 警告ライン(g)
    
    // 既存
    TIME_START_ROW: 9,
    TIME_COL: 2
  }
};

/**
 * Gemini APIキーの取得ヘルパー
 * プロパティストアに 'GEMINI_API_KEY' が設定されているか確認
 */
function getGeminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}
