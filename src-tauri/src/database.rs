use crate::model::{Context, Workspace};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use std::{path::Path, time::Duration};

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
            .map_err(|e| e.to_string())?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if version > 1 {
            return Err("Database was created by a newer version of Quiet".into());
        }
        if version == 0 {
            connection.execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                 CREATE TABLE documents (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data TEXT NOT NULL);
                 CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data TEXT NOT NULL);
                 CREATE TABLE materials (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data TEXT NOT NULL);
                 CREATE INDEX documents_project ON documents(project_id);
                 CREATE INDEX tasks_project ON tasks(project_id);
                 CREATE INDEX materials_project ON materials(project_id);
                 CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 PRAGMA user_version = 1;
                 COMMIT;"
            ).map_err(|e| e.to_string())?;
        }
        Ok(Self { connection })
    }

    pub fn load(&self) -> Result<Option<Workspace>, String> {
        let context: Option<String> = self
            .connection
            .query_row("SELECT value FROM state WHERE key = 'context'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(context) = context else {
            return Ok(None);
        };
        let context: Context = serde_json::from_str(&context).map_err(|e| e.to_string())?;
        let workspace = Workspace {
            version: 1,
            projects: self.rows("SELECT data FROM projects ORDER BY rowid")?,
            documents: self.rows("SELECT data FROM documents ORDER BY rowid")?,
            tasks: self.rows("SELECT data FROM tasks ORDER BY rowid")?,
            materials: self.rows("SELECT data FROM materials ORDER BY rowid")?,
            context,
        };
        workspace.validate()?;
        Ok(Some(workspace))
    }

    fn rows<T: DeserializeOwned>(&self, sql: &str) -> Result<Vec<T>, String> {
        let mut statement = self.connection.prepare(sql).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|row| {
            let data = row.map_err(|e| e.to_string())?;
            serde_json::from_str(&data).map_err(|e| e.to_string())
        })
        .collect()
    }

    pub fn save(&mut self, workspace: &Workspace) -> Result<(), String> {
        workspace.validate()?;
        let transaction = self.connection.transaction().map_err(|e| e.to_string())?;
        // Delete only removed records. Unchanged attachment data must not be rewritten
        // on every document keystroke or navigation update.
        for (table, ids) in [
            (
                "documents",
                workspace
                    .documents
                    .iter()
                    .map(|d| &d.id)
                    .collect::<Vec<_>>(),
            ),
            (
                "tasks",
                workspace.tasks.iter().map(|t| &t.id).collect::<Vec<_>>(),
            ),
            (
                "materials",
                workspace
                    .materials
                    .iter()
                    .map(|m| &m.id)
                    .collect::<Vec<_>>(),
            ),
            (
                "projects",
                workspace.projects.iter().map(|p| &p.id).collect::<Vec<_>>(),
            ),
        ] {
            transaction
                .execute(
                    &format!(
                        "DELETE FROM {table} WHERE id NOT IN (SELECT value FROM json_each(?1))"
                    ),
                    params![json(&ids)?],
                )
                .map_err(|e| e.to_string())?;
        }
        for project in &workspace.projects {
            transaction
                .execute(
                    "INSERT INTO projects (id, data) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE data <> excluded.data",
                    params![project.id, json(project)?],
                )
                .map_err(|e| e.to_string())?;
        }
        for doc in &workspace.documents {
            transaction
                .execute(
                    "INSERT INTO documents (id, project_id, data) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, data = excluded.data WHERE data <> excluded.data",
                    params![doc.id, doc.project_id, json(doc)?],
                )
                .map_err(|e| e.to_string())?;
        }
        for task in &workspace.tasks {
            transaction
                .execute(
                    "INSERT INTO tasks (id, project_id, data) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, data = excluded.data WHERE data <> excluded.data",
                    params![task.id, task.project_id, json(task)?],
                )
                .map_err(|e| e.to_string())?;
        }
        for material in &workspace.materials {
            transaction
                .execute(
                    "INSERT INTO materials (id, project_id, data) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, data = excluded.data WHERE data <> excluded.data",
                    params![material.id, material.project_id, json(material)?],
                )
                .map_err(|e| e.to_string())?;
        }
        transaction.execute("INSERT INTO state (key, value) VALUES ('context', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value <> excluded.value", params![json(&workspace.context)?]).map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())
    }
}

fn json(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Document, Project, Tab, Task, Tone};

    fn fixture() -> Workspace {
        Workspace {
            version: 1,
            projects: vec![Project {
                id: "p1".into(),
                name: "Дослідження".into(),
                description: "Local first".into(),
                tone: Tone::Green,
                created_at: "2026-11-07T10:00:00Z".into(),
            }],
            documents: vec![Document {
                id: "d1".into(),
                project_id: "p1".into(),
                title: "Рішення".into(),
                content: "# План\n\nRust + SQLite".into(),
                updated_at: "2026-11-07T10:00:00Z".into(),
            }],
            tasks: vec![Task {
                id: "t1".into(),
                project_id: "p1".into(),
                title: "Перевірити збереження".into(),
                done: true,
                created_at: "2026-11-07T10:00:00Z".into(),
            }],
            materials: vec![],
            context: Context {
                project_id: Some("p1".into()),
                tab: Tab::Documents,
                document_id: Some("d1".into()),
            },
        }
    }

    #[test]
    fn persists_full_workspace_and_context_after_reopen() {
        let path = std::env::temp_dir().join(format!(
            "quiet-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let expected = fixture();
        {
            let mut db = Database::open(&path).unwrap();
            assert_eq!(db.load().unwrap(), None);
            db.save(&expected).unwrap();
        }
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.load().unwrap(), Some(expected));
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn invalid_write_keeps_previous_workspace() {
        let mut db = Database::open(":memory:").unwrap();
        let original = fixture();
        db.save(&original).unwrap();
        let mut invalid = original.clone();
        invalid.documents[0].project_id = "missing".into();
        assert!(db.save(&invalid).is_err());
        assert_eq!(db.load().unwrap(), Some(original));
    }

    #[test]
    fn transaction_failure_rolls_back_all_tables() {
        let mut db = Database::open(":memory:").unwrap();
        let original = fixture();
        db.save(&original).unwrap();
        db.connection.execute_batch("CREATE TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'disk simulation'); END;").unwrap();
        let mut changed = original.clone();
        changed.projects[0].name = "Changed".into();
        assert!(db.save(&changed).is_err());
        assert_eq!(db.load().unwrap(), Some(original));
    }

    #[test]
    fn deletion_removes_project_content_and_allows_empty_workspace() {
        let mut db = Database::open(":memory:").unwrap();
        db.save(&fixture()).unwrap();
        let empty = Workspace {
            version: 1,
            projects: vec![],
            documents: vec![],
            tasks: vec![],
            materials: vec![],
            context: Context {
                project_id: None,
                tab: Tab::Overview,
                document_id: None,
            },
        };
        db.save(&empty).unwrap();
        assert_eq!(db.load().unwrap(), Some(empty));
    }

    #[test]
    fn duplicate_ids_and_cross_project_context_are_rejected() {
        let mut workspace = fixture();
        workspace.tasks[0].id = "d1".into();
        assert!(workspace.validate().is_err());
        let mut workspace = fixture();
        workspace.context.project_id = None;
        assert!(workspace.validate().is_err());
    }

    #[test]
    fn saving_unchanged_workspace_does_not_rewrite_rows() {
        let mut db = Database::open(":memory:").unwrap();
        let workspace = fixture();
        db.save(&workspace).unwrap();
        let before = db.connection.total_changes();
        db.save(&workspace).unwrap();
        assert_eq!(db.connection.total_changes(), before);
    }
}
