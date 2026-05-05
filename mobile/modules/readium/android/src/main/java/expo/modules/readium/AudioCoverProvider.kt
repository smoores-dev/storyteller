package expo.modules.readium

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.bumptech.glide.Glide
import com.bumptech.glide.load.model.GlideUrl

// Serves audio cover art to Android Auto by reading from the expo-image Glide
// disk cache that listBooksListener populates on every server sync. Missing
// entries return null and Android Auto renders a placeholder.
class AudioCoverProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
        val ctx = context ?: return null
        val bookUuid = uri.lastPathSegment?.takeIf { it.isNotEmpty() } ?: return null
        val server = StorytellerDatabaseHelper(ctx).getServerInfoForBook(bookUuid) ?: return null
        val url = "${server.baseUrl.trimEnd('/')}/api/v2/books/$bookUuid/cover?audio=true&h=232&w=232"
        return try {
            val file = Glide.with(ctx.applicationContext)
                .asFile()
                .load(GlideUrl(url))
                .onlyRetrieveFromCache(true)
                .submit()
                .get()
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        } catch (_: Exception) {
            null
        }
    }

    // Read-only provider. All other ContentProvider hooks are unused.
    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? = null

    override fun getType(uri: Uri): String = "image/jpeg"
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0
}
