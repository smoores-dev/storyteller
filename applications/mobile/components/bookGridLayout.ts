const gap = 12
const horizontalPadding = 36
const minThumbnailWidth = 150

export function calculateBookGridLayout(widthOutsideSafeArea: number) {
  const numColumns = Math.max(
    1,
    Math.floor(
      (widthOutsideSafeArea - horizontalPadding + gap) /
        (minThumbnailWidth + gap),
    ),
  )

  const thumbnailWidth = Math.floor(
    (widthOutsideSafeArea - horizontalPadding - (numColumns - 1) * gap) /
      numColumns,
  )

  return { numColumns, thumbnailWidth }
}
