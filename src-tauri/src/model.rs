use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: String,
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub delivery: String,
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_active_at: Option<i64>,
    #[serde(default)]
    pub busy: bool,
    #[serde(default)]
    pub other: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Mark {
    pub id: String,
    pub n: u32,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub note: String,
    #[serde(default)]
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SentRecord {
    pub target_title: String,
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub at: i64,
    pub submitted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Capture {
    pub id: String,
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub created_at: i64,
    pub source: SourceContext,
    pub marks: Vec<Mark>,
    pub message: String,
    pub sent_to: Vec<SentRecord>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeliverRequest {
    pub targets: Vec<Target>,
    pub image_paths: Vec<String>,
    pub text: String,
    pub submit: bool,
}
