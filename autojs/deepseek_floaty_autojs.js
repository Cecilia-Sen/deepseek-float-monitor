"ui";
/**
 * DeepSeek 余额与峰谷时段监控 - 安卓手机原生悬浮窗脚本 (AutoX.js / Auto.js 通用)
 * 官方最新规则：北京时间周一至周五（不含法定节假日）09:00-12:00、14:00-18:00 为高峰时段，其余时段为半价空闲时段
 * 官方余额接口：GET https://api.deepseek.com/user/balance
 */

const storage = storages.create("deepseek_float_monitor_2026");

ui.layout(
    <vertical padding="20" bg="#0f172a">
        <text text="DeepSeek 实时余额 & 峰谷悬浮窗" textSize="20sp" textColor="#ffffff" textStyle="bold" marginBottom="6"/>
        <text text="最新官方规则：工作日 09:00-12:00、14:00-18:00 高峰全价；午休/晚间/周末/节假日 5 折半价" textSize="12sp" textColor="#94a3b8" marginBottom="16"/>

        <text text="DeepSeek API Key (必填):" textSize="13sp" textColor="#cbd5e1"/>
        <input id="apiKey" hint="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" textColor="#ffffff" textColorHint="#64748b" textSize="14sp" marginBottom="12"/>

        <horizontal marginBottom="12">
            <text text="余额不足预警阈值 (元):" textSize="13sp" textColor="#cbd5e1" layout_weight="1"/>
            <input id="lowThreshold" text="20" inputType="numberDecimal" textColor="#ffffff" w="90"/>
        </horizontal>

        <horizontal marginBottom="12">
            <text text="自动刷新频率 (秒):" textSize="13sp" textColor="#cbd5e1" layout_weight="1"/>
            <input id="intervalSec" text="60" inputType="number" textColor="#ffffff" w="90"/>
        </horizontal>

        <checkbox id="chkHoliday" text="今日为中国法定节假日 (强制全天5折空闲)" textColor="#cbd5e1" marginBottom="8"/>
        <checkbox id="chkVibrate" text="开启峰谷切换与低余额震动提醒" checked="true" textColor="#cbd5e1" marginBottom="18"/>

        <button id="btnStart" text="🚀 启动安卓系统置顶悬浮窗" style="Widget.AppCompat.Button.Colored"/>
        <button id="btnClose" text="关闭悬浮窗" marginTop="8"/>
    </vertical>
);

ui.apiKey.setText(storage.get("apiKey", ""));
ui.lowThreshold.setText(String(storage.get("lowThreshold", "20")));
ui.intervalSec.setText(String(storage.get("intervalSec", "60")));
ui.chkHoliday.setChecked(Boolean(storage.get("isHoliday", false)));
ui.chkVibrate.setChecked(Boolean(storage.get("vibrate", true)));

let floatWin = null;
let timerTick = null;
let timerPoll = null;
let lastIsPeak = null;
let lowAlerted = false;

ui.btnClose.on("click", function () {
    stopAll();
    toast("已关闭 DeepSeek 悬浮窗");
});

ui.btnStart.on("click", function () {
    if (!floaty.checkPermission()) {
        toast("请授予悬浮窗权限后再点击启动");
        floaty.requestPermission();
        return;
    }
    const key = String(ui.apiKey.text()).trim();
    const threshold = parseFloat(String(ui.lowThreshold.text()).trim()) || 20;
    const intervalSec = Math.max(10, parseInt(String(ui.intervalSec.text()).trim(), 10) || 60);
    const isHoliday = ui.chkHoliday.isChecked();
    const vibrate = ui.chkVibrate.isChecked();

    storage.put("apiKey", key);
    storage.put("lowThreshold", threshold);
    storage.put("intervalSec", intervalSec);
    storage.put("isHoliday", isHoliday);
    storage.put("vibrate", vibrate);

    threads.start(function () {
        startFloatingMonitor(key, threshold, intervalSec, isHoliday, vibrate);
    });
});

function stopAll() {
    if (timerTick) clearInterval(timerTick);
    if (timerPoll) clearInterval(timerPoll);
    floaty.closeAll();
    floatWin = null;
}

function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
}

function computePeakValley(isHoliday) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const bjt = new Date(utcMs + 8 * 3600000);
    const day = bjt.getDay();
    const hours = bjt.getHours();
    const mins = hours * 60 + bjt.getMinutes();
    const secs = mins * 60 + bjt.getSeconds();

    const isOffDay = isHoliday || day === 0 || day === 6;
    let isPeak = false;
    let targetSec = 0;
    let nextLabel = "";

    if (!isOffDay) {
        if (mins < 540) {
            isPeak = false;
            targetSec = 540 * 60;
            nextLabel = "距09:00高峰 ";
        } else if (mins < 720) {
            isPeak = true;
            targetSec = 720 * 60;
            nextLabel = "距12:00半价 ";
        } else if (mins < 840) {
            isPeak = false;
            targetSec = 840 * 60;
            nextLabel = "距14:00高峰 ";
        } else if (mins < 1080) {
            isPeak = true;
            targetSec = 1080 * 60;
            nextLabel = "距18:00半价 ";
        } else {
            isPeak = false;
            const daysAdd = (day === 5) ? 3 : 1;
            targetSec = daysAdd * 86400 + 540 * 60;
            nextLabel = "距下个高峰 ";
        }
    } else {
        isPeak = false;
        const daysAdd = (day === 6) ? 2 : 1;
        targetSec = daysAdd * 86400 + 540 * 60;
        nextLabel = "全天半价 ";
    }

    const rem = Math.max(0, targetSec - secs);
    const hh = Math.floor(rem / 3600);
    const mm = Math.floor((rem % 3600) / 60);
    const ss = rem % 60;
    return {
        isPeak: isPeak,
        badgeText: isPeak ? "🔴 高峰全价" : "🟢 空闲5折",
        countdown: nextLabel + pad2(hh) + ":" + pad2(mm) + ":" + pad2(ss)
    };
}

function startFloatingMonitor(apiKey, threshold, intervalSec, isHoliday, vibrate) {
    stopAll();
    floatWin = floaty.rawWindow(
        <card cardCornerRadius="14dp" cardElevation="8dp" cardBackgroundColor="#EE0F172A">
            <vertical padding="10dp" w="190dp" id="rootBox">
                <horizontal gravity="center_vertical">
                    <text id="txtPeriod" text="🟢 空闲5折" textSize="11sp" textColor="#34D399" textStyle="bold" layout_weight="1"/>
                    <text id="btnPin" text="🔓" textSize="11sp" textColor="#94A3B8" padding="2dp 5dp"/>
                    <text id="btnRefresh" text="↻" textSize="13sp" textColor="#38BDF8" padding="2dp 5dp"/>
                    <text id="btnMini" text="—" textSize="12sp" textColor="#94A3B8" padding="2dp 5dp"/>
                </horizontal>
                <vertical id="detailArea">
                    <text id="txtTotal" text="¥ --.--" textSize="19sp" textColor="#FFFFFF" textStyle="bold" marginTop="2dp"/>
                    <text id="txtSub" text="充值: -- | 赠金: --" textSize="10sp" textColor="#94A3B8"/>
                    <text id="txtCountdown" text="距切换: --:--:--" textSize="11sp" textColor="#5EEAD4" marginTop="3dp"/>
                </vertical>
            </vertical>
        </card>
    );

    floatWin.setPosition(80, 260);

    // 拖拽与固定位置开关支持
    let x = 0, y = 0, wx = 0, wy = 0;
    let isCollapsed = false;
    let isPinned = false;
    floatWin.rootBox.setOnTouchListener(function (view, event) {
        if (isPinned) return true;
        switch (event.getAction()) {
            case event.ACTION_DOWN:
                x = event.getRawX();
                y = event.getRawY();
                wx = floatWin.getX();
                wy = floatWin.getY();
                return true;
            case event.ACTION_MOVE:
                floatWin.setPosition(wx + (event.getRawX() - x), wy + (event.getRawY() - y));
                return true;
        }
        return true;
    });

    floatWin.btnPin.on("click", function () {
        isPinned = !isPinned;
        ui.run(function () {
            floatWin.btnPin.setText(isPinned ? "📌" : "🔓");
            toast(isPinned ? "📌 悬浮窗已固定并开启穿透（仅解锁可点）" : "🔓 悬浮窗已解锁");
        });
    });

    floatWin.btnMini.on("click", function () {
        if (isPinned) return;
        isCollapsed = !isCollapsed;
        ui.run(function () {
            floatWin.detailArea.setVisibility(isCollapsed ? 8 : 0);
            floatWin.btnMini.setText(isCollapsed ? "□" : "—");
        });
    });

    floatWin.btnRefresh.on("click", function () {
        if (isPinned) return;
        threads.start(function () {
            pollBalance(apiKey, threshold, vibrate);
        });
    });

    function tickTime() {
        const pv = computePeakValley(isHoliday);
        if (lastIsPeak !== null && lastIsPeak !== pv.isPeak) {
            if (vibrate) device.vibrate(400);
            toast(pv.isPeak ? "⚠️ DeepSeek 已进入高峰全价时段" : "🎉 DeepSeek 已进入空闲 5 折半价时段！");
        }
        lastIsPeak = pv.isPeak;
        ui.run(function () {
            if (!floatWin) return;
            floatWin.txtPeriod.setText(pv.badgeText);
            floatWin.txtPeriod.setTextColor(colors.parseColor(pv.isPeak ? "#F87171" : "#34D399"));
            floatWin.txtCountdown.setText(pv.countdown);
        });
    }

    tickTime();
    pollBalance(apiKey, threshold, vibrate);
    timerTick = setInterval(tickTime, 1000);
    timerPoll = setInterval(function () {
        threads.start(function () {
            pollBalance(apiKey, threshold, vibrate);
        });
    }, intervalSec * 1000);
}

function pollBalance(apiKey, threshold, vibrate) {
    if (!apiKey) {
        ui.run(function () {
            if (!floatWin) return;
            floatWin.txtTotal.setText("¥ 110.00 (演示)");
            floatWin.txtSub.setText("充: ¥100.00 | 赠: ¥10.00");
        });
        return;
    }
    try {
        const res = http.get("https://api.deepseek.com/user/balance", {
            headers: {
                "Accept": "application/json",
                "Authorization": "Bearer " + apiKey
            }
        });
        if (res.statusCode !== 200) {
            throw new Error("HTTP " + res.statusCode);
        }
        const data = res.body.json();
        const info = (data.balance_infos && data.balance_infos[0]) || {};
        const sym = info.currency === "USD" ? "$" : "¥";
        const total = parseFloat(info.total_balance || "0");
        const topped = parseFloat(info.topped_up_balance || "0");
        const granted = parseFloat(info.granted_balance || "0");

        if (total <= threshold && !lowAlerted) {
            lowAlerted = true;
            if (vibrate) device.vibrate(600);
            toast("⚠️ DeepSeek 余额不足预警：当前剩余 " + sym + total.toFixed(2));
        } else if (total > threshold) {
            lowAlerted = false;
        }

        ui.run(function () {
            if (!floatWin) return;
            floatWin.txtTotal.setText(sym + " " + total.toFixed(2));
            floatWin.txtTotal.setTextColor(colors.parseColor(total <= threshold ? "#FB7185" : "#FFFFFF"));
            floatWin.txtSub.setText("充: " + sym + topped.toFixed(2) + " | 赠: " + sym + granted.toFixed(2));
        });
    } catch (e) {
        ui.run(function () {
            if (!floatWin) return;
            floatWin.txtSub.setText("刷新失败: " + e.message);
        });
    }
}
