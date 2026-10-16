use std::thread::sleep;
use std::time::Duration;

use crate::model::Target;
use crate::win;

const TERMINALS: &[&str] = &["windowsterminal.exe", "wezterm-gui.exe", "alacritty.exe", "warp.exe", "conhost.exe", "tabby.exe"];
const SKIP: &[&str] = &[
    "textinputhost.exe",
    "applicationframehost.exe",
    "shellexperiencehost.exe",
    "searchhost.exe",
    "startmenuexperiencehost.exe",
    "lockapp.exe",
    "systemsettings.exe",
    "orca.exe",
    "explorer.exe",
    "msedgewebview2.exe",
];
const CHAT_SITES: &[(&str, &str)] = &[("claude", "claude"), ("chatgpt", "chatgpt"), ("gemini", "gemini"), ("grok", "grok"), ("whatsapp", "whatsapp")];

fn desktop_app(exe: &str, path: &str) -> Option<(&'static str, &'static str)> {
    let p = path.to_ascii_lowercase();
    match exe {
        "claude.exe" if !p.contains(".local\\bin") => Some(("claude", "Claude")),
        "codex.exe" => Some(("codex", "Codex")),
        "antigravity.exe" => Some(("antigravity", "Antigravity")),
        "cursor.exe" => Some(("cursor", "Cursor")),
        "chatgpt.exe" => Some(("chatgpt", "ChatGPT")),
        "grok bot.exe" | "grok.exe" => Some(("grok", "Grok Bot")),
        "copilot.exe" => Some(("copilot", "Copilot")),
        "whatsapp.root.exe" | "whatsapp.exe" => Some(("whatsapp", "WhatsApp")),
        _ => None,
    }
}

fn terminal_agent(descendants: &[String], title: &str) -> Option<(&'static str, &'static str)> {
    let has = |name: &str| descendants.iter().any(|d| d == name);
    let t = title.to_ascii_lowercase();
    if has("claude.exe") {
        Some(("claude", "paste-path"))
    } else if has("codex.exe") {
        Some(("codex", "paste-path"))
    } else if t.contains("gemini") {
        Some(("gemini", "at-path"))
    } else if t.contains("grok") {
        Some(("grok", "at-path"))
    } else if has("opencode.exe") || t.contains("opencode") {
        Some(("opencode", "at-path"))
    } else {
        None
    }
}

fn workspace_from_title(title: &str, app: &str) -> Option<String> {
    let parts: Vec<&str> = title.split(" - ").map(str::trim).filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case(app)).collect();
    parts.last().map(|s| s.to_string()).filter(|s| s != title)
}

pub fn targets(own_pid: u32) -> Vec<Target> {
    let table = win::process_table();
    let mut out = vec![];
    for w in win::top_windows() {
        if w.pid == own_pid {
            continue;
        }
        let Some(path) = win::process_path(w.pid) else { continue };
        let exe = win::exe_name(&path).to_ascii_lowercase();
        let handle = win::hwnd_to_handle(w.hwnd);

        if let Some((brand, label)) = desktop_app(&exe, &path) {
            out.push(Target {
                id: format!("win:{handle}"),
                host: brand.into(),
                agent: None,
                title: label.into(),
                detail: workspace_from_title(&w.title, label).or_else(|| Some("desktop".into())),
                delivery: "paste-image".into(),
                handle,
                last_active_at: None,
                busy: false,
                other: false,
            });
            continue;
        }

        if TERMINALS.contains(&exe.as_str()) {
            let kids = win::descendants(&table, w.pid);
            if let Some((agent, delivery)) = terminal_agent(&kids, &w.title) {
                let title = w.title.trim_start_matches(|c: char| !c.is_alphanumeric()).trim();
                out.push(Target {
                    id: format!("win:{handle}"),
                    host: "terminal".into(),
                    agent: Some(agent.into()),
                    title: if title.is_empty() { "Terminal".into() } else { title.to_string() },
                    detail: Some(win::friendly_app(&exe)),
                    delivery: delivery.into(),
                    handle,
                    last_active_at: None,
                    busy: false,
                    other: false,
                });
            }
            continue;
        }

        if win::is_browser(&exe) {
            let lower = w.title.to_ascii_lowercase();
            if let Some((_, brand)) = CHAT_SITES.iter().find(|(needle, _)| lower.contains(needle)) {
                out.push(Target {
                    id: format!("win:{handle}"),
                    host: (*brand).into(),
                    agent: None,
                    title: w.title.split(" - ").next().unwrap_or(&w.title).trim().to_string(),
                    detail: Some(win::friendly_app(&exe)),
                    delivery: "paste-image".into(),
                    handle,
                    last_active_at: None,
                    busy: false,
                    other: false,
                });
                continue;
            }
        }

        if SKIP.contains(&exe.as_str()) {
            continue;
        }
        let app = win::friendly_app(&exe);
        let title = w.title.trim();
        out.push(Target {
            id: format!("win:{handle}"),
            host: "app".into(),
            agent: None,
            title: if title.eq_ignore_ascii_case(&app) { app.clone() } else { title.to_string() },
            detail: Some(app),
            delivery: "paste-image".into(),
            handle,
            last_active_at: None,
            busy: false,
            other: true,
        });
    }
    out
}

fn flatten(text: &str) -> String {
    text.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("  ·  ")
}

fn guard(hwnd: windows::Win32::Foundation::HWND) -> Result<(), String> {
    if win::is_foreground(hwnd) {
        return Ok(());
    }
    sleep(Duration::from_millis(200));
    if win::focus(hwnd) && win::ensure_text_focus(hwnd) && win::is_foreground(hwnd) {
        return Ok(());
    }
    Err("focus_lost".into())
}

fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn x_window() -> Option<windows::Win32::Foundation::HWND> {
    let fg = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() };
    let path = win::process_path(win::window_pid(fg))?;
    if !win::is_browser(&win::exe_name(&path)) {
        return None;
    }
    let title = win::window_title(fg);
    let t = title.to_lowercase();
    (t.contains("/ x") || t.starts_with("x ") || t.starts_with("x -") || t.contains("x.com")).then_some(fg)
}

pub fn post_to_x(image_paths: &[String], text: &str, mark_own_write: &dyn Fn()) -> Result<&'static str, String> {
    let first: Vec<String> = image_paths.iter().take(4).cloned().collect();
    crate::clip::set_image_files(&first)?;
    mark_own_write();
    let url = if text.trim().is_empty() {
        "https://x.com/compose/post".to_string()
    } else {
        format!("https://x.com/intent/post?text={}", url_encode(text.trim()))
    };
    win::open_url(&url);
    let mut found = None;
    for _ in 0..60 {
        sleep(Duration::from_millis(250));
        if let Some(h) = x_window() {
            found = Some(h);
            break;
        }
    }
    let Some(hwnd) = found else { return Ok("clipboard") };
    sleep(Duration::from_millis(1200));
    if !win::is_foreground(hwnd) || !win::ensure_text_focus(hwnd) || !win::is_foreground(hwnd) {
        return Ok("clipboard");
    }
    win::press_end();
    win::press_paste();
    Ok("pasted")
}

pub fn deliver(
    handle: &str,
    delivery: &str,
    image_paths: &[String],
    text: &str,
    submit: bool,
    mark_own_write: &dyn Fn(),
) -> Result<(), String> {
    let hwnd = win::handle_to_hwnd(handle).ok_or("Invalid window")?;
    let mut clip = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let natives: Vec<String> = image_paths.iter().map(|p| p.replace('/', "\\")).collect();
    let native = natives.join(" ");

    match delivery {
        "paste-image" => {
            crate::clip::set_image_files(&natives)?;
            mark_own_write();
            if !win::focus(hwnd) {
                return Err("focus_failed".into());
            }
            if !win::ensure_text_focus(hwnd) {
                return Err("no_input".into());
            }
            guard(hwnd)?;
                win::press_paste();
            if !text.is_empty() {
                sleep(Duration::from_millis(450));
                clip.set_text(text.to_string()).map_err(|e| e.to_string())?;
                mark_own_write();
                guard(hwnd)?;
                win::press_paste();
            }
        }
        "paste-path" | "at-path" => {
            let body = flatten(text);
            let line = if delivery == "at-path" {
                format!("@{native} {body}")
            } else if body.is_empty() {
                native.clone()
            } else {
                format!("{native} {body}")
            };
            if delivery == "paste-path" {
                clip.set_text(native.clone()).map_err(|e| e.to_string())?;
                mark_own_write();
                if !win::focus(hwnd) {
                    return Err("focus_failed".into());
                }
                guard(hwnd)?;
                win::press_paste();
                if !body.is_empty() {
                    sleep(Duration::from_millis(300));
                    clip.set_text(format!(" {body}")).map_err(|e| e.to_string())?;
                    mark_own_write();
                    guard(hwnd)?;
                win::press_paste();
                }
            } else {
                clip.set_text(line).map_err(|e| e.to_string())?;
                mark_own_write();
                if !win::focus(hwnd) {
                    return Err("focus_failed".into());
                }
                guard(hwnd)?;
                win::press_paste();
            }
        }
        other => return Err(format!("Unknown delivery: {other}")),
    }

    if submit {
        sleep(Duration::from_millis(400));
        guard(hwnd)?;
        win::press_enter();
    }
    Ok(())
}
