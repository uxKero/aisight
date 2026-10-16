use std::collections::HashMap;
use std::thread::sleep;
use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::DataExchange::{GetClipboardOwner, GetClipboardSequenceNumber};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL,
    VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_MENU, VK_RCONTROL, VK_RETURN, VK_RSHIFT, VK_SHIFT, VK_V,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_OWNER, GetForegroundWindow, GetWindow, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, SW_RESTORE, SW_SHOWNORMAL, SetForegroundWindow, ShowWindow,
};
use windows::core::{BOOL, HSTRING, PCWSTR, w};

use crate::model::SourceContext;

pub fn hwnd_to_handle(h: HWND) -> String {
    format!("{}", h.0 as isize)
}

pub fn handle_to_hwnd(s: &str) -> Option<HWND> {
    s.parse::<isize>().ok().map(|v| HWND(v as *mut _))
}

pub fn window_title(h: HWND) -> String {
    unsafe {
        let len = GetWindowTextLengthW(h);
        if len <= 0 {
            return String::new();
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(h, &mut buf);
        String::from_utf16_lossy(&buf[..n as usize])
    }
}

pub fn window_pid(h: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    pid
}

pub fn process_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        ok.ok()?;
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

pub fn exe_name(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).to_string()
}

pub struct Proc {
    pub parent: u32,
    pub exe: String,
}

pub fn process_table() -> HashMap<u32, Proc> {
    let mut out = HashMap::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let end = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                out.insert(
                    entry.th32ProcessID,
                    Proc { parent: entry.th32ParentProcessID, exe: String::from_utf16_lossy(&entry.szExeFile[..end]) },
                );
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
    }
    out
}

pub fn descendants(table: &HashMap<u32, Proc>, root: u32) -> Vec<String> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, p) in table {
        children.entry(p.parent).or_default().push(*pid);
    }
    let mut out = vec![];
    let mut stack = vec![root];
    let mut guard = 0;
    while let Some(pid) = stack.pop() {
        guard += 1;
        if guard > 4096 {
            break;
        }
        if let Some(kids) = children.get(&pid) {
            for k in kids {
                if *k == pid {
                    continue;
                }
                if let Some(p) = table.get(k) {
                    out.push(p.exe.to_ascii_lowercase());
                }
                stack.push(*k);
            }
        }
    }
    out
}

pub struct TopWindow {
    pub hwnd: HWND,
    pub title: String,
    pub pid: u32,
}

pub fn top_windows() -> Vec<TopWindow> {
    unsafe extern "system" fn cb(h: HWND, lp: LPARAM) -> BOOL {
        unsafe {
            let list = &mut *(lp.0 as *mut Vec<HWND>);
            if IsWindowVisible(h).as_bool() && GetWindow(h, GW_OWNER).map(|o| o.0.is_null()).unwrap_or(true) {
                list.push(h);
            }
        }
        BOOL(1)
    }
    let mut list: Vec<HWND> = vec![];
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut list as *mut _ as isize));
    }
    list.into_iter()
        .map(|h| TopWindow { hwnd: h, title: window_title(h), pid: window_pid(h) })
        .filter(|w| !w.title.trim().is_empty())
        .collect()
}

pub fn foreground_context() -> (Option<HWND>, SourceContext) {
    let h = unsafe { GetForegroundWindow() };
    context_for(h)
}

pub fn context_for(h: HWND) -> (Option<HWND>, SourceContext) {
    if h.0.is_null() {
        return (None, SourceContext::default());
    }
    let title = window_title(h);
    let exe_path = process_path(window_pid(h));
    let exe = exe_path.as_deref().map(exe_name);
    let app = exe.as_deref().map(friendly_app);
    let url = exe.as_deref().filter(|e| is_browser(e)).and_then(|_| browser_url(h));
    (
        Some(h),
        SourceContext {
            app,
            exe,
            title: if title.is_empty() { None } else { Some(clean_title(&title)) },
            url,
        },
    )
}

fn clean_title(t: &str) -> String {
    let browsers = ["Microsoft\u{200b} Edge", "Microsoft Edge", "Google Chrome", "Brave", "Mozilla Firefox", "Opera", "Vivaldi", "Arc"];
    let mut title = t.to_string();
    for b in browsers {
        if let Some(i) = title.rfind(b) {
            let head = title[..i].trim_end();
            let head = match head.rsplit_once(" - ") {
                Some((h, last)) if last.contains(':') || last.trim().is_empty() => h,
                _ => head,
            };
            title = head.trim_end_matches(&['-', ' ', ':'][..]).to_string();
            break;
        }
    }
    for marker in [" y ", " and "] {
        if let Some(i) = title.rfind(marker) {
            let tail = &title[i + marker.len()..];
            let numbered = tail.chars().next().is_some_and(|c| c.is_ascii_digit());
            if numbered && ["página", "page", "tab", "pestaña"].iter().any(|k| tail.contains(k)) {
                title.truncate(i);
            }
        }
    }
    title.trim().to_string()
}

pub fn is_browser(exe: &str) -> bool {
    matches!(
        exe.to_ascii_lowercase().as_str(),
        "chrome.exe" | "msedge.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe" | "arc.exe" | "firefox.exe" | "zen.exe"
    )
}

pub fn friendly_app(exe: &str) -> String {
    let lower = exe.to_ascii_lowercase();
    let name = match lower.as_str() {
        "chrome.exe" => "Chrome",
        "msedge.exe" => "Edge",
        "brave.exe" => "Brave",
        "firefox.exe" => "Firefox",
        "code.exe" => "VS Code",
        "windowsterminal.exe" => "Terminal",
        "explorer.exe" => "Explorer",
        "whatsapp.root.exe" | "whatsapp.exe" => "WhatsApp",
        "figma.exe" => "Figma",
        "orca.exe" => "Orca",
        "javaw.exe" => "Minecraft",
        _ => "",
    };
    if !name.is_empty() {
        return name.to_string();
    }
    let base = exe.trim_end_matches(".exe").trim_end_matches(".EXE");
    let base = base.split('.').next().unwrap_or(base);
    let mut c = base.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => base.to_string(),
    }
}

fn browser_url(h: HWND) -> Option<String> {
    let raw = h.0 as isize;
    std::thread::spawn(move || browser_url_inner(HWND(raw as *mut _))).join().ok().flatten()
}

fn browser_url_inner(h: HWND) -> Option<String> {
    use uiautomation::UIAutomation;
    use uiautomation::controls::ControlType;
    use uiautomation::types::Handle;
    let automation = UIAutomation::new().ok()?;
    let root = automation.element_from_handle(Handle::from(h.0 as isize)).ok()?;
    let matcher = automation.create_matcher().from(root).control_type(ControlType::Edit).depth(25).timeout(400);
    let edit = matcher.find_first().ok()?;
    let value: uiautomation::patterns::UIValuePattern = edit.get_pattern().ok()?;
    let raw = value.get_value().ok()?;
    let raw = raw.trim();
    if raw.is_empty() || raw.contains(' ') {
        return None;
    }
    if raw.starts_with("http") || raw.starts_with("file:") || raw.starts_with("chrome") {
        Some(raw.to_string())
    } else {
        Some(format!("https://{raw}"))
    }
}

pub fn clipboard_seq() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

pub fn clipboard_owner_exe() -> Option<String> {
    unsafe {
        let h = GetClipboardOwner().ok()?;
        if h.0.is_null() {
            return None;
        }
        process_path(window_pid(h)).map(|p| exe_name(&p).to_ascii_lowercase())
    }
}

pub fn open_url(url: &str) {
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

pub fn open_screen_clip() {
    unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from("ms-screenclip:"), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}

pub fn focus(h: HWND) -> bool {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::BringWindowToTop;
    unsafe {
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        release_modifiers();
        if GetForegroundWindow() != h {
            let fg = GetForegroundWindow();
            let fg_thread = GetWindowThreadProcessId(fg, None);
            let me = GetCurrentThreadId();
            let attached = fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
            send(&[key(VK_MENU, false), key(VK_MENU, true)]);
            let _ = BringWindowToTop(h);
            let _ = SetForegroundWindow(h);
            if attached {
                let _ = AttachThreadInput(me, fg_thread, false);
            }
        }
        for _ in 0..10 {
            if GetForegroundWindow() == h {
                sleep(Duration::from_millis(80));
                return true;
            }
            sleep(Duration::from_millis(40));
        }
        false
    }
}

pub fn is_foreground(h: HWND) -> bool {
    unsafe { GetForegroundWindow() == h }
}

fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn send(inputs: &[INPUT]) {
    unsafe {
        SendInput(inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

pub fn release_modifiers() {
    send(&[
        key(VK_SHIFT, true),
        key(VK_LSHIFT, true),
        key(VK_RSHIFT, true),
        key(VK_CONTROL, true),
        key(VK_LCONTROL, true),
        key(VK_RCONTROL, true),
        key(VK_MENU, true),
        key(VK_LMENU, true),
    ]);
}

pub fn press_paste() {
    send(&[key(VK_CONTROL, false), key(VK_V, false), key(VK_V, true), key(VK_CONTROL, true)]);
    sleep(Duration::from_millis(60));
}

pub fn press_end() {
    use windows::Win32::UI::Input::KeyboardAndMouse::VK_END;
    send(&[key(VK_CONTROL, false), key(VK_END, false), key(VK_END, true), key(VK_CONTROL, true)]);
    sleep(Duration::from_millis(40));
}

pub fn press_enter() {
    send(&[key(VK_RETURN, false), key(VK_RETURN, true)]);
}

fn is_text_input(el: &uiautomation::UIElement) -> bool {
    use uiautomation::controls::ControlType;
    let editable = match el.get_control_type() {
        Ok(ControlType::Edit) | Ok(ControlType::ComboBox) => true,
        Ok(ControlType::Document) => el
            .get_bounding_rectangle()
            .map(|r| r.get_height() < 500)
            .unwrap_or(false),
        _ => false,
    };
    editable && el.is_enabled().unwrap_or(false) && el.is_keyboard_focusable().unwrap_or(false)
}

pub fn ensure_text_focus(h: HWND) -> bool {
    let raw = h.0 as isize;
    std::thread::spawn(move || ensure_text_focus_inner(HWND(raw as *mut _))).join().unwrap_or(false)
}

fn ensure_text_focus_inner(h: HWND) -> bool {
    use uiautomation::UIAutomation;
    use uiautomation::controls::ControlType;
    use uiautomation::types::Handle;
    let Ok(automation) = UIAutomation::new() else { return false };
    let pid = window_pid(h);
    let chatty = |e: &uiautomation::UIElement| {
        let name = e.get_name().unwrap_or_default().to_lowercase();
        ["ask", "message", "mensaje", "chat", "prompt", "escribe", "type", "pregunta", "plan", "agent", "follow"].iter().any(|k| name.contains(k))
    };
    for attempt in 0..6 {
        if let Ok(focused) = automation.get_focused_element() {
            if focused.get_process_id().ok() == Some(pid) && is_text_input(&focused) {
                return true;
            }
        }
        if let Ok(root) = automation.element_from_handle(Handle::from(h.0 as isize)) {
            let mut candidates: Vec<uiautomation::UIElement> = vec![];
            for ct in [ControlType::Edit, ControlType::ComboBox, ControlType::Document, ControlType::Group] {
                let found = automation.create_matcher().from(root.clone()).control_type(ct).depth(80).timeout(600).find_all().unwrap_or_default();
                candidates.extend(found.into_iter().filter(|e| {
                    (is_text_input(e) || (chatty(e) && e.is_keyboard_focusable().unwrap_or(false))) && !e.is_offscreen().unwrap_or(true)
                }));
            }
            let best = candidates.into_iter().max_by_key(|e| {
                let r = e.get_bounding_rectangle().ok();
                let bottom = r.as_ref().map(|r| r.get_bottom() as i64).unwrap_or(0);
                let small = r.as_ref().map(|r| (r.get_height() < 400) as i64).unwrap_or(0);
                (chatty(e) as i64) * 100_000_000 + small * 10_000_000 + bottom
            });
            if let Some(el) = best {
                if el.set_focus().is_ok() {
                    sleep(Duration::from_millis(120));
                    if automation.get_focused_element().ok().and_then(|f| f.get_process_id().ok()) == Some(pid) {
                        return true;
                    }
                }
            }
        }
        sleep(Duration::from_millis(if attempt == 0 { 250 } else { 350 }));
    }
    false
}
