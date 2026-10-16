use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub language: String,
    pub shortcut: String,
    pub primary: String,
    pub follow_on_attach: bool,
    pub context_app: bool,
    pub context_title: bool,
    pub context_url: bool,
    pub folder: String,
    pub autostart: bool,
    pub templates: Vec<String>,
    pub capture_tool: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            language: "en".into(),
            shortcut: "Alt+Shift+S".into(),
            primary: "attach".into(),
            follow_on_attach: true,
            context_app: true,
            context_title: true,
            context_url: true,
            folder: default_folder().to_string_lossy().replace('\\', "/"),
            autostart: false,
            capture_tool: "aisight".into(),
            templates: vec![
                "Fix what I marked".into(),
                "What's wrong here?".into(),
                "Make it look exactly like this".into(),
                "This error shows up when I do this:".into(),
            ],
        }
    }
}

pub fn default_folder() -> PathBuf {
    let base = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    base.join("Pictures").join("AISight")
}

fn file() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("com.uxkero.aisight");
    let _ = fs::create_dir_all(&dir);
    dir.join("settings.json")
}

pub fn load() -> Settings {
    fs::read_to_string(file()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

pub fn save(s: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(file(), json).map_err(|e| e.to_string())
}

pub fn set_autostart(on: bool) -> Result<(), String> {
    let mut cmd = Command::new("reg");
    if on {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        cmd.args(["add", RUN_KEY, "/v", "AIsight", "/t", "REG_SZ", "/d", &format!("\"{}\"", exe.display()), "/f"]);
    } else {
        cmd.args(["delete", RUN_KEY, "/v", "AIsight", "/f"]);
    }
    let out = cmd.creation_flags(CREATE_NO_WINDOW).output().map_err(|e| e.to_string())?;
    if on && !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}
