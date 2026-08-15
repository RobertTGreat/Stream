package com.pleiades.stream.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class DownloadNotifyService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        ensureChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildNotification(
            this,
            intent?.getStringExtra(EXTRA_TITLE) ?: "Downloading",
            intent?.getStringExtra(EXTRA_TEXT) ?: "Preparing…",
            intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0,
            intent?.getBooleanExtra(EXTRA_INDETERMINATE, true) ?: true,
            intent?.getBooleanExtra(EXTRA_ONGOING, true) ?: true,
        )
        startForegroundCompat(notification)
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
        super.onDestroy()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    companion object {
        const val ACTION_UPDATE = "com.pleiades.stream.player.DOWNLOAD_NOTIFY_UPDATE"
        const val ACTION_STOP = "com.pleiades.stream.player.DOWNLOAD_NOTIFY_STOP"
        const val EXTRA_TITLE = "title"
        const val EXTRA_TEXT = "text"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_INDETERMINATE = "indeterminate"
        const val EXTRA_ONGOING = "ongoing"
        const val CHANNEL_ID = "stream_downloads"
        const val NOTIFICATION_ID = 4401

        @Volatile
        var running: Boolean = false
            private set

        fun update(
            context: Context,
            title: String,
            text: String,
            progress: Int,
            indeterminate: Boolean,
            ongoing: Boolean,
        ) {
            ensureChannel(context)
            val intent = Intent(context, DownloadNotifyService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_TEXT, text)
                putExtra(EXTRA_PROGRESS, progress)
                putExtra(EXTRA_INDETERMINATE, indeterminate)
                putExtra(EXTRA_ONGOING, ongoing)
            }
            if (running) {
                context.startService(intent)
            } else {
                ContextCompat.startForegroundService(context, intent)
            }
        }

        fun clear(context: Context) {
            if (running) {
                context.startService(Intent(context, DownloadNotifyService::class.java).apply {
                    action = ACTION_STOP
                })
            } else {
                NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
            }
        }

        private fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Downloads",
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = "Torrent download progress"
                    setShowBadge(false)
                }
            )
        }

        private fun buildNotification(
            context: Context,
            title: String,
            text: String,
            progress: Int,
            indeterminate: Boolean,
            ongoing: Boolean,
        ): Notification {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?.apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
            val contentIntent = launchIntent?.let {
                PendingIntent.getActivity(
                    context,
                    0,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }

            val clamped = progress.coerceIn(0, 100)
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setOnlyAlertOnce(true)
                .setOngoing(ongoing)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentIntent)
                .setProgress(100, clamped, indeterminate)
                .build()
        }
    }
}
