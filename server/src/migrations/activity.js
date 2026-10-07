export async function activityMigration(db){
 await db.query('ALTER TABLE users ADD COLUMN activity_started TEXT');
 await db.query("ALTER TABLE upload_records ADD COLUMN mimetype TEXT DEFAULT ''");
 await db.query('ALTER TABLE upload_records ADD COLUMN size_bytes BIGINT DEFAULT 0');
}
