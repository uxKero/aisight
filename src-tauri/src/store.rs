use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::{Capture, SourceContext};

const HISTORY_LIMIT: usize = 80;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

static DIR: RwLock<Option<PathBuf>> = RwLock::new(None);

pub fn set_dir(path: PathBuf) {
    *DIR.write().unwrap() = Some(path);
}

pub fn dir() -> PathBuf {
    let d = DIR.read().unwrap().clone().unwrap_or_else(crate::settings::default_folder);
    let _ = fs::create_dir_all(&d);
    d
}

fn slash(p: PathBuf) -> String {
    p.to_string_lossy().replace('\\', "/")
}

pub fn save_capture(rgba: &[u8], width: u32, height: u32, source: SourceContext) -> Result<Capture, String> {
    let created_at = now_ms();
    let id = format!("{created_at}");
    let path = dir().join(format!("{id}.png"));
    image::save_buffer(&path, rgba, width, height, image::ExtendedColorType::Rgba8).map_err(|e| e.to_string())?;
    let capture = Capture {
        id,
        path: slash(path),
        width,
        height,
        created_at,
        source,
        marks: vec![],
        message: String::new(),
        sent_to: vec![],
    };
    save_record(&capture)?;
    Ok(capture)
}

pub fn save_render(capture_id: &str, png: &[u8], kind: &str) -> Result<String, String> {
    let safe: String = capture_id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let kind = if kind == "share" { "compartir" } else { "marcas" };
    let path = dir().join(format!("{safe}-{kind}.png"));
    fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(slash(path))
}

pub fn save_record(capture: &Capture) -> Result<(), String> {
    let safe: String = capture.id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let json = serde_json::to_string_pretty(capture).map_err(|e| e.to_string())?;
    fs::write(dir().join(format!("{safe}.json")), json).map_err(|e| e.to_string())
}

pub fn history() -> Vec<Capture> {
    let mut items: Vec<Capture> = fs::read_dir(dir())
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str::<Capture>(&s).ok())
        .collect();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    items.truncate(HISTORY_LIMIT);
    items
}
