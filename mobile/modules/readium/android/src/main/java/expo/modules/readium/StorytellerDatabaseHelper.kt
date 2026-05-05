package expo.modules.readium

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

data class BookEntry(
    val uuid: String,
    val title: String,
    val author: String?,
    val coverUri: Uri?,
    val format: String,
    val manifestJson: String?,
)

class StorytellerDatabaseHelper(private val context: Context) {
    private val dbPath: String = context.getDatabasePath(DB_NAME).path

    // expo-file-system registers this FileProvider in its AndroidManifest with
    // <files-path path="."/>, so the whole of filesDir is addressable.
    private val fileProviderAuthority: String = "${context.packageName}.FileSystemFileProvider"

    fun getCurrentlyReading(): List<BookEntry> = readOnlyList { db ->
        db.rawQuery(
            """
            SELECT $BOOK_COLS
            FROM book b
            $FORMAT_JOINS
            INNER JOIN book_to_status b2s ON b2s.book_uuid = b.uuid
            INNER JOIN status s ON s.uuid = b2s.status_uuid AND s.name = 'Reading'
            LEFT JOIN position p ON p.book_uuid = b.uuid
            WHERE a.uuid IS NOT NULL OR r.uuid IS NOT NULL
            ORDER BY COALESCE(p.timestamp, 0) DESC
            """.trimIndent(),
            null,
        ).use { it.collectBooks(db) }
    }

    // Mirrors filterNextUp() in mobile/app/(root)/shelf/[type].tsx: for each
    // series, returns the highest-position non-Read book whenever there is a
    // Read book earlier in that series.
    fun getNextUp(): List<BookEntry> = readOnlyList { db ->
        db.rawQuery(
            """
            WITH latest_read AS (
                SELECT
                    bts.series_uuid,
                    MAX(bts.position) AS last_read_position,
                    MAX(p.timestamp) AS last_read_ts
                FROM book_to_series bts
                INNER JOIN book_to_status b2s ON b2s.book_uuid = bts.book_uuid
                INNER JOIN status s ON s.uuid = b2s.status_uuid AND s.name = 'Read'
                LEFT JOIN position p ON p.book_uuid = bts.book_uuid
                GROUP BY bts.series_uuid
            ),
            latest_unread AS (
                SELECT
                    lr.series_uuid,
                    MAX(bts.position) AS last_unread_position
                FROM latest_read lr
                INNER JOIN book_to_series bts
                    ON bts.series_uuid = lr.series_uuid
                    AND bts.position > lr.last_read_position
                LEFT JOIN book_to_status b2s ON b2s.book_uuid = bts.book_uuid
                LEFT JOIN status s ON s.uuid = b2s.status_uuid
                WHERE s.name IS NULL OR s.name != 'Read'
                GROUP BY lr.series_uuid
            )
            SELECT DISTINCT $BOOK_COLS
            FROM latest_unread lu
            INNER JOIN latest_read lr ON lr.series_uuid = lu.series_uuid
            INNER JOIN book_to_series bts
                ON bts.series_uuid = lu.series_uuid
                AND bts.position = lu.last_unread_position
            INNER JOIN book b ON b.uuid = bts.book_uuid
            $FORMAT_JOINS
            WHERE a.uuid IS NOT NULL OR r.uuid IS NOT NULL
            ORDER BY lr.last_read_ts DESC
            """.trimIndent(),
            null,
        ).use { it.collectBooks(db) }
    }

    fun getStartReading(limit: Int = START_READING_LIMIT): List<BookEntry> = readOnlyList { db ->
        // Cap the "To read" list — users may have hundreds queued, but only
        // the most recent additions are useful on a Home shelf.
        db.rawQuery(
            """
            SELECT $BOOK_COLS
            FROM book b
            $FORMAT_JOINS
            INNER JOIN book_to_status b2s ON b2s.book_uuid = b.uuid
            INNER JOIN status s ON s.uuid = b2s.status_uuid AND s.name = 'To read'
            WHERE a.uuid IS NOT NULL OR r.uuid IS NOT NULL
            ORDER BY b.created_at DESC
            LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString()),
        ).use { it.collectBooks(db) }
    }

    fun getRecentlyAdded(limit: Int = RECENT_ADDED_LIMIT): List<BookEntry> = readOnlyList { db ->
        db.rawQuery(
            """
            SELECT $BOOK_COLS
            FROM book b
            $FORMAT_JOINS
            WHERE a.uuid IS NOT NULL OR r.uuid IS NOT NULL
            ORDER BY b.created_at DESC
            LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString()),
        ).use { it.collectBooks(db) }
    }

    fun getDownloads(): List<BookEntry> = readOnlyList { db ->
        db.rawQuery(
            """
            SELECT $BOOK_COLS
            FROM book b
            $FORMAT_JOINS
            WHERE a.uuid IS NOT NULL OR r.uuid IS NOT NULL
            ORDER BY b.title COLLATE NOCASE ASC
            """.trimIndent(),
            null,
        ).use { it.collectBooks(db) }
    }

    fun getBook(uuid: String, format: String): BookEntry? = readOnlyOrNull { db ->
        val sql = when (format) {
            "audiobook" -> """
                SELECT $BOOK_COLS
                FROM book b
                $FORMAT_JOINS
                WHERE b.uuid = ? AND a.uuid IS NOT NULL
                LIMIT 1
            """.trimIndent()
            "readaloud" -> """
                SELECT $BOOK_COLS
                FROM book b
                $FORMAT_JOINS
                WHERE b.uuid = ? AND r.uuid IS NOT NULL
                LIMIT 1
            """.trimIndent()
            else -> return@readOnlyOrNull null
        }
        db.rawQuery(sql, arrayOf(uuid)).use { it.collectBooks(db).firstOrNull() }
    }

    fun getPositionLocator(bookUuid: String): String? = readOnlyOrNull { db ->
        db.rawQuery(
            "SELECT locator FROM position WHERE book_uuid = ? LIMIT 1",
            arrayOf(bookUuid),
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getStringOrNull(0) else null
        }
    }

    // Clips JSON can run into multiple megabytes; simpleQueryForString bypasses
    // the 2 MB CursorWindow limit that rawQuery hits for large cells.
    fun getReadaloudClips(bookUuid: String): String? = readOnlyOrNull { db ->
        db.compileStatement(
            "SELECT clips FROM readaloud WHERE book_uuid = ? LIMIT 1"
        ).use { stmt ->
            stmt.bindString(1, bookUuid)
            runCatching { stmt.simpleQueryForString() }.getOrNull()
        }
    }

    data class ServerInfo(val uuid: String, val baseUrl: String)

    fun getServerInfoForBook(bookUuid: String): ServerInfo? = readOnlyOrNull { db ->
        db.rawQuery(
            """
            SELECT s.uuid, s.base_url
            FROM book b
            INNER JOIN server s ON s.uuid = b.server_uuid
            WHERE b.uuid = ?
            LIMIT 1
            """.trimIndent(),
            arrayOf(bookUuid),
        ).use { cursor ->
            if (cursor.moveToFirst()) ServerInfo(cursor.getString(0), cursor.getString(1)) else null
        }
    }

    private fun Cursor.collectBooks(db: SQLiteDatabase): List<BookEntry> {
        // Column order mirrors BOOK_COLS below.
        val entries = mutableListOf<BookEntry>()
        while (moveToNext()) {
            val uuid = getString(0)
            entries.add(
                BookEntry(
                    uuid = uuid,
                    title = getString(1),
                    author = fetchPrimaryAuthor(db, uuid),
                    coverUri = resolveCoverUri(getStringOrNull(2)),
                    format = getString(3),
                    manifestJson = getStringOrNull(4),
                ),
            )
        }
        return entries
    }

    private fun fetchPrimaryAuthor(db: SQLiteDatabase, bookUuid: String): String? {
        return db.rawQuery(
            """
            SELECT c.name
            FROM creator c
            INNER JOIN book_to_creator btc ON btc.creator_uuid = c.uuid
            WHERE btc.book_uuid = ? AND btc.role = 'aut'
            LIMIT 3
            """.trimIndent(),
            arrayOf(bookUuid),
        ).use { cursor ->
            val names = mutableListOf<String>()
            while (cursor.moveToNext()) {
                cursor.getStringOrNull(0)?.let { names.add(it) }
            }
            if (names.isEmpty()) null else names.joinToString(", ")
        }
    }

    private fun resolveCoverUri(relativePath: String?): Uri? {
        if (relativePath.isNullOrBlank()) return null
        val file = File(context.filesDir, relativePath)
        if (!file.exists()) return null
        return try {
            FileProvider.getUriForFile(context, fileProviderAuthority, file)
        } catch (e: IllegalArgumentException) {
            // Fall back to file:// so browsers can at least attempt the cover. Most
            // automotive controllers will silently skip a non-content URI.
            Uri.fromFile(file)
        }
    }

    // Opened per-call so op-sqlite's primary connection isn't fighting over the
    // file handle across Android Auto callback lifetimes.
    private inline fun <T> readOnlyList(block: (SQLiteDatabase) -> List<T>): List<T> =
        try {
            SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use(block)
        } catch (e: SQLiteException) {
            emptyList()
        }

    private inline fun <T> readOnlyOrNull(block: (SQLiteDatabase) -> T?): T? =
        try {
            SQLiteDatabase.openDatabase(dbPath, null, SQLiteDatabase.OPEN_READONLY).use(block)
        } catch (e: SQLiteException) {
            null
        }

    private fun Cursor.getStringOrNull(columnIndex: Int): String? =
        if (isNull(columnIndex)) null else getString(columnIndex)

    companion object {
        private const val DB_NAME = "storyteller.db"
        private const val RECENT_ADDED_LIMIT = 50
        private const val START_READING_LIMIT = 20

        // Shared column projection + joins. Column order matches collectBooks().
        // All queries filter to downloaded via `a.uuid IS NOT NULL OR r.uuid IS NOT NULL`.
        private const val BOOK_COLS = """
            b.uuid, b.title, b.audiobook_cover_url,
            CASE WHEN a.uuid IS NOT NULL THEN 'audiobook' ELSE 'readaloud' END AS fmt,
            CASE WHEN a.uuid IS NOT NULL THEN a.manifest ELSE r.audio_manifest END AS manifest
        """

        private const val FORMAT_JOINS = """
            LEFT JOIN audiobook a ON a.book_uuid = b.uuid AND a.download_status = 'DOWNLOADED'
            LEFT JOIN readaloud r ON r.book_uuid = b.uuid AND r.download_status = 'DOWNLOADED'
        """
    }
}
