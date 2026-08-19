package dev.smoores.storyteller.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import dev.smoores.storyteller.model.BookImage

private const val THUMBNAIL_PIXELS = 400
private const val FULL_IMAGE_PIXELS = 2048

@Composable
internal fun ImageGalleryScreen(
    images: List<BookImage>,
    loading: Boolean,
    palette: CoverBackgroundPalette,
    loadThumbnail: suspend (String, Int) -> Bitmap?,
    loadFull: suspend (String, Int, Int) -> Bitmap?,
    onGoTo: (BookImage) -> Unit,
    onDismiss: () -> Unit,
) {
    var viewing by remember { mutableStateOf<BookImage?>(null) }

    val ink = MaterialTheme.colorScheme.onSurface
    val subtleInk = MaterialTheme.colorScheme.onSurfaceVariant

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            color = palette.contentBackground,
            contentColor = ink,
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(palette.surface)
                        .statusBarsPadding()
                        .padding(horizontal = 24.dp)
                        .padding(top = 18.dp, bottom = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Images", style = editorialTitle(34), color = ink)
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier
                            .size(30.dp)
                            .border(1.dp, palette.cardBorder, CircleShape)
                            .clickable(onClick = onDismiss),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Close,
                            "Close",
                            tint = ink,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(palette.cardBorder))

                when {
                    loading -> Box(
                        Modifier.fillMaxSize().padding(top = 80.dp),
                        Alignment.TopCenter,
                    ) {
                        CircularProgressIndicator(color = palette.ratingAccent)
                    }
                    images.isEmpty() -> Column(
                        Modifier.fillMaxSize().padding(horizontal = 40.dp, vertical = 70.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            Icons.Filled.Photo,
                            null,
                            tint = subtleInk,
                            modifier = Modifier.size(34.dp),
                        )
                        Text("No Images", style = editorialTitle(22), color = ink)
                        Text(
                            "This book has no indexed images.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = subtleInk,
                            textAlign = TextAlign.Center,
                        )
                    }
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(120.dp),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(images, key = { it.id }) { image ->
                            GalleryCell(
                                image = image,
                                palette = palette,
                                ink = ink,
                                subtleInk = subtleInk,
                                loadThumbnail = loadThumbnail,
                                onClick = { viewing = image },
                            )
                        }
                    }
                }
            }
        }
    }

    viewing?.let { image ->
        ImageGalleryViewer(
            image = image,
            loadFull = loadFull,
            onGoTo = {
                viewing = null
                onDismiss()
                onGoTo(image)
            },
            onDismiss = { viewing = null },
        )
    }
}

@Composable
private fun GalleryCell(
    image: BookImage,
    palette: CoverBackgroundPalette,
    ink: Color,
    subtleInk: Color,
    loadThumbnail: suspend (String, Int) -> Bitmap?,
    onClick: () -> Unit,
) {
    var bitmap by remember(image.id) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(image.id) {
        bitmap = loadThumbnail(image.id, THUMBNAIL_PIXELS)
    }

    Column(
        Modifier.clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(104.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(palette.cardBackground),
            contentAlignment = Alignment.Center,
        ) {
            val shown = bitmap
            if (shown != null) {
                Image(
                    shown.asImageBitmap(),
                    contentDescription = image.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(
                    Icons.Filled.Photo,
                    null,
                    tint = subtleInk,
                    modifier = Modifier.size(22.dp),
                )
            }
            Text(
                image.kind,
                fontSize = 10.sp,
                color = Color.White.copy(alpha = 0.85f),
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(5.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f))
                    .padding(horizontal = 5.dp, vertical = 2.dp),
            )
        }
        Text(
            image.title,
            style = MaterialTheme.typography.bodySmall,
            color = ink,
            maxLines = 2,
        )
        Text(
            image.positionLabel,
            fontSize = 11.sp,
            color = subtleInk,
            maxLines = 1,
        )
    }
}

@Composable
private fun ImageGalleryViewer(
    image: BookImage,
    loadFull: suspend (String, Int, Int) -> Bitmap?,
    onGoTo: () -> Unit,
    onDismiss: () -> Unit,
) {
    var bitmap by remember(image.id) { mutableStateOf<Bitmap?>(null) }
    var scale by remember(image.id) { mutableFloatStateOf(1f) }
    var offset by remember(image.id) { mutableStateOf(Offset.Zero) }
    var chromeVisible by remember(image.id) { mutableStateOf(true) }

    LaunchedEffect(image.id) {
        bitmap = loadFull(image.id, FULL_IMAGE_PIXELS, FULL_IMAGE_PIXELS)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            val shown = bitmap
            if (shown == null) {
                CircularProgressIndicator(
                    color = Color.White,
                    modifier = Modifier.align(Alignment.Center),
                )
            } else {
                Image(
                    shown.asImageBitmap(),
                    contentDescription = image.title,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(image.id) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                scale = (scale * zoom).coerceIn(1f, 8f)
                                offset = if (scale > 1f) offset + pan else Offset.Zero
                            }
                        }
                        .pointerInput(image.id) {
                            detectTapGestures(
                                onTap = { chromeVisible = !chromeVisible },
                                onDoubleTap = {
                                    if (scale > 1f) {
                                        scale = 1f
                                        offset = Offset.Zero
                                    } else {
                                        scale = 2.5f
                                    }
                                },
                            )
                        }
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offset.x,
                            translationY = offset.y,
                        ),
                )
            }

            if (chromeVisible) {
                Column(Modifier.fillMaxSize()) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(Color.Black.copy(alpha = 0.45f))
                            .statusBarsPadding()
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.45f))
                                .clickable(onClick = onDismiss),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.Close,
                                "Close",
                                tint = Color.White,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                image.title,
                                fontSize = 13.sp,
                                color = Color.White,
                                maxLines = 1,
                            )
                            Text(
                                viewerMetaLabel(image),
                                fontSize = 11.sp,
                                color = Color.White.copy(alpha = 0.7f),
                                maxLines = 1,
                            )
                        }
                        Button(
                            onClick = onGoTo,
                            colors = ButtonDefaults.buttonColors(),
                        ) {
                            Text("Go to", fontSize = 13.sp)
                        }
                    }

                    Spacer(Modifier.weight(1f))

                    val caption = viewerCaption(image)
                    if (caption != null) {
                        Text(
                            caption,
                            fontSize = 12.sp,
                            color = Color.White.copy(alpha = 0.85f),
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color.Black.copy(alpha = 0.55f))
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                        )
                    }
                }
            }
        }
    }
}

private fun viewerMetaLabel(image: BookImage): String =
    listOf(image.kind.replaceFirstChar(Char::uppercase), image.positionLabel)
        .filter(String::isNotEmpty)
        .joinToString(" \u00B7 ")

// Length gate drops junk alt text like "image" or "img".
private fun viewerCaption(image: BookImage): String? =
    image.caption?.takeIf { it.length >= 8 }
