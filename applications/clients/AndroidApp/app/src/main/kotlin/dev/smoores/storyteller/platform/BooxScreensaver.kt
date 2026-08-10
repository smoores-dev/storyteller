package dev.smoores.storyteller.platform

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Point
import android.graphics.Rect
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.MediaStore
import android.util.Log
import android.util.Size
import android.view.WindowManager
import java.io.File

// Onyx firmware applies a new sleep screensaver in response to this broadcast;
// same mechanism as the official SDK's ScreenResourceManager.
internal object BooxScreensaver {
    private const val TAG = "BooxScreensaver"
    private const val ACTION = "onyx.action.SCREENSAVER"
    private const val TYPE_SCREENSAVER = 16
    private const val FILE_PREFIX = "storyteller-sleep-"

    @Volatile
    private var lastSetKey: String? = null

    // The standby screen always draws in the panel's natural portrait
    // orientation, regardless of the app's current rotation.
    fun displaySize(context: Context): Size {
        val windowManager = context.getSystemService(WindowManager::class.java)
        val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = windowManager.maximumWindowMetrics.bounds
            Size(bounds.width(), bounds.height())
        } else {
            val point = Point()
            @Suppress("DEPRECATION")
            windowManager.defaultDisplay.getRealSize(point)
            Size(point.x, point.y)
        }
        return Size(minOf(raw.width, raw.height), maxOf(raw.width, raw.height))
    }

    fun setToCover(context: Context, cover: Bitmap, key: String) {
        if (!EinkDisplay.isBoox) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        if (key == lastSetKey) return
        // Setting the image while the standby screen is already drawn blanks
        // it to white instead of updating it.
        if (context.getSystemService(PowerManager::class.java)?.isInteractive == false) {
            Log.i(TAG, "screen off, skipping screensaver update")
            return
        }
        runCatching {
            // The image goes through a MediaStore insert with a fresh name on
            // every update. The com.onyx process silently fails to read files
            // an app creates by raw path (scoped-storage ownership), and its
            // asynchronous copy can race a rewrite of a reused name; a newly
            // published entry per update avoids both.
            val fileName = "$FILE_PREFIX${System.currentTimeMillis()}.png"
            val resolver = context.contentResolver
            val uri = resolver.insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, "image/png")
                },
            ) ?: error("MediaStore insert failed")
            renderFullscreen(cover, displaySize(context)).let { bitmap ->
                (resolver.openOutputStream(uri) ?: error("openOutputStream failed: $uri"))
                    .use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) }
                bitmap.recycle()
            }
            deleteOrphans(context, keepId = ContentUris.parseId(uri))
            @Suppress("DEPRECATION")
            val path = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                fileName,
            ).absolutePath
            context.sendBroadcast(
                Intent(ACTION).apply {
                    putExtra("type", TYPE_SCREENSAVER)
                    putExtra("file", path)
                    putExtra("show_result_hint", false)
                },
            )
            lastSetKey = key
            Log.i(TAG, "screensaver broadcast sent: $path")
        }.onFailure { Log.e(TAG, "failed to set screensaver: $it") }
    }

    private fun deleteOrphans(context: Context, keepId: Long) {
        val resolver = context.contentResolver
        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        runCatching {
            resolver.query(
                collection,
                arrayOf(MediaStore.Downloads._ID),
                "${MediaStore.Downloads.DISPLAY_NAME} LIKE ?",
                arrayOf("$FILE_PREFIX%"),
                null,
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idColumn)
                    if (id != keepId) {
                        runCatching {
                            resolver.delete(ContentUris.withAppendedId(collection, id), null, null)
                        }
                    }
                }
            }
        }.onFailure { Log.e(TAG, "orphan cleanup failed: $it") }
    }

    // Removes every image this object has published; the firmware keeps its
    // own imported copy, so the current sleep screen is unaffected.
    fun clear(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        lastSetKey = null
        deleteOrphans(context, keepId = -1L)
    }

    // Fit the whole cover; each bar beside it takes the average color of the
    // adjacent cover edge so the bars blend into the artwork.
    private fun renderFullscreen(cover: Bitmap, size: Size): Bitmap {
        val output = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val scale = minOf(
            size.width.toFloat() / cover.width,
            size.height.toFloat() / cover.height,
        )
        val scaledWidth = cover.width * scale
        val scaledHeight = cover.height * scale
        val left = (size.width - scaledWidth) / 2f
        val top = (size.height - scaledHeight) / 2f
        val target = Rect(
            left.toInt(),
            top.toInt(),
            (left + scaledWidth).toInt(),
            (top + scaledHeight).toInt(),
        )
        val sample = Bitmap.createScaledBitmap(cover, EDGE_SAMPLE, EDGE_SAMPLE, true)
        val paint = Paint()
        if (target.left > 0) {
            paint.color = edgeAverage(sample, horizontal = true, leading = true)
            canvas.drawRect(0f, 0f, target.left.toFloat(), size.height.toFloat(), paint)
            paint.color = edgeAverage(sample, horizontal = true, leading = false)
            canvas.drawRect(
                target.right.toFloat(), 0f, size.width.toFloat(), size.height.toFloat(), paint,
            )
        }
        if (target.top > 0) {
            paint.color = edgeAverage(sample, horizontal = false, leading = true)
            canvas.drawRect(0f, 0f, size.width.toFloat(), target.top.toFloat(), paint)
            paint.color = edgeAverage(sample, horizontal = false, leading = false)
            canvas.drawRect(
                0f, target.bottom.toFloat(), size.width.toFloat(), size.height.toFloat(), paint,
            )
        }
        sample.recycle()
        canvas.drawBitmap(cover, null, target, Paint(Paint.FILTER_BITMAP_FLAG))
        return output
    }

    private const val EDGE_SAMPLE = 32
    private const val EDGE_BAND = 2

    private fun edgeAverage(sample: Bitmap, horizontal: Boolean, leading: Boolean): Int {
        var red = 0L
        var green = 0L
        var blue = 0L
        var count = 0
        for (band in 0 until EDGE_BAND) {
            val fixed = if (leading) band else EDGE_SAMPLE - 1 - band
            for (i in 0 until EDGE_SAMPLE) {
                val pixel = if (horizontal) {
                    sample.getPixel(fixed, i)
                } else {
                    sample.getPixel(i, fixed)
                }
                red += Color.red(pixel)
                green += Color.green(pixel)
                blue += Color.blue(pixel)
                count++
            }
        }
        return Color.rgb((red / count).toInt(), (green / count).toInt(), (blue / count).toInt())
    }
}
