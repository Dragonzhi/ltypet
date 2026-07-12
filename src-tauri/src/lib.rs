// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::OnceLock;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use windows::Win32::Foundation::{POINT, LPARAM, WPARAM, LRESULT};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetCursorPos, GetMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, MSG, WH_MOUSE_LL,
};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if let Some(app) = APP_HANDLE.get() {
        let mut pos = POINT::default();
        if GetCursorPos(&mut pos).is_ok() {
            let _ = app.emit(
                "global-cursor-move",
                serde_json::json!({ "x": pos.x as f64, "y": pos.y as f64 }),
            );
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

fn start_global_mouse_hook(app_handle: tauri::AppHandle) {
    APP_HANDLE.set(app_handle).ok();
    std::thread::spawn(move || {
        unsafe {
            let hook: HHOOK = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), None, 0)
                .expect("failed to set global mouse hook");

            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }

            let _ = UnhookWindowsHookEx(hook);
        }
    });
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
async fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn setup_context_menu(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    let exit_item = MenuItemBuilder::new("退出")
        .id("exit")
        .accelerator("Ctrl+Shift+Q")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .items(&[&exit_item])
        .build()
        .map_err(|e| e.to_string())?;

    window.set_menu(menu).map_err(|e| e.to_string())?;

    // Handle menu events
    app.on_menu_event(move |app, event| {
        if event.id().as_ref() == "exit" {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.close();
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("Ctrl+Shift+Q")
                .expect("failed to register shortcut")
                .with_handler(|app, _, _| {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.close();
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            start_dragging,
            close_window,
            setup_context_menu
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            // 启动全局鼠标钩子（追踪全屏鼠标位置）
            start_global_mouse_hook(app_handle.clone());
            let window = app.get_webview_window("main").unwrap();
            tauri::async_runtime::spawn(async move {
                let _ = setup_context_menu(app_handle, window).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
