class SheetRepository {
  // ...constructor等は既存通り...

  /**
   * 在庫の更新処理
   * @param {number} amountUsed 消費量(g)
   * @param {boolean} isRefill 補充フラグ
   */
  updateStock(amountUsed, isRefill) {
    if (!CONFIG.FEATURES.ENABLE_STOCK) return null;

    const stockCell = this.configSheet.getRange(CONFIG.CELLS.STOCK_CURRENT);
    const currentStock = stockCell.getValue() || 0;
    
    let newStock;
    if (isRefill) {
      newStock = 2000; // ★とりあえず2kg補充と仮定（またはメールから数値抽出も可）
    } else {
      newStock = currentStock - amountUsed;
    }
    
    stockCell.setValue(newStock);
    
    // 警告判定
    const warnLimit = this.configSheet.getRange(CONFIG.CELLS.STOCK_WARN_LIMIT).getValue();
    return newStock < warnLimit;
  }

  appendLog(data) {
    // 健康タグや在庫情報をログに追加できるように列を拡張
    // [日時, アクション, 体重, アドバイス, 健康タグ]
    this.logSheet.appendRow([
      data.date, 
      data.action, 
      data.weight, 
      data.advice,
      data.healthTags.join(',') // E列にタグ保存
    ]);
  }
  
  getLogSheet() {
    return this.logSheet;
  }
}
