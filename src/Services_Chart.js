class ChartService {
  constructor(sheet) {
    this.sheet = sheet;
  }

  /**
   * 直近30件の体重推移グラフ画像を生成
   */
  createWeightChartBlob() {
    // データ範囲の取得 (A列:日時, C列:体重 と仮定)
    const lastRow = this.sheet.getLastRow();
    const startRow = Math.max(2, lastRow - 30); // ヘッダー除外、最大30件
    
    // データが存在しない場合
    if (lastRow < 2) return null;

    const range = this.sheet.getRange(startRow, 1, lastRow - startRow + 1, 3);
    
    const chart = this.sheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(range)
      .setPosition(1, 1, 0, 0)
      .setOption('title', '最近の体重推移')
      .setOption('legend', {position: 'bottom'})
      .setOption('hAxis', {title: '日付', format: 'MM/dd'})
      .setOption('vAxis', {title: '体重(kg)'})
      .build();

    return chart.getBlob();
  }
}
