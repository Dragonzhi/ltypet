use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, UserAttentionType};
use windows::Win32::System::Diagnostics::Debug::MessageBeep;
use windows::Win32::UI::WindowsAndMessaging::MB_ICONASTERISK;

pub const TIMER_STATE_CHANGED_EVENT: &str = "timer-state-changed";
pub const TIMER_FINISHED_AVAILABLE_EVENT: &str = "timer-finished-available";
const TIMER_SCHEMA_VERSION: u8 = 1;
const MAX_DURATION_MS: u64 = 86_400_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimerStatus {
    Running,
    Paused,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TimerKind {
    Focus,
    Break,
    #[default]
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub schema_version: u8,
    pub timer_id: String,
    pub kind: TimerKind,
    pub label: String,
    pub status: TimerStatus,
    pub duration_ms: u64,
    pub remaining_ms: u64,
    pub started_at_unix_ms: u64,
    pub updated_at_unix_ms: u64,
    pub deadline_unix_ms: Option<u64>,
    pub show_system_reminder: bool,
    pub sound_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerStartRequest {
    pub timer_id: String,
    pub duration_ms: u64,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub kind: TimerKind,
    #[serde(default)]
    pub show_system_reminder: Option<bool>,
    #[serde(default)]
    pub sound_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerStateEvent {
    pub reason: String,
    pub timer: Option<TimerSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerError {
    pub code: String,
    pub message: String,
}

impl TimerError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub type TimerResult<T> = Result<T, TimerError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimerEngine {
    schema_version: u8,
    revision: u64,
    active: Option<TimerSnapshot>,
    pending_finished: Option<TimerSnapshot>,
}

impl Default for TimerEngine {
    fn default() -> Self {
        Self {
            schema_version: TIMER_SCHEMA_VERSION,
            revision: 0,
            active: None,
            pending_finished: None,
        }
    }
}

impl TimerEngine {
    fn snapshot_at(&self, now: u64) -> Option<TimerSnapshot> {
        self.active.clone().map(|mut timer| {
            if timer.status == TimerStatus::Running {
                timer.remaining_ms = timer.deadline_unix_ms.unwrap_or(now).saturating_sub(now);
            }
            timer
        })
    }

    fn start(&mut self, request: TimerStartRequest, now: u64) -> TimerResult<(TimerSnapshot, u64)> {
        validate_start_request(&request)?;
        if self.active.is_some() {
            return Err(TimerError::new(
                "timer_conflict",
                "已有番茄钟正在运行或暂停，请先取消当前计时",
            ));
        }
        self.revision = self.revision.wrapping_add(1);
        let timer = TimerSnapshot {
            schema_version: TIMER_SCHEMA_VERSION,
            timer_id: request.timer_id,
            kind: request.kind,
            label: request.label,
            status: TimerStatus::Running,
            duration_ms: request.duration_ms,
            remaining_ms: request.duration_ms,
            started_at_unix_ms: now,
            updated_at_unix_ms: now,
            deadline_unix_ms: Some(now.saturating_add(request.duration_ms)),
            show_system_reminder: request.show_system_reminder.unwrap_or(true),
            sound_enabled: request.sound_enabled.unwrap_or(true),
        };
        self.active = Some(timer.clone());
        Ok((timer, self.revision))
    }

    fn pause(&mut self, timer_id: &str, now: u64) -> TimerResult<TimerSnapshot> {
        let timer = self.active.as_mut().ok_or_else(timer_not_found)?;
        ensure_timer_id(timer, timer_id)?;
        if timer.status != TimerStatus::Running {
            return Err(TimerError::new("timer_invalid_state", "番茄钟已经暂停"));
        }
        timer.remaining_ms = timer.deadline_unix_ms.unwrap_or(now).saturating_sub(now);
        timer.deadline_unix_ms = None;
        timer.status = TimerStatus::Paused;
        timer.updated_at_unix_ms = now;
        self.revision = self.revision.wrapping_add(1);
        Ok(timer.clone())
    }

    fn resume(&mut self, timer_id: &str, now: u64) -> TimerResult<(TimerSnapshot, u64)> {
        let timer = self.active.as_mut().ok_or_else(timer_not_found)?;
        ensure_timer_id(timer, timer_id)?;
        if timer.status != TimerStatus::Paused {
            return Err(TimerError::new("timer_invalid_state", "番茄钟正在运行"));
        }
        timer.status = TimerStatus::Running;
        timer.deadline_unix_ms = Some(now.saturating_add(timer.remaining_ms));
        timer.updated_at_unix_ms = now;
        self.revision = self.revision.wrapping_add(1);
        Ok((timer.clone(), self.revision))
    }

    fn cancel(&mut self, timer_id: &str) -> TimerResult<TimerSnapshot> {
        let timer = self.active.as_ref().ok_or_else(timer_not_found)?;
        ensure_timer_id(timer, timer_id)?;
        let removed = self.active.take().ok_or_else(timer_not_found)?;
        self.revision = self.revision.wrapping_add(1);
        Ok(removed)
    }

    fn finish_if_due(&mut self, timer_id: &str, revision: u64, now: u64) -> Option<TimerSnapshot> {
        if self.revision != revision {
            return None;
        }
        let timer = self.active.as_ref()?;
        if timer.timer_id != timer_id
            || timer.status != TimerStatus::Running
            || timer
                .deadline_unix_ms
                .is_some_and(|deadline| deadline > now)
        {
            return None;
        }
        let mut finished = self.active.take()?;
        finished.remaining_ms = 0;
        finished.updated_at_unix_ms = now;
        self.pending_finished = Some(finished.clone());
        self.revision = self.revision.wrapping_add(1);
        Some(finished)
    }

    fn take_pending_finished(&mut self) -> Option<TimerSnapshot> {
        self.pending_finished.take()
    }
}

fn timer_not_found() -> TimerError {
    TimerError::new("timer_not_found", "没有可操作的番茄钟")
}

fn ensure_timer_id(timer: &TimerSnapshot, timer_id: &str) -> TimerResult<()> {
    if timer.timer_id == timer_id {
        Ok(())
    } else {
        Err(timer_not_found())
    }
}

fn validate_start_request(request: &TimerStartRequest) -> TimerResult<()> {
    if request.timer_id.is_empty() || request.timer_id.len() > 128 {
        return Err(TimerError::new(
            "invalid_timer_id",
            "timerId 必须是 1 到 128 字符",
        ));
    }
    if request.duration_ms == 0 || request.duration_ms > MAX_DURATION_MS {
        return Err(TimerError::new(
            "invalid_duration",
            "durationMs 必须在 1 到 86400000 之间",
        ));
    }
    if request.label.chars().count() > 64 {
        return Err(TimerError::new("invalid_label", "label 不能超过 64 字符"));
    }
    Ok(())
}

#[derive(Clone)]
pub struct TimerManager {
    inner: Arc<Mutex<TimerEngine>>,
    path: Arc<PathBuf>,
}

impl TimerManager {
    pub fn load(path: PathBuf) -> Self {
        let backup = backup_path(&path);
        let engine = read_engine(&path)
            .or_else(|| read_engine(&backup))
            .filter(|state| state.schema_version == TIMER_SCHEMA_VERSION)
            .unwrap_or_default();
        Self {
            inner: Arc::new(Mutex::new(engine)),
            path: Arc::new(path),
        }
    }

    pub fn get_state(&self) -> TimerResult<Option<TimerSnapshot>> {
        let engine = self.lock()?;
        Ok(engine.snapshot_at(now_unix_ms()))
    }

    pub fn start(&self, app: &AppHandle, request: TimerStartRequest) -> TimerResult<TimerSnapshot> {
        let (timer, revision) = self.mutate(|engine| engine.start(request, now_unix_ms()))?;
        emit_state(app, "started", Some(timer.clone()));
        self.spawn_worker(app.clone(), timer.timer_id.clone(), revision);
        Ok(timer)
    }

    pub fn pause(&self, app: &AppHandle, timer_id: &str) -> TimerResult<TimerSnapshot> {
        let timer = self.mutate(|engine| engine.pause(timer_id, now_unix_ms()))?;
        emit_state(app, "paused", Some(timer.clone()));
        Ok(timer)
    }

    pub fn resume(&self, app: &AppHandle, timer_id: &str) -> TimerResult<TimerSnapshot> {
        let (timer, revision) = self.mutate(|engine| engine.resume(timer_id, now_unix_ms()))?;
        emit_state(app, "resumed", Some(timer.clone()));
        self.spawn_worker(app.clone(), timer.timer_id.clone(), revision);
        Ok(timer)
    }

    pub fn cancel(&self, app: &AppHandle, timer_id: &str) -> TimerResult<TimerSnapshot> {
        let timer = self.mutate(|engine| engine.cancel(timer_id))?;
        emit_state(app, "cancelled", None);
        Ok(timer)
    }

    pub fn take_pending_finished(&self) -> TimerResult<Option<TimerSnapshot>> {
        self.mutate(|engine| Ok(engine.take_pending_finished()))
    }

    pub fn recover(&self, app: AppHandle) {
        let state = match self.lock() {
            Ok(engine) => engine
                .snapshot_at(now_unix_ms())
                .map(|timer| (timer, engine.revision)),
            Err(error) => {
                eprintln!("恢复番茄钟失败：{}", error.message);
                None
            }
        };
        let Some((timer, revision)) = state else {
            return;
        };
        if timer.status == TimerStatus::Running {
            self.spawn_worker(app, timer.timer_id, revision);
        }
    }

    fn spawn_worker(&self, app: AppHandle, timer_id: String, revision: u64) {
        let manager = self.clone();
        std::thread::spawn(move || loop {
            let now = now_unix_ms();
            let state = match manager.get_state() {
                Ok(Some(timer))
                    if timer.timer_id == timer_id && timer.status == TimerStatus::Running =>
                {
                    timer
                }
                _ => return,
            };
            if state.remaining_ms == 0 {
                match manager.finish_due(&app, &timer_id, revision, now) {
                    Ok(true) | Ok(false) => return,
                    Err(error) => {
                        eprintln!("完成番茄钟失败：{}", error.message);
                        return;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(state.remaining_ms.min(1_000).max(1)));
        });
    }

    fn finish_due(
        &self,
        app: &AppHandle,
        timer_id: &str,
        revision: u64,
        now: u64,
    ) -> TimerResult<bool> {
        let finished = self.mutate(|engine| Ok(engine.finish_if_due(timer_id, revision, now)))?;
        let Some(timer) = finished else {
            return Ok(false);
        };
        emit_state(app, "finished", None);
        let _ = app.emit(TIMER_FINISHED_AVAILABLE_EVENT, ());
        notify_user(app, &timer);
        Ok(true)
    }

    fn lock(&self) -> TimerResult<std::sync::MutexGuard<'_, TimerEngine>> {
        self.inner
            .lock()
            .map_err(|_| TimerError::new("timer_lock_failed", "番茄钟状态锁已损坏"))
    }

    fn mutate<T>(
        &self,
        operation: impl FnOnce(&mut TimerEngine) -> TimerResult<T>,
    ) -> TimerResult<T> {
        let mut engine = self.lock()?;
        let before = engine.clone();
        let result = operation(&mut engine)?;
        if let Err(error) = persist_engine(&self.path, &engine) {
            *engine = before;
            return Err(error);
        }
        Ok(result)
    }
}

fn emit_state(app: &AppHandle, reason: &str, timer: Option<TimerSnapshot>) {
    let _ = app.emit(
        TIMER_STATE_CHANGED_EVENT,
        TimerStateEvent {
            reason: reason.into(),
            timer,
        },
    );
}

fn notify_user(app: &AppHandle, timer: &TimerSnapshot) {
    if timer.sound_enabled {
        unsafe {
            let _ = MessageBeep(MB_ICONASTERISK);
        }
    }
    if timer.show_system_reminder {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show().and_then(|_| window.unminimize());
            let _ = window.request_user_attention(Some(UserAttentionType::Critical));
        }
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn read_engine(path: &Path) -> Option<TimerEngine> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn persist_engine(path: &Path, engine: &TimerEngine) -> TimerResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| TimerError::new("timer_persist_failed", "番茄钟状态路径没有父目录"))?;
    fs::create_dir_all(parent).map_err(|error| {
        TimerError::new("timer_persist_failed", format!("创建状态目录失败：{error}"))
    })?;
    let temporary = path.with_extension("json.tmp");
    let backup = backup_path(path);
    let mut bytes = serde_json::to_vec_pretty(engine).map_err(|error| {
        TimerError::new("timer_persist_failed", format!("序列化状态失败：{error}"))
    })?;
    bytes.push(b'\n');
    fs::write(&temporary, bytes).map_err(|error| {
        TimerError::new("timer_persist_failed", format!("写入临时状态失败：{error}"))
    })?;

    if backup.exists() {
        let _ = fs::remove_file(&backup);
    }
    if path.exists() {
        fs::rename(path, &backup).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            TimerError::new("timer_persist_failed", format!("轮换状态备份失败：{error}"))
        })?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temporary);
        return Err(TimerError::new(
            "timer_persist_failed",
            format!("提交番茄钟状态失败：{error}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(id: &str, duration_ms: u64) -> TimerStartRequest {
        TimerStartRequest {
            timer_id: id.into(),
            duration_ms,
            label: "专注".into(),
            kind: TimerKind::Focus,
            show_system_reminder: Some(false),
            sound_enabled: Some(false),
        }
    }

    #[test]
    fn pause_resume_uses_remaining_time_instead_of_frontend_ticks() {
        let mut engine = TimerEngine::default();
        let (_, first_revision) = engine.start(request("t1", 10_000), 1_000).unwrap();
        assert_eq!(engine.snapshot_at(4_000).unwrap().remaining_ms, 7_000);

        let paused = engine.pause("t1", 4_000).unwrap();
        assert_eq!(paused.remaining_ms, 7_000);
        assert_eq!(engine.snapshot_at(50_000).unwrap().remaining_ms, 7_000);

        let (resumed, second_revision) = engine.resume("t1", 50_000).unwrap();
        assert_eq!(resumed.deadline_unix_ms, Some(57_000));
        assert!(second_revision > first_revision);
    }

    #[test]
    fn sleep_or_forward_clock_jump_finishes_once() {
        let mut engine = TimerEngine::default();
        let (_, revision) = engine.start(request("t1", 5_000), 1_000).unwrap();
        assert!(engine.finish_if_due("t1", revision, 5_999).is_none());
        assert!(engine.finish_if_due("t1", revision, 20_000).is_some());
        assert!(engine.finish_if_due("t1", revision, 20_001).is_none());
        assert_eq!(engine.take_pending_finished().unwrap().remaining_ms, 0);
        assert!(engine.take_pending_finished().is_none());
    }

    #[test]
    fn cancel_and_revision_prevent_stale_completion() {
        let mut engine = TimerEngine::default();
        let (_, revision) = engine.start(request("t1", 1_000), 0).unwrap();
        engine.cancel("t1").unwrap();
        assert!(engine.finish_if_due("t1", revision, 5_000).is_none());
        assert!(engine.snapshot_at(5_000).is_none());
    }

    #[test]
    fn restart_snapshot_uses_saved_deadline_and_paused_remaining() {
        let mut running = TimerEngine::default();
        running.start(request("running", 10_000), 1_000).unwrap();
        let serialized = serde_json::to_vec(&running).unwrap();
        let restored: TimerEngine = serde_json::from_slice(&serialized).unwrap();
        assert_eq!(restored.snapshot_at(8_000).unwrap().remaining_ms, 3_000);

        let mut paused = running;
        paused.pause("running", 4_000).unwrap();
        let serialized = serde_json::to_vec(&paused).unwrap();
        let restored: TimerEngine = serde_json::from_slice(&serialized).unwrap();
        assert_eq!(restored.snapshot_at(80_000).unwrap().remaining_ms, 7_000);
    }

    #[test]
    fn rejects_duplicate_start_and_wrong_timer_id() {
        let mut engine = TimerEngine::default();
        engine.start(request("t1", 1_000), 0).unwrap();
        assert_eq!(
            engine.start(request("t2", 1_000), 0).unwrap_err().code,
            "timer_conflict"
        );
        assert_eq!(
            engine.pause("other", 100).unwrap_err().code,
            "timer_not_found"
        );
    }
}
