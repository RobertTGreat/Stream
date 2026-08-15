use serde::Deserialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.pleiades.stream.player";

pub struct AndroidPlayer<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: tauri::plugin::PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub ready: bool,
    pub playing: bool,
    pub paused: bool,
    pub position: f64,
    pub duration: f64,
    pub ended: bool,
    pub buffering: bool,
    pub error: Option<String>,
    #[serde(default)]
    pub closed: bool,
}

impl<R: Runtime> AndroidPlayer<R> {
    pub fn play(
        &self,
        url: String,
        start_at: Option<f64>,
        default_subtitles: Option<String>,
    ) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            #[derive(serde::Serialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                url: String,
                start_at: Option<f64>,
                default_subtitles: Option<String>,
            }
            self.handle
                .run_mobile_plugin(
                    "play",
                    Args {
                        url,
                        start_at,
                        default_subtitles,
                    },
                )
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (url, start_at, default_subtitles);
            Err("Android player is only available on Android".into())
        }
    }

    pub fn pause(&self) -> Result<(), String> {
        self.run("pause")
    }

    pub fn resume(&self) -> Result<(), String> {
        self.run("resume")
    }

    pub fn toggle_pause(&self) -> Result<(), String> {
        self.run("togglePause")
    }

    pub fn stop(&self) -> Result<(), String> {
        self.run("stop")
    }

    pub fn seek(&self, position: f64) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            #[derive(serde::Serialize)]
            struct Args {
                position: f64,
            }
            self.handle
                .run_mobile_plugin("seek", Args { position })
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = position;
            Ok(())
        }
    }

    pub fn set_speed(&self, speed: f64) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            #[derive(serde::Serialize)]
            struct Args {
                speed: f64,
            }
            self.handle
                .run_mobile_plugin("setSpeed", Args { speed })
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = speed;
            Ok(())
        }
    }

    pub fn update_download_notification(
        &self,
        title: String,
        text: String,
        progress: i32,
        indeterminate: bool,
        ongoing: bool,
        clear: bool,
    ) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            #[derive(serde::Serialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title: String,
                text: String,
                progress: i32,
                indeterminate: bool,
                ongoing: bool,
                clear: bool,
            }
            self.handle
                .run_mobile_plugin(
                    "updateDownloadNotification",
                    Args {
                        title,
                        text,
                        progress,
                        indeterminate,
                        ongoing,
                        clear,
                    },
                )
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (title, text, progress, indeterminate, ongoing, clear);
            Ok(())
        }
    }

    pub fn get_state(&self) -> Result<PlayerState, String> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin("getState", ())
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            Ok(PlayerState {
                ready: false,
                playing: false,
                paused: true,
                position: 0.0,
                duration: 0.0,
                ended: false,
                buffering: false,
                error: None,
                closed: true,
            })
        }
    }

    fn run(&self, command: &str) -> Result<(), String> {
        #[cfg(target_os = "android")]
        {
            self.handle
                .run_mobile_plugin(command, ())
                .map_err(|e| e.to_string())
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = command;
            Ok(())
        }
    }
}

pub trait AndroidPlayerExt<R: Runtime> {
    fn android_player(&self) -> &AndroidPlayer<R>;
}

impl<R: Runtime, T: Manager<R>> AndroidPlayerExt<R> for T {
    fn android_player(&self) -> &AndroidPlayer<R> {
        self.state::<AndroidPlayer<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-player")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PlayerPlugin")?;
                app.manage(AndroidPlayer { handle });
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(AndroidPlayer {
                    _marker: std::marker::PhantomData,
                });
            }
            Ok(())
        })
        .build()
}
