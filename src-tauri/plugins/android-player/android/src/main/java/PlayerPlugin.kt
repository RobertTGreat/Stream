package com.pleiades.stream.player

import android.Manifest
import android.app.Activity
import android.app.Dialog
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PlayArgs {
    lateinit var url: String
    var startAt: Double? = null
    var defaultSubtitles: String? = null
}

@InvokeArg
class SeekArgs {
    var position: Double = 0.0
}

@InvokeArg
class SpeedArgs {
    var speed: Double = 1.0
}

@InvokeArg
class DownloadNotifyArgs {
    var title: String? = null
    var text: String? = null
    var progress: Int? = null
    var indeterminate: Boolean? = null
    var ongoing: Boolean? = null
    var clear: Boolean? = null
}

@TauriPlugin
class PlayerPlugin(private val activity: Activity) : Plugin(activity) {
    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var dialog: Dialog? = null
    private var currentUrl: String? = null
    private var lastError: String? = null
    private var previousOrientation: Int? = null

    override fun load(webView: WebView) {}

    @Command
    fun updateDownloadNotification(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(DownloadNotifyArgs::class.java)
        } catch (e: Exception) {
            invoke.reject(e.message)
            return
        }

        activity.runOnUiThread {
            requestNotificationPermission()
            if (args.clear == true) {
                DownloadNotifyService.clear(activity)
            } else {
                DownloadNotifyService.update(
                    activity,
                    args.title ?: "Downloading",
                    args.text ?: "Preparing…",
                    args.progress ?: 0,
                    args.indeterminate ?: true,
                    args.ongoing ?: true,
                )
            }
            invoke.resolve()
        }
    }

    @Command
    fun play(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(PlayArgs::class.java)
        } catch (e: Exception) {
            invoke.reject(e.message)
            return
        }

        Log.i(TAG, "play url=${args.url} startAt=${args.startAt}")
        activity.runOnUiThread {
            try {
                lastError = null
                ensurePlayer()
                showDialog()

                val exo = player ?: run {
                    invoke.reject("Failed to create player")
                    return@runOnUiThread
                }

                val alreadyPlayingSame = currentUrl == args.url &&
                    (exo.isPlaying || exo.playbackState == Player.STATE_BUFFERING || exo.playbackState == Player.STATE_READY)
                if (!alreadyPlayingSame) {
                    currentUrl = args.url
                    configureSubtitles(exo, args.defaultSubtitles)
                    exo.setMediaItem(MediaItem.fromUri(Uri.parse(args.url)))
                    exo.prepare()
                    val startAt = args.startAt ?: 0.0
                    if (startAt > 1.0) {
                        exo.seekTo((startAt * 1000).toLong())
                    }
                }
                exo.playWhenReady = true
                invoke.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "play failed", e)
                invoke.reject(e.message)
            }
        }
    }

    @Command
    fun pause(invoke: Invoke) {
        activity.runOnUiThread {
            player?.pause()
            invoke.resolve()
        }
    }

    @Command
    fun resume(invoke: Invoke) {
        activity.runOnUiThread {
            player?.play()
            invoke.resolve()
        }
    }

    @Command
    fun togglePause(invoke: Invoke) {
        activity.runOnUiThread {
            val exo = player
            if (exo == null) {
                invoke.resolve()
                return@runOnUiThread
            }
            if (exo.isPlaying) exo.pause() else exo.play()
            invoke.resolve()
        }
    }

    @Command
    fun seek(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(SeekArgs::class.java)
        } catch (e: Exception) {
            invoke.reject(e.message)
            return
        }
        activity.runOnUiThread {
            player?.seekTo((args.position * 1000).toLong().coerceAtLeast(0))
            invoke.resolve()
        }
    }

    @Command
    fun setSpeed(invoke: Invoke) {
        val args = try {
            invoke.parseArgs(SpeedArgs::class.java)
        } catch (e: Exception) {
            invoke.reject(e.message)
            return
        }
        activity.runOnUiThread {
            player?.setPlaybackSpeed(args.speed.toFloat())
            invoke.resolve()
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        activity.runOnUiThread {
            releasePlayer(emitClosed = false)
            invoke.resolve()
        }
    }

    @Command
    fun getState(invoke: Invoke) {
        activity.runOnUiThread {
            val exo = player
            val payload = JSObject()
            payload.put("ready", exo != null)
            payload.put("playing", exo?.isPlaying == true)
            payload.put("paused", exo == null || !exo.playWhenReady || !exo.isPlaying)
            payload.put("position", ((exo?.currentPosition ?: 0L).toDouble()) / 1000.0)
            payload.put("duration", ((exo?.duration?.coerceAtLeast(0L) ?: 0L).toDouble()) / 1000.0)
            payload.put("ended", exo?.playbackState == Player.STATE_ENDED)
            payload.put("buffering", exo?.playbackState == Player.STATE_BUFFERING)
            payload.put("error", lastError)
            payload.put("closed", exo == null && dialog == null)
            invoke.resolve(payload)
        }
    }

    override fun onDestroy() {
        activity.runOnUiThread { releasePlayer(emitClosed = false) }
        super.onDestroy()
    }

    private fun ensurePlayer() {
        if (player != null) return
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        val renderersFactory = DefaultRenderersFactory(activity)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

        val created = ExoPlayer.Builder(activity, renderersFactory)
            .setAudioAttributes(audioAttributes, true)
            .build()
        created.volume = 1.0f
        created.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                lastError = error.errorCodeName + ": " + (error.message ?: "playback error")
                Log.e(TAG, "exoplayer error $lastError", error)
                trigger("player-error", JSObject().put("message", lastError))
            }

            override fun onTracksChanged(tracks: Tracks) {
                Log.i(TAG, "tracks changed: total groups = ${tracks.groups.size}")
                for (group in tracks.groups) {
                    val trackType = group.type
                    Log.i(TAG, "Track group type=$trackType isSelected=${group.isSelected}")
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                Log.i(TAG, "state=$playbackState playing=${player?.isPlaying}")
                if (playbackState == Player.STATE_ENDED) {
                    trigger("player-ended", JSObject())
                }
            }
        })
        player = created
    }

    private fun showDialog() {
        val existing = dialog
        if (existing?.isShowing == true) {
            playerView?.player = player
            return
        }

        val view = PlayerView(activity).apply {
            useController = true
            setShowNextButton(false)
            setShowPreviousButton(false)
            setBackgroundColor(Color.BLACK)
            player = this@PlayerPlugin.player
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        }
        playerView = view

        val dlg = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        dlg.setContentView(view)
        dlg.setCancelable(true)
        dlg.setOnCancelListener { releasePlayer(emitClosed = true) }
        dlg.setOnDismissListener {
            if (dialog === dlg) {
                playerView = null
                if (player != null) {
                    releasePlayer(emitClosed = true)
                }
            }
        }
        dlg.window?.let { window ->
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            window.statusBarColor = Color.BLACK
            window.navigationBarColor = Color.BLACK
            WindowCompat.setDecorFitsSystemWindows(window, false)
            val controller = WindowInsetsControllerCompat(window, window.decorView)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        lockLandscape()
        dlg.show()
        dialog = dlg
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return
        val granted = activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4402)
        }
    }

    private fun lockLandscape() {
        if (previousOrientation == null) {
            previousOrientation = activity.requestedOrientation
        }
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    private fun restoreOrientation() {
        val previous = previousOrientation ?: return
        activity.requestedOrientation = previous
        previousOrientation = null
    }

    private fun releasePlayer(emitClosed: Boolean = false) {
        currentUrl = null
        playerView?.player = null
        playerView = null
        player?.release()
        player = null
        val dlg = dialog
        dialog = null
        dlg?.setOnCancelListener(null)
        dlg?.setOnDismissListener(null)
        if (dlg?.isShowing == true) {
            dlg.dismiss()
        }
        if (emitClosed) {
            trigger("player-closed", JSObject())
            activity.window?.decorView?.postDelayed({ restoreOrientation() }, 280)
        } else {
            restoreOrientation()
        }
    }

    private fun configureSubtitles(exo: ExoPlayer, defaultSubtitles: String?) {
        val pref = defaultSubtitles?.trim()?.lowercase()
        val lang = when (pref) {
            "english", "en", "eng" -> "eng"
            "japanese", "ja", "jpn", "jp" -> "jpn"
            "spanish", "es", "spa" -> "spa"
            "french", "fr", "fre", "fra" -> "fra"
            "german", "de", "ger", "deu" -> "deu"
            null, "" -> "eng"
            else -> pref
        }
        exo.trackSelectionParameters = exo.trackSelectionParameters
            .buildUpon()
            .setPreferredTextLanguage(lang)
            .setSelectUndeterminedTextLanguage(true)
            .build()
    }

    companion object {
        private const val TAG = "StreamPlayer"
    }
}
