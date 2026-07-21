mod commands;
mod models;
mod project_io;
mod publish;
mod recovery;

use models::StoredPublishPlan;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct HostState {
    app_data: PathBuf,
    known_roots: Mutex<HashSet<PathBuf>>,
    publish_plans: Mutex<HashMap<String, StoredPublishPlan>>,
}

#[cfg(windows)]
struct SingleInstanceGuard(isize);

#[cfg(windows)]
impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        unsafe {
            CloseHandle(self.0 as HANDLE);
        }
    }
}

#[cfg(windows)]
fn acquire_single_instance() -> Result<SingleInstanceGuard, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
    use windows_sys::Win32::System::Threading::CreateMutexW;

    let name: Vec<u16> = std::ffi::OsStr::new("Local\\com.ltypet.animation-studio")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        return Err(format!(
            "single-instance mutex creation failed: {}",
            std::io::Error::last_os_error()
        ));
    }
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            CloseHandle(handle);
        }
        return Err("Animation Studio is already running".to_string());
    }
    Ok(SingleInstanceGuard(handle as isize))
}

#[cfg(not(windows))]
struct SingleInstanceGuard;

#[cfg(not(windows))]
fn acquire_single_instance() -> Result<SingleInstanceGuard, String> {
    Ok(SingleInstanceGuard)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _single_instance = match acquire_single_instance() {
        Ok(guard) => guard,
        Err(error) => {
            eprintln!("{error}");
            return;
        }
    };
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data)?;
            app.manage(HostState {
                app_data,
                known_roots: Mutex::new(HashSet::new()),
                publish_plans: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::choose_project_directory,
            commands::choose_artwork_and_assets,
            commands::read_project,
            commands::save_project,
            commands::save_project_as,
            commands::get_project_compatibility,
            commands::list_project_backups,
            commands::restore_project_backup,
            commands::list_recent_projects,
            commands::remove_recent_project,
            commands::read_recovery_candidates,
            commands::write_recovery,
            commands::discard_recovery,
            commands::export_diagnostics,
            commands::export_canonical_assets,
            commands::prepare_production_publish,
            commands::commit_production_publish,
            commands::cancel_production_publish,
            commands::reveal_path,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("Animation Studio failed to start: {error}"));
}
