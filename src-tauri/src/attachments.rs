use crate::database::Database;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
const MAX_SIZE: usize = 5 * 1024 * 1024;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAttachment {
    pub hash: String,
    pub size: usize,
    pub stored_size: usize,
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
impl Database {
    pub fn store_attachment(&self, bytes: &[u8]) -> Result<StoredAttachment, String> {
        if bytes.len() > MAX_SIZE {
            return Err("Attachment exceeds 5 MB".into());
        }
        let hash = format!("{:x}", Sha256::digest(bytes));
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(bytes).map_err(|e| e.to_string())?;
        let compressed = encoder.finish().map_err(|e| e.to_string())?;
        let (codec, packed) = if compressed.len() < bytes.len() {
            ("gzip", compressed.as_slice())
        } else {
            ("raw", bytes)
        };
        self.connection.execute("INSERT INTO attachments (hash,codec,original_size,bytes,touched) VALUES (?1,?2,?3,?4,unixepoch()) ON CONFLICT(hash) DO UPDATE SET codec=excluded.codec, original_size=excluded.original_size, bytes=excluded.bytes, touched=unixepoch()", params![hash,codec,bytes.len(),packed]).map_err(|e| e.to_string())?;
        let stored_size: usize = self
            .connection
            .query_row(
                "SELECT length(bytes) FROM attachments WHERE hash=?1",
                [&hash],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(StoredAttachment {
            hash,
            size: bytes.len(),
            stored_size,
        })
    }
    pub fn load_attachment(&self, hash: &str) -> Result<Vec<u8>, String> {
        if !valid_hash(hash) {
            return Err("Invalid attachment identifier".into());
        }
        let record: Option<(String, usize, Vec<u8>)> = self
            .connection
            .query_row(
                "SELECT codec,original_size,bytes FROM attachments WHERE hash=?1",
                [hash],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let (codec, size, packed) = record.ok_or("Attachment is missing")?;
        if size > MAX_SIZE {
            return Err("Attachment exceeds 5 MB".into());
        }
        let bytes = match codec.as_str() {
            "gzip" => {
                let mut bytes = Vec::new();
                GzDecoder::new(packed.as_slice())
                    .take((MAX_SIZE + 1) as u64)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                bytes
            }
            "raw" => packed,
            _ => return Err("Unsupported attachment encoding".into()),
        };
        if bytes.len() != size || format!("{:x}", Sha256::digest(&bytes)) != hash {
            return Err("Attachment integrity check failed".into());
        }
        Ok(bytes)
    }
    pub fn prune_attachments(&self) -> Result<(), String> {
        // Grace period protects a freshly stored file before its metadata is committed.
        self.connection.execute("DELETE FROM attachments WHERE touched < unixepoch()-86400 AND hash NOT IN (SELECT substr(json_extract(data,'$.url'),12) FROM materials WHERE json_extract(data,'$.kind')='file' AND json_extract(data,'$.url') LIKE 'attachment:%')", []).map_err(|e| e.to_string())?;
        let free_pages: u64 = self
            .connection
            .query_row("PRAGMA freelist_count", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if free_pages >= 64 {
            self.connection
                .execute_batch("VACUUM;")
                .map_err(|e| e.to_string())?;
        }
        self.connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compresses_deduplicates_and_recovers_exact_bytes() {
        let db = Database::open(":memory:").unwrap();
        let bytes = b"repeated text and Unicode \xe2\x9c\x93\n".repeat(1000);
        let stored = db.store_attachment(&bytes).unwrap();
        assert!(stored.stored_size < bytes.len() / 5);
        assert_eq!(db.load_attachment(&stored.hash).unwrap(), bytes);
        assert_eq!(db.store_attachment(&bytes).unwrap().hash, stored.hash);
        assert_eq!(
            db.connection
                .query_row("SELECT count(*) FROM attachments", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        db.prune_attachments().unwrap();
        assert_eq!(db.load_attachment(&stored.hash).unwrap(), bytes);
        db.connection
            .execute("UPDATE attachments SET touched=0", [])
            .unwrap();
        db.prune_attachments().unwrap();
        assert!(db.load_attachment(&stored.hash).is_err());
    }
    #[test]
    fn preserves_empty_binary_and_rejects_corruption_and_oversize() {
        let db = Database::open(":memory:").unwrap();
        for bytes in [Vec::new(), (0..=255).collect::<Vec<u8>>()] {
            let stored = db.store_attachment(&bytes).unwrap();
            assert_eq!(db.load_attachment(&stored.hash).unwrap(), bytes);
            db.connection
                .execute(
                    "UPDATE attachments SET original_size=999 WHERE hash=?1",
                    [&stored.hash],
                )
                .unwrap();
            assert!(db.load_attachment(&stored.hash).is_err());
        }
        assert!(db.store_attachment(&vec![0; MAX_SIZE + 1]).is_err());
        assert!(db.load_attachment("../../file").is_err());
    }
}

#[cfg(test)]
mod reference_tests {
    use super::*;
    use crate::model::Workspace;
    use serde_json::json;
    #[test]
    fn references_protect_shared_files_and_missing_binaries_cannot_be_saved() {
        let mut db = Database::open(":memory:").unwrap();
        let bytes = b"Shared attachment";
        let stored = db.store_attachment(bytes).unwrap();
        let mut data: Workspace=serde_json::from_value(json!({"version":1,"projects":[{"id":"p","name":"Project","description":"","tone":"green","createdAt":"2026-11-08T00:00:00Z"}],"documents":[],"tasks":[],"materials":[{"id":"a","projectId":"p","title":"File","kind":"file","url":format!("attachment:{}",stored.hash),"size":bytes.len(),"createdAt":"2026-11-08T00:00:00Z"}],"context":{"projectId":"p","tab":"materials","documentId":null}})).unwrap();
        db.save(&data).unwrap();
        db.connection
            .execute("UPDATE attachments SET touched=0", [])
            .unwrap();
        db.prune_attachments().unwrap();
        assert_eq!(db.load_attachment(&stored.hash).unwrap(), bytes);
        let removed = data.materials.remove(0);
        db.save(&data).unwrap();
        // In-session Undo still has the binary; no eager GC on deletion.
        assert_eq!(db.load_attachment(&stored.hash).unwrap(), bytes);
        data.materials.push(removed);
        db.save(&data).unwrap();
        data.materials[0].size += 1;
        assert!(db.save(&data).is_err());
        assert_eq!(
            db.load().unwrap().unwrap().materials[0].size,
            bytes.len() as u64
        );
        data.materials.clear();
        db.save(&data).unwrap();
        db.prune_attachments().unwrap();
        assert!(db.load_attachment(&stored.hash).is_err());
    }
    #[test]
    fn schema_one_migration_preserves_old_workspace() {
        let path = std::env::temp_dir().join(format!("quiet-migrate-{}.db", std::process::id()));
        {
            let db = Database::open(&path).unwrap();
            db.connection.execute_batch("DROP TABLE attachments; PRAGMA user_version=1; INSERT INTO state(key,value) VALUES('context','{\"projectId\":null,\"tab\":\"overview\",\"documentId\":null}');").unwrap();
        }
        {
            let db = Database::open(&path).unwrap();
            assert!(db.load().unwrap().unwrap().projects.is_empty());
            assert_eq!(
                db.connection
                    .query_row("PRAGMA user_version", [], |r| r.get::<_, u64>(0))
                    .unwrap(),
                2
            );
            let stored = db.store_attachment(b"After upgrade").unwrap();
            assert_eq!(db.load_attachment(&stored.hash).unwrap(), b"After upgrade");
        }
        std::fs::remove_file(path).unwrap();
    }
}
