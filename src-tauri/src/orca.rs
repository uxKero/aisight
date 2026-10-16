use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use serde_json::Value;

use crate::model::Target;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PASTE_START: &str = "\u{1b}[200~";
const PASTE_END: &str = "\u{1b}[201~";

fn exe() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let p = PathBuf::from(local).join("Programs").join("orca").join("resources").join("bin").join("orca.exe");
    p.exists().then_some(p)
}

fn run(args: &[&str]) -> Result<Value, String> {
    let exe = exe().ok_or("Orca is not installed")?;
    let out = Command::new(exe)
        .args(args)
        .arg("--json")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|_| {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.trim().is_empty() { "Orca did not answer".to_string() } else { err.trim().to_string() }
    })?;
    if v.get("ok").and_then(Value::as_bool) != Some(true) {
        let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("Orca rejected the request");
        return Err(msg.to_string());
    }
    Ok(v)
}

fn is_spinner(c: char) -> bool {
    matches!(c, '◐' | '◓' | '◑' | '◒' | '·') || ('\u{2800}'..='\u{28FF}').contains(&c)
}

fn clean_title(raw: &str) -> (String, bool) {
    let trimmed = raw.trim();
    let first = trimmed.chars().next();
    let busy = first.is_some_and(is_spinner);
    let title = trimmed.trim_start_matches(|c: char| !c.is_alphanumeric()).trim().to_string();
    (if title.is_empty() { trimmed.to_string() } else { title }, busy)
}

fn agent_brand(identity: &str) -> Option<String> {
    let id = identity.to_ascii_lowercase();
    let brand = if id.contains("claude") {
        "claude"
    } else if id.contains("codex") {
        "codex"
    } else if id.contains("gemini") {
        "gemini"
    } else if id.contains("opencode") {
        "opencode"
    } else if id.contains("grok") {
        "grok"
    } else if id.contains("cursor") {
        "cursor"
    } else if id.contains("copilot") {
        "copilot"
    } else {
        return None;
    };
    Some(brand.to_string())
}

fn project_names() -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Ok(v) = run(&["project", "list"]) else { return out };
    let list = v.pointer("/result/projects").and_then(Value::as_array).cloned().unwrap_or_default();
    for p in list {
        let Some(name) = p.get("displayName").and_then(Value::as_str).filter(|s| !s.is_empty()) else { continue };
        for id in p.get("sourceRepoIds").and_then(Value::as_array).into_iter().flatten() {
            if let Some(id) = id.as_str() {
                out.insert(id.to_string(), name.to_string());
            }
        }
    }
    out
}

fn repo_id(worktree_id: &str) -> &str {
    let id = worktree_id.split("::").next().unwrap_or(worktree_id);
    id.strip_prefix("folder:").unwrap_or(id)
}

fn folder_of(path: &str) -> Option<String> {
    path.trim_end_matches(['/', '\\']).rsplit(['/', '\\']).next().filter(|s| !s.is_empty()).map(str::to_string)
}

pub fn targets() -> Vec<Target> {
    let Ok(v) = run(&["terminal", "list", "--limit", "200"]) else { return vec![] };
    let names = project_names();
    let list = v.pointer("/result/terminals").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut out: Vec<Target> = list
        .into_iter()
        .filter(|t| t.get("connected").and_then(Value::as_bool) == Some(true))
        .filter(|t| t.get("writable").and_then(Value::as_bool) == Some(true))
        .filter_map(|t| {
            let agent = t.get("agentIdentity").and_then(Value::as_str).and_then(agent_brand)?;
            let handle = t.get("handle").and_then(Value::as_str)?.to_string();
            let (title, busy) = clean_title(t.get("title").and_then(Value::as_str).unwrap_or("Terminal"));
            let worktree_id = t.get("worktreeId").and_then(Value::as_str).unwrap_or_default();
            let path = t.get("worktreePath").and_then(Value::as_str).unwrap_or_default();
            let branch = t
                .get("branch")
                .and_then(Value::as_str)
                .map(|b| b.trim_start_matches("refs/heads/").to_string())
                .filter(|b| !b.is_empty());
            let project = names.get(repo_id(worktree_id)).cloned().or_else(|| folder_of(path));
            let branch = branch.filter(|b| project.as_deref() != Some(b.as_str()) && b != "main" && b != "master");
            let detail = match (project, branch) {
                (Some(p), Some(b)) => Some(format!("{p} · {b}")),
                (Some(p), None) => Some(p),
                (None, Some(b)) => Some(b),
                (None, None) => None,
            };
            Some(Target {
                id: format!("orca:{handle}"),
                host: "orca".into(),
                delivery: if agent == "claude" || agent == "codex" { "orca".into() } else { "orca-at".into() },
                agent: Some(agent),
                title,
                detail,
                handle,
                last_active_at: t.get("lastOutputAt").and_then(Value::as_i64),
                busy,
                other: false,
            })
        })
        .collect();
    out.sort_by(|a, b| b.last_active_at.cmp(&a.last_active_at));
    out
}

fn send(handle: &str, text: &str) -> Result<(), String> {
    run(&["terminal", "send", "--terminal", handle, "--text", text]).map(|_| ())
}

fn flatten(text: &str) -> String {
    text.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("  ·  ")
}

pub fn deliver(handle: &str, image_paths: &[String], text: &str, submit: bool, at_syntax: bool) -> Result<(), String> {
    let natives: Vec<String> = image_paths.iter().map(|p| p.replace('/', "\\")).collect();
    let body = if text.contains("```") { text.trim().to_string() } else { flatten(text) };
    if at_syntax {
        let refs: Vec<String> = natives.iter().map(|n| format!("@{n}")).collect();
        send(handle, &format!("{PASTE_START}{} {body}{PASTE_END}", refs.join(" ")))?;
    } else {
        for native in &natives {
            send(handle, &format!("{PASTE_START}{native}{PASTE_END}"))?;
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        if !body.is_empty() {
            std::thread::sleep(std::time::Duration::from_millis(250));
            send(handle, &format!("{PASTE_START} {body}{PASTE_END}"))?;
        }
    }
    if submit {
        std::thread::sleep(std::time::Duration::from_millis(350));
        send(handle, "\r")?;
    }
    Ok(())
}

pub fn reveal(handle: &str) {
    let _ = run(&["terminal", "switch", "--terminal", handle]);
    for w in crate::win::top_windows() {
        let exe = crate::win::process_path(w.pid).map(|p| crate::win::exe_name(&p).to_ascii_lowercase());
        if exe.as_deref() == Some("orca.exe") {
            crate::win::focus(w.hwnd);
            break;
        }
    }
}
