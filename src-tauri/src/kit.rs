use crate::model::{Note, Tab};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub content: String,
    pub language: String,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Column {
    pub id: String,
    pub title: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Row {
    pub id: String,
    pub cells: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sheet {
    pub id: String,
    pub title: String,
    pub columns: Vec<Column>,
    pub rows: Vec<Row>,
    pub created_at: String,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_tab: Option<Tab>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_view: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub sort: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub order: BTreeMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub active: BTreeMap<String, String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProjectKit {
    pub enabled: Vec<String>,
    pub notes: Vec<Note>,
    pub snippets: Vec<Snippet>,
    pub tables: Vec<Sheet>,
    pub preferences: Preferences,
}
const MODULES: [&str; 6] = [
    "tasks",
    "documents",
    "materials",
    "notes",
    "snippets",
    "tables",
];
impl ProjectKit {
    pub fn validate<'a>(&'a self, ids: &mut HashSet<&'a String>) -> Result<(), String> {
        let fail = || Err("Invalid project modules".to_string());
        if self.enabled.iter().any(|m| !MODULES.contains(&m.as_str()))
            || self.enabled.iter().collect::<HashSet<_>>().len() != self.enabled.len()
        {
            return fail();
        }
        if self
            .notes
            .iter()
            .any(|note| note.format.as_deref().is_some_and(|f| f != "html"))
        {
            return fail();
        }
        for list_len in [self.notes.len(), self.snippets.len(), self.tables.len()] {
            if list_len > 5000 {
                return fail();
            }
        }
        for (id, title, created, updated) in self
            .notes
            .iter()
            .map(|r| (&r.id, &r.title, &r.created_at, &r.updated_at))
            .chain(
                self.snippets
                    .iter()
                    .map(|r| (&r.id, &r.title, &r.created_at, &r.updated_at)),
            )
            .chain(
                self.tables
                    .iter()
                    .map(|r| (&r.id, &r.title, &r.created_at, &r.updated_at)),
            )
        {
            if id.is_empty()
                || !ids.insert(id)
                || ids.len() > 50000
                || title.trim().is_empty()
                || created.is_empty()
                || updated.is_empty()
            {
                return fail();
            }
        }
        if self
            .notes
            .iter()
            .any(|r| r.content.chars().count() > 1_000_000)
            || self
                .snippets
                .iter()
                .any(|r| r.content.chars().count() > 1_000_000 || r.language.len() > 40)
        {
            return fail();
        }
        for table in &self.tables {
            if table.columns.is_empty() || table.columns.len() > 12 || table.rows.len() > 500 {
                return fail();
            }
            let mut nested = HashSet::new();
            for col in &table.columns {
                if col.id.is_empty() || !nested.insert(&col.id) || col.title.trim().is_empty() {
                    return fail();
                }
            }
            for row in &table.rows {
                if row.id.is_empty()
                    || !nested.insert(&row.id)
                    || row.cells.len() != table.columns.len()
                    || row.cells.iter().any(|c| c.chars().count() > 10000)
                {
                    return fail();
                }
            }
        }
        let p = &self.preferences;
        if p.task_view
            .as_ref()
            .is_some_and(|v| v != "list" && v != "board")
            || p.sort.iter().any(|(k, v)| {
                !MODULES.contains(&k.as_str())
                    || !["manual", "name", "newest"].contains(&v.as_str())
            })
            || p.order
                .iter()
                .any(|(k, v)| !MODULES.contains(&k.as_str()) || v.len() > 50000)
            || p.active.keys().any(|k| !MODULES.contains(&k.as_str()))
        {
            return fail();
        }
        Ok(())
    }
}
