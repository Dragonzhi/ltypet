use serde::Serialize;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};

const MEDIA_EVENT: &str = "system-media-playback";
const MEDIA_STATUS_EVENT: &str = "system-media-observer-status";
const POLL_INTERVAL: Duration = Duration::from_millis(750);
const RETRY_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaPlaybackState {
    Playing,
    Paused,
    Stopped,
}

#[derive(Clone, Copy, Serialize)]
struct MediaPlaybackEvent {
    state: MediaPlaybackState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaObserverStatus {
    available: bool,
    reason: Option<String>,
}

enum MediaMonitorCommand {
    SetEnabled(bool),
    Shutdown,
}

/// 进程内唯一的 Windows 媒体状态观察器。
///
/// 它只调用 GetPlaybackInfo().PlaybackStatus()，不读取媒体属性、标题、
/// 歌手、歌词、时间线或音频缓冲区。关闭设置后会释放 WinRT manager。
pub struct MediaMonitor {
    sender: Sender<MediaMonitorCommand>,
}

impl MediaMonitor {
    pub fn start(app: AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
            if let Err(error) = initialized {
                let reason = format!("初始化 Windows 媒体观察失败：{error}");
                eprintln!("{reason}");
                emit_observer_status(&app, false, Some(reason));
                return;
            }

            let mut enabled = false;
            let mut manager: Option<GlobalSystemMediaTransportControlsSessionManager> = None;
            let mut last_state: Option<MediaPlaybackState> = None;
            let mut retry_at = Instant::now();

            loop {
                let wait = if enabled {
                    POLL_INTERVAL
                } else {
                    Duration::from_secs(60 * 60)
                };
                match receiver.recv_timeout(wait) {
                    Ok(MediaMonitorCommand::SetEnabled(next)) => {
                        if enabled != next {
                            enabled = next;
                            if !enabled {
                                manager = None;
                                publish_state(&app, &mut last_state, MediaPlaybackState::Stopped);
                            } else {
                                retry_at = Instant::now();
                            }
                        }
                    }
                    Ok(MediaMonitorCommand::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                        break;
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                }

                if !enabled {
                    continue;
                }

                if manager.is_none() && Instant::now() >= retry_at {
                    match request_manager() {
                        Ok(next_manager) => {
                            manager = Some(next_manager);
                            emit_observer_status(&app, true, None);
                        }
                        Err(error) => {
                            let reason = format!("Windows 媒体会话暂不可用：{error}");
                            eprintln!("{reason}");
                            emit_observer_status(&app, false, Some(reason));
                            retry_at = Instant::now() + RETRY_INTERVAL;
                            publish_state(&app, &mut last_state, MediaPlaybackState::Stopped);
                            continue;
                        }
                    }
                }

                if let Some(manager) = manager.as_ref() {
                    publish_state(&app, &mut last_state, read_playback_state(manager));
                }
            }

            unsafe { RoUninitialize() };
        });
        Self { sender }
    }

    fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        self.sender
            .send(MediaMonitorCommand::SetEnabled(enabled))
            .map_err(|_| "Windows 媒体观察线程不可用".to_string())
    }
}

impl Drop for MediaMonitor {
    fn drop(&mut self) {
        let _ = self.sender.send(MediaMonitorCommand::Shutdown);
    }
}

#[tauri::command]
pub fn media_set_observation_enabled(
    monitor: State<'_, MediaMonitor>,
    enabled: bool,
) -> Result<(), String> {
    monitor.set_enabled(enabled)
}

fn request_manager() -> windows::core::Result<GlobalSystemMediaTransportControlsSessionManager> {
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()
}

fn read_playback_state(
    manager: &GlobalSystemMediaTransportControlsSessionManager,
) -> MediaPlaybackState {
    let Ok(session) = manager.GetCurrentSession() else {
        return MediaPlaybackState::Stopped;
    };
    let Ok(info) = session.GetPlaybackInfo() else {
        return MediaPlaybackState::Stopped;
    };
    let Ok(status) = info.PlaybackStatus() else {
        return MediaPlaybackState::Stopped;
    };
    map_playback_status(status)
}

fn map_playback_status(
    status: GlobalSystemMediaTransportControlsSessionPlaybackStatus,
) -> MediaPlaybackState {
    if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
        MediaPlaybackState::Playing
    } else if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused {
        MediaPlaybackState::Paused
    } else {
        MediaPlaybackState::Stopped
    }
}

fn publish_state(
    app: &AppHandle,
    last_state: &mut Option<MediaPlaybackState>,
    state: MediaPlaybackState,
) {
    if *last_state == Some(state) {
        return;
    }
    *last_state = Some(state);
    let _ = app.emit_to("main", MEDIA_EVENT, MediaPlaybackEvent { state });
}

fn emit_observer_status(app: &AppHandle, available: bool, reason: Option<String>) {
    let _ = app.emit_to(
        "main",
        MEDIA_STATUS_EVENT,
        MediaObserverStatus { available, reason },
    );
}

#[cfg(test)]
mod tests {
    use super::{map_playback_status, MediaPlaybackState};
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status;

    #[test]
    fn maps_only_playing_and_paused_to_active_states() {
        assert_eq!(
            map_playback_status(Status::Playing),
            MediaPlaybackState::Playing
        );
        assert_eq!(
            map_playback_status(Status::Paused),
            MediaPlaybackState::Paused
        );
        assert_eq!(
            map_playback_status(Status::Stopped),
            MediaPlaybackState::Stopped
        );
        assert_eq!(
            map_playback_status(Status::Closed),
            MediaPlaybackState::Stopped
        );
        assert_eq!(
            map_playback_status(Status::Changing),
            MediaPlaybackState::Stopped
        );
    }
}
