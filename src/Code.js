/**
 * メイン: 未読メール処理
 */
function checkMailAndRecord() {
  try {
    const mailService = new MailService();
    const threads = mailService.findUnreadThreads();
    if (threads.length === 0) return;

    const repository = new SheetRepository();
    const settings = repository.getSettings();
    const calculator = new DietCalculator(settings);
    const aiService = new AiService();
    const chartService = new ChartService(repository.getLogSheet());

    threads.forEach(thread => {
      const messages = thread.getMessages();
      const msg = messages[messages.length - 1];

      if (msg.isUnread()) {
        // 1. 解析
        const parsed = Parser.parseBody(msg.getPlainBody());
        
        // 2. 計算 & 在庫処理
        let metrics = null;
        let isLowStock = false;
        
        if (parsed.weight) {
          repository.updateCurrentWeight(parsed.weight);
          metrics = calculator.calculateMetrics(parsed.weight);
          
          // ごはんをあげたので在庫を減らす
          isLowStock = repository.updateStock(metrics.gramPerDay, parsed.isStockRefill);
        } else if (parsed.isStockRefill) {
           repository.updateStock(0, true); // 補充のみ
        }

        // 3. コンテンツ生成 (AI or 従来)
        let replyText = "";
        let adviceLog = "";

        if (parsed.weight) {
          // AIに生成依頼
          const aiReply = aiService.generateCatReply(metrics, parsed.originalText, parsed.healthTags);
          
          // AIがなければ従来ロジック
          const fallbackContent = ContentService.getAdviceOrTrivia(metrics);
          const fallbackReply = Formatter.formatLogAdvice(metrics, fallbackContent.text, fallbackContent.type); // 既存メソッド利用

          replyText = Formatter.formatReply(aiReply, fallbackReply, isLowStock);
          adviceLog = aiReply || fallbackContent.text;
        } else {
          // 記録のみ
          replyText = "記録したニャ。" + (isLowStock ? "\n\n【⚠️警告】在庫少ないぞ！" : "");
        }

        // 4. ログ保存
        repository.appendLog({
          date: msg.getDate(),
          action: parsed.weight ? "体重記録" : "記録のみ",
          weight: parsed.weight,
          advice: adviceLog,
          healthTags: parsed.healthTags
        });

        // 5. メール返信 (グラフ添付)
        const options = {};
        if (CONFIG.FEATURES.ENABLE_CHART && parsed.weight) {
          const chartBlob = chartService.createWeightChartBlob();
          if (chartBlob) {
            options.attachments = [chartBlob];
          }
        }

        msg.reply(replyText, options);
        msg.markRead();
      }
    });

  } catch (e) {
    console.error("Main Process Error:", e);
  }
}
