package com.deepseek.floatmonitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.TimeZone
import kotlin.concurrent.thread

/**
 * 原生 Android 置顶悬浮窗前台服务 (WindowManager + TYPE_APPLICATION_OVERLAY)
 * 实时监控 DeepSeek 账户余额 (/user/balance) 与北京时间峰谷时段倒计时
 */
class FloatingMonitorService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var rootLayout: LinearLayout
    private lateinit var txtBadge: TextView
    private lateinit var txtBalance: TextView
    private lateinit var txtSubBalance: TextView
    private lateinit var txtCountdown: TextView

    private val handler = Handler(Looper.getMainLooper())
    private var apiKey: String = ""
    private var lowThreshold: Double = 20.0
    private var refreshIntervalSec: Long = 60L
    private var lastIsPeak: Boolean? = null
    private var lowAlertTriggered: Boolean = false

    private val tickRunnable = object : Runnable {
        override fun run() {
            updatePeakValleyClock()
            handler.postDelayed(this, 1000L)
        }
    }

    private val balanceRunnable = object : Runnable {
        override fun run() {
            fetchBalanceAsync()
            handler.postDelayed(this, refreshIntervalSec * 1000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(1001, createForegroundNotification("DeepSeek 峰谷与余额悬浮窗运行中"))
        initFloatingOverlay()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        apiKey = intent?.getStringExtra("API_KEY")?.trim() ?: ""
        lowThreshold = intent?.getDoubleExtra("LOW_THRESHOLD", 20.0) ?: 20.0
        refreshIntervalSec = (intent?.getIntExtra("REFRESH_SEC", 60) ?: 60).toLong().coerceAtLeast(15L)

        handler.removeCallbacks(tickRunnable)
        handler.removeCallbacks(balanceRunnable)
        handler.post(tickRunnable)
        handler.post(balanceRunnable)
        return START_STICKY
    }

    private fun initFloatingOverlay() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val bgDrawable = GradientDrawable().apply {
            setColor(Color.parseColor("#EE0F172A"))
            cornerRadius = 36f
            setStroke(2, Color.parseColor("#334155"))
        }

        rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = bgDrawable
            setPadding(32, 24, 32, 24)
        }

        txtBadge = TextView(this).apply {
            text = "🟢 空闲时段 · 5折半价"
            textSize = 11f
            setTextColor(Color.parseColor("#34D399"))
        }
        txtBalance = TextView(this).apply {
            text = "¥ --.--"
            textSize = 18f
            setTextColor(Color.WHITE)
        }
        txtSubBalance = TextView(this).apply {
            text = "充: -- | 赠: --"
            textSize = 10f
            setTextColor(Color.parseColor("#94A3B8"))
        }
        txtCountdown = TextView(this).apply {
            text = "距切换: --:--:--"
            textSize = 11f
            setTextColor(Color.parseColor("#38BDF8"))
        }

        rootLayout.addView(txtBadge)
        rootLayout.addView(txtBalance)
        rootLayout.addView(txtSubBalance)
        rootLayout.addView(txtCountdown)

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 60
            y = 240
        }

        rootLayout.setOnTouchListener(object : View.OnTouchListener {
            private var initX = 0
            private var initY = 0
            private var touchX = 0f
            private var touchY = 0f

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initX = params.x
                        initY = params.y
                        touchX = event.rawX
                        touchY = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        params.x = initX + (event.rawX - touchX).toInt()
                        params.y = initY + (event.rawY - touchY).toInt()
                        windowManager.updateViewLayout(rootLayout, params)
                        return true
                    }
                }
                return false
            }
        })

        windowManager.addView(rootLayout, params)
    }

    private fun updatePeakValleyClock() {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Shanghai"))
        val dayOfWeek = cal.get(Calendar.DAY_OF_WEEK) // 1=Sun, 7=Sat
        val hours = cal.get(Calendar.HOUR_OF_DAY)
        val minutes = cal.get(Calendar.MINUTE)
        val seconds = cal.get(Calendar.SECOND)
        val totalMins = hours * 60 + minutes
        val totalSecs = totalMins * 60 + seconds

        val isWeekend = (dayOfWeek == Calendar.SUNDAY || dayOfWeek == Calendar.SATURDAY)
        val isPeak = !isWeekend && ((totalMins in 540 until 720) || (totalMins in 840 until 1080))

        val targetSecs = if (!isWeekend) {
            when {
                totalMins < 540 -> 540 * 60
                totalMins < 720 -> 720 * 60
                totalMins < 840 -> 840 * 60
                totalMins < 1080 -> 1080 * 60
                dayOfWeek == Calendar.FRIDAY -> 3 * 86400 + 540 * 60
                else -> 86400 + 540 * 60
            }
        } else {
            val daysToMon = if (dayOfWeek == Calendar.SATURDAY) 2 else 1
            daysToMon * 86400 + 540 * 60
        }

        val rem = (targetSecs - totalSecs).coerceAtLeast(0)
        val hh = rem / 3600
        val mm = (rem % 3600) / 60
        val ss = rem % 60

        if (lastIsPeak != null && lastIsPeak != isPeak) {
            sendAlertNotification(
                if (isPeak) "已进入 DeepSeek 高峰时段" else "已进入 DeepSeek 空闲半价时段",
                if (isPeak) "当前按标准全价计费" else "当前全模型调用享 5 折优惠"
            )
        }
        lastIsPeak = isPeak

        txtBadge.text = if (isPeak) "🔴 高峰时段 · 标准价" else "🟢 空闲时段 · 5折半价"
        txtBadge.setTextColor(Color.parseColor(if (isPeak) "#F87171" else "#34D399"))
        txtCountdown.text = String.format("距切换: %02d:%02d:%02d", hh, mm, ss)
    }

    private fun fetchBalanceAsync() {
        if (apiKey.isEmpty()) {
            handler.post {
                txtBalance.text = "¥ 110.00 (演示)"
                txtSubBalance.text = "充: ¥100.00 | 赠: ¥10.00"
            }
            return
        }
        thread {
            try {
                val conn = (URL("https://api.deepseek.com/user/balance").openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $apiKey")
                    connectTimeout = 8000
                    readTimeout = 8000
                }
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                val infos = json.optJSONArray("balance_infos")
                val first = infos?.optJSONObject(0)
                val currency = first?.optString("currency", "CNY") ?: "CNY"
                val sym = if (currency == "USD") "$" else "¥"
                val total = first?.optString("total_balance", "0.00")?.toDoubleOrNull() ?: 0.0
                val topped = first?.optString("topped_up_balance", "0.00")?.toDoubleOrNull() ?: 0.0
                val granted = first?.optString("granted_balance", "0.00")?.toDoubleOrNull() ?: 0.0

                handler.post {
                    txtBalance.text = String.format("%s %.2f", sym, total)
                    txtBalance.setTextColor(if (total <= lowThreshold) Color.parseColor("#FB7185") else Color.WHITE)
                    txtSubBalance.text = String.format("充: %s%.2f | 赠: %s%.2f", sym, topped, sym, granted)
                    if (total <= lowThreshold && !lowAlertTriggered) {
                        lowAlertTriggered = true
                        sendAlertNotification("DeepSeek 余额不足预警", "当前可用总额 $sym$total 已低于预警阈值")
                    } else if (total > lowThreshold) {
                        lowAlertTriggered = false
                    }
                }
            } catch (e: Exception) {
                handler.post {
                    txtSubBalance.text = "刷新失败: ${e.message?.take(18)}"
                }
            }
        }
    }

    private fun createForegroundNotification(content: String): Notification {
        val channelId = "deepseek_float_channel"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, "DeepSeek 悬浮窗服务", NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(ch)
            return Notification.Builder(this, channelId)
                .setContentTitle("DeepSeek 实时监控")
                .setContentText(content)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        }
        @Suppress("DEPRECATION")
        return Notification.Builder(this)
            .setContentTitle("DeepSeek 实时监控")
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
    }

    private fun sendAlertNotification(title: String, msg: String) {
        val channelId = "deepseek_alert_channel"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, "DeepSeek 预警通知", NotificationManager.IMPORTANCE_HIGH)
            nm.createNotificationChannel(ch)
            val notif = Notification.Builder(this, channelId)
                .setContentTitle(title)
                .setContentText(msg)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .build()
            nm.notify((System.currentTimeMillis() % 10000).toInt(), notif)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(tickRunnable)
        handler.removeCallbacks(balanceRunnable)
        if (::rootLayout.isInitialized) {
            windowManager.removeView(rootLayout)
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
