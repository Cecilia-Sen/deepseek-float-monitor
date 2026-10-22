"ui";
// DeepSeek 余额与峰谷监控安卓原生悬浮窗脚本 (AutoX.js / Auto.js 通用)
const storage = storages.create("deepseek_monitor_cfg");

ui.layout(
  <vertical padding="20" bg="#0f172a">
    <text text="DeepSeek 悬浮窗监控 (安卓原生)" textSize="20sp" textColor="#ffffff" textStyle="bold" marginBottom="8"/>
    <text text="支持最新官方峰谷时段 (工作日 9:00-12:00、14:00-18:00 高峰，其余空闲半价)" textSize="12sp" textColor="#94a3b8" marginBottom="16"/>
    <text text="DeepSeek API Key:" textSize="13sp" textColor="#cbd5e1"/>
    <input id="apiKey" hint="sk-xxxxxxxxxxxxxxxx" textColor="#ffffff" textSize="14sp" marginBottom="12"/>
    <horizontal marginBottom="12">
      <text text="低余额提醒阈值(元):" textSize="13sp" textColor="#cbd5e1" layout_weight="1"/>
      <input id="threshold" text="20" inputType="numberDecimal" textColor="#ffffff" w="80"/>
    </horizontal>
    <horizontal marginBottom="12">
      <text text="刷新频率(秒):" textSize="13sp" textColor="#cbd5e1" layout_weight="1"/>
      <input id="intervalSec" text="60" inputType="number" textColor="#ffffff" w="80"/>
    </horizontal>
    <Switch id="swPinWindow" text="📌 固定悬浮窗并开启点击穿透 (仅保留解锁可点)" checked="false" textColor="#cbd5e1" marginBottom="16"/>
    <button id="btnStart" text="启动安卓系统置顶悬浮窗" style="Widget.AppCompat.Button.Colored"/>
    <button id="btnStop" text="关闭所有悬浮窗" marginTop="8"/>
  </vertical>
);

ui.apiKey.setText(storage.get("apiKey", ""));
ui.threshold.setText(String(storage.get("threshold", "20")));
ui.intervalSec.setText(String(storage.get("intervalSec", "60")));
ui.swPinWindow.setChecked(Boolean(storage.get("isPinned", false)));

ui.btnStop.on("click", () => { floaty.closeAll(); toast("已关闭悬浮窗"); });
ui.btnStart.on("click", () => {
  if (!floaty.checkPermission()) {
    toast("请先授予悬浮窗权限");
    floaty.requestPermission();
    return;
  }
  storage.put("apiKey", String(ui.apiKey.text()).trim());
  storage.put("threshold", String(ui.threshold.text()).trim());
  storage.put("intervalSec", String(ui.intervalSec.text()).trim());
  storage.put("isPinned", ui.swPinWindow.isChecked());
  threads.start(launchFloatingWindow);
});