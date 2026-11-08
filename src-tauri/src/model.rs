use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tone: Tone,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    Green,
    Blue,
    Orange,
    Violet,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub done: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub kind: MaterialKind,
    pub url: String,
    pub size: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MaterialKind {
    Link,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub project_id: Option<String>,
    pub tab: Tab,
    pub document_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Tab {
    Overview,
    Documents,
    Tasks,
    Materials,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Workspace {
    pub version: u32,
    pub projects: Vec<Project>,
    pub documents: Vec<Document>,
    pub tasks: Vec<Task>,
    pub materials: Vec<Material>,
    pub context: Context,
}

impl Workspace {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported workspace version".into());
        }
        let mut ids = HashSet::new();
        for id in self
            .projects
            .iter()
            .map(|p| &p.id)
            .chain(self.documents.iter().map(|d| &d.id))
            .chain(self.tasks.iter().map(|t| &t.id))
            .chain(self.materials.iter().map(|m| &m.id))
        {
            if id.is_empty() || !ids.insert(id) {
                return Err("Empty or duplicate ID".into());
            }
        }
        if ids.len() > 50_000 {
            return Err("Too many workspace records".into());
        }
        let projects: HashSet<_> = self.projects.iter().map(|p| &p.id).collect();
        for (project_id, title) in self
            .documents
            .iter()
            .map(|d| (&d.project_id, &d.title))
            .chain(self.tasks.iter().map(|t| (&t.project_id, &t.title)))
            .chain(self.materials.iter().map(|m| (&m.project_id, &m.title)))
        {
            if !projects.contains(project_id) || title.trim().is_empty() {
                return Err("Orphan record or empty title".into());
            }
        }
        if self.projects.iter().any(|p| p.name.trim().is_empty()) {
            return Err("Project name cannot be empty".into());
        }
        if let Some(id) = &self.context.project_id {
            if !projects.contains(id) {
                return Err("Selected project does not exist".into());
            }
        }
        if let Some(id) = &self.context.document_id {
            if !self
                .documents
                .iter()
                .any(|d| &d.id == id && Some(&d.project_id) == self.context.project_id.as_ref())
            {
                return Err("Selected document does not belong to selected project".into());
            }
        }
        for material in &self.materials {
            match material.kind {
                MaterialKind::Link
                    if !material.url.starts_with("https://")
                        && !material.url.starts_with("http://") =>
                {
                    return Err("Unsupported link protocol".into())
                }
                MaterialKind::File
                    if !material
                        .url
                        .starts_with("data:application/octet-stream;base64,")
                        || material.size > 5 * 1024 * 1024 =>
                {
                    return Err("Unsupported attachment".into())
                }
                _ => {}
            }
        }
        Ok(())
    }
}
