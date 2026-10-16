mod apps;
mod clip;
mod model;
mod orca;
mod screen;
mod settings;
mod share;
mod store;
mod wgc;
mod win;

use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use model::{Capture, DeliverRequest, SourceContext, Target};
use settings::Settings;

const ARM_WINDOW_MS: i64 = 90_000;
const SNIP_OWNERS: &[&str] = &["screenclippinghost.exe", "snippingtool.exe", "screensketch.exe"];

#[derive(Default)]
struct Armed {
    until: i64,
    context: Option<SourceContext>,
}

#[derive(Default)]
struct AppState {
    armed: Mutex<Armed>,
    own_seq: AtomicU32,
    settings: Mutex<Settings>,
    source_window: Mutex<Option<isize>>,
    shot: Mutex<Option<screen::Shot>>,
    shot_context: Mutex<Option<SourceContext>>,
}

fn panel(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn show_panel(app: &AppHandle) {
    if let Some(w) = panel(app) {
        let was_visible = w.is_visible().unwrap_or(false);
        if !was_visible {
            let _ = w.center();
        }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_always_on_top(true);
        let _ = w.set_focus();
        let _ = w.set_always_on_top(false);
    }
}

fn foreign_context(app: &AppHandle) -> SourceContext {
    let (hwnd, context) = win::foreground_context();
    if context.exe.as_deref().is_some_and(|e| e.eq_ignore_ascii_case("aisight.exe")) {
        return SourceContext::default();
    }
    *app.state::<AppState>().source_window.lock().unwrap() = hwnd.map(|h| h.0 as isize);
    context
}

#[derive(Clone, serde::Serialize)]
struct OverlayPayload {
    path: String,
    width: u32,
    height: u32,
    stamp: i64,
    windows: Vec<screen::WinInfo>,
}

fn start_overlay(app: &AppHandle) {
    let was_visible = panel(app).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if let Some(w) = panel(app) {
        let _ = w.hide();
    }
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(if was_visible { 180 } else { 40 }));
        let context = foreign_context(&app);
        let shot = match screen::grab() {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[aisight] screen grab failed: {e}");
                return;
            }
        };
        let preview = store::dir().join(".overlay.jpg");
        let rgb = image::DynamicImage::ImageRgba8(shot.image.clone()).to_rgb8();
        let mut file = match std::fs::File::create(&preview) {
            Ok(f) => std::io::BufWriter::new(f),
            Err(_) => return,
        };
        if image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, 88).encode_image(&rgb).is_err() {
            return;
        }
        drop(file);
        let payload = OverlayPayload {
            path: preview.to_string_lossy().replace('\\', "/"),
            width: shot.image.width(),
            height: shot.image.height(),
            stamp: store::now_ms(),
            windows: screen::all_windows(shot.x, shot.y, std::process::id()),
        };
        let (x, y, w, h) = (shot.x, shot.y, shot.image.width(), shot.image.height());
        let thumb_windows = payload.windows.clone();
        let thumb_stamp = payload.stamp;
        {
            let state = app.state::<AppState>();
            *state.shot.lock().unwrap() = Some(shot);
            *state.shot_context.lock().unwrap() = Some(context);
        }
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(o) = handle.get_webview_window("overlay") {
                let _ = o.set_position(tauri::PhysicalPosition::new(x, y));
                let _ = o.set_size(tauri::PhysicalSize::new(w, h));
                let _ = handle.emit_to("overlay", "overlay", payload);
                let _ = o.show();
                let _ = o.set_always_on_top(true);
                let _ = o.set_focus();
            }
            spawn_thumbnails(handle.clone(), thumb_windows, thumb_stamp);
        });
    });
}

#[derive(Clone, serde::Serialize)]
struct ThumbPayload {
    hwnd: String,
    path: String,
    stamp: i64,
}

fn spawn_thumbnails(app: AppHandle, windows: Vec<screen::WinInfo>, stamp: i64) {
    thread::spawn(move || {
        let dir = store::dir().join(".thumbs");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        for w in windows.into_iter().filter(|w| !w.minimized) {
            let still_open = app.get_webview_window("overlay").and_then(|o| o.is_visible().ok()).unwrap_or(false);
            if !still_open {
                break;
            }
            let Some(h) = win::handle_to_hwnd(&w.hwnd) else { continue };
            let Ok(img) = wgc::capture(h) else { continue };
            let thumb = image::imageops::thumbnail(&img, 360, (360 * img.height() / img.width().max(1)).max(1));
            let rgb = image::DynamicImage::ImageRgba8(thumb).to_rgb8();
            let path = dir.join(format!("{}.jpg", w.hwnd));
            let Ok(file) = std::fs::File::create(&path) else { continue };
            let mut out = std::io::BufWriter::new(file);
            if image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80).encode_image(&rgb).is_err() {
                continue;
            }
            drop(out);
            let _ = app.emit_to(
                "overlay",
                "overlay-thumb",
                ThumbPayload { hwnd: w.hwnd.clone(), path: path.to_string_lossy().replace('\\', "/"), stamp },
            );
        }
    });
}

fn start_capture_flow(app: &AppHandle) {
    let tool = app.state::<AppState>().settings.lock().unwrap().capture_tool.clone();
    if tool != "windows" {
        start_overlay(app);
        return;
    }
    let was_visible = panel(app).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if let Some(w) = panel(app) {
        let _ = w.hide();
    }
    let app = app.clone();
    thread::spawn(move || {
        if was_visible {
            thread::sleep(Duration::from_millis(150));
        }
        let context = foreign_context(&app);
        {
            let state = app.state::<AppState>();
            let mut armed = state.armed.lock().unwrap();
            armed.until = store::now_ms() + ARM_WINDOW_MS;
            armed.context = Some(context);
        }
        thread::sleep(Duration::from_millis(60));
        win::open_screen_clip();
    });
}

fn fingerprint(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes.iter().step_by(7) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h ^ bytes.len() as u64
}

fn watch_clipboard(app: AppHandle) {
    thread::spawn(move || {
        let mut last = win::clipboard_seq();
        let mut last_print: (u64, i64) = (0, 0);
        loop {
            thread::sleep(Duration::from_millis(200));
            let seq = win::clipboard_seq();
            if seq == last {
                continue;
            }
            last = seq;
            let state = app.state::<AppState>();
            if state.own_seq.load(Ordering::SeqCst) == seq {
                continue;
            }

            let owner = win::clipboard_owner_exe();
            let armed_context = {
                let mut armed = state.armed.lock().unwrap();
                if armed.until > store::now_ms() {
                    armed.until = 0;
                    Some(armed.context.take().unwrap_or_default())
                } else {
                    None
                }
            };
            let from_snip = owner.as_deref().is_none_or(|o| SNIP_OWNERS.contains(&o));
            if armed_context.is_none() && !from_snip {
                continue;
            }

            let Some(img) = read_clipboard_image() else { continue };
            let print = fingerprint(&img.bytes);
            let now = store::now_ms();
            if print == last_print.0 && now - last_print.1 < 5_000 {
                continue;
            }
            last_print = (print, now);
            let context = armed_context.unwrap_or_else(|| foreign_context(&app));
            match store::save_capture(&img.bytes, img.width as u32, img.height as u32, context) {
                Ok(capture) => {
                    let _ = app.emit("capture", &capture);
                    show_panel(&app);
                }
                Err(e) => eprintln!("[aisight] could not save the capture: {e}"),
            }
        }
    });
}

fn read_clipboard_image() -> Option<arboard::ImageData<'static>> {
    for _ in 0..6 {
        if let Ok(mut clip) = arboard::Clipboard::new() {
            if let Ok(img) = clip.get_image() {
                return Some(img.to_owned_img());
            }
        }
        thread::sleep(Duration::from_millis(80));
    }
    None
}

fn mark_own_write(app: &AppHandle) {
    app.state::<AppState>().own_seq.store(win::clipboard_seq(), Ordering::SeqCst);
}

fn apply_shortcut(app: &AppHandle, accel: &str) -> Result<(), String> {
    let shortcut = Shortcut::from_str(accel).map_err(|_| format!("Invalid shortcut: {accel}"))?;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.register(shortcut).map_err(|e| format!("{accel} is not available: {e}"))
}

fn apply_folder(app: &AppHandle, folder: &str) {
    let path = PathBuf::from(folder.replace('/', "\\"));
    let _ = std::fs::create_dir_all(&path);
    let _ = app.asset_protocol_scope().allow_directory(&path, true);
    store::set_dir(path);
}

#[tauri::command]
async fn list_targets() -> Result<Vec<Target>, String> {
    let own = std::process::id();
    let orca = tauri::async_runtime::spawn_blocking(orca::targets);
    let apps = tauri::async_runtime::spawn_blocking(move || apps::targets(own));
    let mut out = orca.await.map_err(|e| e.to_string())?;
    out.extend(apps.await.map_err(|e| e.to_string())?);
    Ok(out)
}

#[derive(serde::Serialize)]
struct DeliverResult {
    id: String,
    error: Option<String>,
}

#[tauri::command]
async fn deliver(app: AppHandle, req: DeliverRequest) -> Result<Vec<DeliverResult>, String> {
    let follow = app.state::<AppState>().settings.lock().unwrap().follow_on_attach && !req.submit && req.targets.len() == 1;
    let (orca_targets, window_targets): (Vec<Target>, Vec<Target>) = req.targets.iter().cloned().partition(|t| t.delivery.starts_with("orca"));
    let mut results = vec![];

    let image = req.image_paths.clone();
    let text = req.text.clone();
    let submit = req.submit;
    let orca_done = tauri::async_runtime::spawn_blocking(move || {
        orca_targets
            .into_iter()
            .map(|t| {
                let r = orca::deliver(&t.handle, &image, &text, submit, t.delivery == "orca-at");
                if r.is_ok() && follow {
                    orca::reveal(&t.handle);
                }
                DeliverResult { id: t.id, error: r.err() }
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;
    results.extend(orca_done);

    if !window_targets.is_empty() {
        if let Some(w) = panel(&app) {
            let _ = w.hide();
        }
        let handle = app.clone();
        let source = *app.state::<AppState>().source_window.lock().unwrap();
        let image = req.image_paths.clone();
        let text = req.text.clone();
        let done = tauri::async_runtime::spawn_blocking(move || {
            thread::sleep(Duration::from_millis(140));
            let out: Vec<DeliverResult> = window_targets
                .iter()
                .map(|t| {
                    let r = apps::deliver(&t.handle, &t.delivery, &image, &text, submit, &|| mark_own_write(&handle));
                    thread::sleep(Duration::from_millis(150));
                    DeliverResult { id: t.id.clone(), error: r.err() }
                })
                .collect();
            if !follow {
                if let Some(h) = source.filter(|h| window_targets.iter().all(|t| win::handle_to_hwnd(&t.handle).map(|x| x.0 as isize) != Some(*h))) {
                    thread::sleep(Duration::from_millis(200));
                    win::focus(windows::Win32::Foundation::HWND(h as *mut _));
                }
            }
            out
        })
        .await
        .map_err(|e| e.to_string())?;
        results.extend(done);
    }
    Ok(results)
}

#[tauri::command]
fn save_render(capture_id: String, png: Vec<u8>, kind: String) -> Result<String, String> {
    store::save_render(&capture_id, &png, &kind)
}

#[tauri::command]
fn save_record(capture: Capture) -> Result<(), String> {
    store::save_record(&capture)
}

#[tauri::command]
fn history() -> Vec<Capture> {
    store::history()
}

#[tauri::command]
fn start_capture(app: AppHandle) {
    start_capture_flow(&app);
}

#[tauri::command]
fn hide_panel(app: AppHandle) {
    if let Some(w) = panel(&app) {
        let _ = w.hide();
    }
}

#[tauri::command]
fn copy_image(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    clip::set_image_files(&paths)?;
    mark_own_write(&app);
    Ok(())
}

#[tauri::command]
async fn post_to_x(app: AppHandle, paths: Vec<String>, text: String) -> Result<String, String> {
    if let Some(w) = panel(&app) {
        let _ = w.hide();
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || apps::post_to_x(&paths, &text, &|| mark_own_write(&handle)).map(str::to_string))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn finish_overlay(app: AppHandle, x: u32, y: u32, w: u32, h: u32) -> Result<(), String> {
    if let Some(o) = app.get_webview_window("overlay") {
        let _ = o.hide();
    }
    let state = app.state::<AppState>();
    let shot = state.shot.lock().unwrap().take().ok_or("no shot")?;
    let context = state.shot_context.lock().unwrap().take().unwrap_or_default();
    let (iw, ih) = shot.image.dimensions();
    let x = x.min(iw.saturating_sub(1));
    let y = y.min(ih.saturating_sub(1));
    let w = w.clamp(1, iw - x);
    let h = h.clamp(1, ih - y);
    let crop = image::imageops::crop_imm(&shot.image, x, y, w, h).to_image();
    let capture = store::save_capture(crop.as_raw(), w, h, context)?;
    let _ = app.emit_to("main", "capture", &capture);
    show_panel(&app);
    Ok(())
}

#[tauri::command]
fn finish_window(app: AppHandle, hwnd: String) -> Result<(), String> {
    if let Some(o) = app.get_webview_window("overlay") {
        let _ = o.hide();
    }
    let state = app.state::<AppState>();
    let shot = state.shot.lock().unwrap().take();
    state.shot_context.lock().unwrap().take();
    let h = win::handle_to_hwnd(&hwnd).ok_or("window")?;
    let minimized = unsafe { windows::Win32::UI::WindowsAndMessaging::IsIconic(h).as_bool() };
    if minimized {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::ShowWindow(h, windows::Win32::UI::WindowsAndMessaging::SW_SHOWNOACTIVATE);
        }
        thread::sleep(Duration::from_millis(350));
    }
    let attempt = wgc::capture(h).or_else(|_| screen::capture_window(h));
    if minimized {
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::ShowWindow(h, windows::Win32::UI::WindowsAndMessaging::SW_SHOWMINNOACTIVE);
        }
    }
    let image = match attempt {
        Ok(img) => img,
        Err(_) => {
            let shot = shot.ok_or("window")?;
            let info = screen::windows_on_screen(shot.x, shot.y, std::process::id()).into_iter().find(|w| w.hwnd == hwnd).ok_or("window")?;
            let (iw, ih) = shot.image.dimensions();
            let x = info.x.max(0) as u32;
            let y = info.y.max(0) as u32;
            image::imageops::crop_imm(&shot.image, x, y, (info.w as u32).min(iw - x), (info.h as u32).min(ih - y)).to_image()
        }
    };
    let (_, context) = win::context_for(h);
    let (w, hh) = image.dimensions();
    let capture = store::save_capture(image.as_raw(), w, hh, context)?;
    let _ = app.emit_to("main", "capture", &capture);
    show_panel(&app);
    Ok(())
}

#[tauri::command]
fn cancel_overlay(app: AppHandle) {
    if let Some(o) = app.get_webview_window("overlay") {
        let _ = o.hide();
    }
    let state = app.state::<AppState>();
    state.shot.lock().unwrap().take();
    state.shot_context.lock().unwrap().take();
}

#[tauri::command]
fn open_url(url: String) {
    if url.starts_with("https://") {
        win::open_url(&url);
    }
}

#[tauri::command]
fn clipboard_text() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok().filter(|t| !t.trim().is_empty())
}

#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
    std::fs::copy(from.replace('/', "\\"), &to).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn share(app: AppHandle, paths: Vec<String>, title: String) -> Result<(), String> {
    let w = panel(&app).ok_or("No window")?;
    let hwnd = w.hwnd().map_err(|e| e.to_string())?;
    let raw = hwnd.0 as isize;
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let h = windows::Win32::Foundation::HWND(raw as *mut _);
        let _ = tx.send(share::show(h, paths, title));
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
fn reveal(path: String) {
    let _ = std::process::Command::new("explorer").arg(format!("/select,{}", path.replace('/', "\\"))).spawn();
}

#[tauri::command]
fn open_folder() {
    let _ = std::process::Command::new("explorer").arg(store::dir()).spawn();
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    app.state::<AppState>().settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, next: Settings) -> Result<Settings, String> {
    let prev = app.state::<AppState>().settings.lock().unwrap().clone();
    if next.shortcut != prev.shortcut {
        if let Err(e) = apply_shortcut(&app, &next.shortcut) {
            let _ = apply_shortcut(&app, &prev.shortcut);
            return Err(e);
        }
    }
    if next.autostart != prev.autostart {
        settings::set_autostart(next.autostart)?;
    }
    if next.folder != prev.folder {
        apply_folder(&app, &next.folder);
    }
    if next.language != prev.language {
        if let (Some(tray), Ok(menu)) = (app.tray_by_id("aisight"), tray_menu(&app, &next.language)) {
            let _ = tray.set_menu(Some(menu));
        }
    }
    settings::save(&next)?;
    *app.state::<AppState>().settings.lock().unwrap() = next.clone();
    Ok(next)
}

fn tray_labels(lang: &str) -> [&'static str; 4] {
    match lang {
        "es" => ["Capturar", "Abrir AISight", "Carpeta de capturas", "Salir"],
        "zh" => ["截图", "打开 AISight", "截图文件夹", "退出"],
        _ => ["Capture", "Open AISight", "Captures folder", "Quit"],
    }
}

fn tray_menu(app: &AppHandle, lang: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let [capture, open, folder, quit] = tray_labels(lang);
    let capture = MenuItem::with_id(app, "capture", capture, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let folder = MenuItem::with_id(app, "folder", folder, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&capture, &open, &folder, &sep, &quit])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial = settings::load();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_panel(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        start_capture_flow(app);
                    }
                })
                .build(),
        )
        .manage(AppState { settings: Mutex::new(initial.clone()), ..Default::default() })
        .invoke_handler(tauri::generate_handler![
            list_targets,
            deliver,
            save_render,
            save_record,
            history,
            start_capture,
            hide_panel,
            copy_image,
            copy_file,
            clipboard_text,
            open_url,
            finish_overlay,
            finish_window,
            cancel_overlay,
            post_to_x,
            share,
            reveal,
            open_folder,
            get_settings,
            set_settings
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            apply_folder(&handle, &initial.folder);
            if apply_shortcut(&handle, &initial.shortcut).is_err() {
                let _ = apply_shortcut(&handle, &Settings::default().shortcut);
            }

            let menu = tray_menu(&handle, &initial.language)?;

            TrayIconBuilder::with_id("aisight")
                .icon(app.default_window_icon().cloned().expect("icono"))
                .tooltip("AISight")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "capture" => start_capture_flow(app),
                    "open" => show_panel(app),
                    "folder" => {
                        let _ = std::process::Command::new("explorer").arg(store::dir()).spawn();
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            watch_clipboard(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("AISight failed to start");
}
