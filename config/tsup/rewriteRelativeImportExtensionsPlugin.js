// @ts-check
/**
 * @typedef {import("esbuild").Plugin} Plugin
 */

/**
 * @typedef {Object} RewriteRelativeImportPluginExtensionsOptions
 * @property {boolean} [preserveJsx]
 * @property {(importExtension: string, outputPath: string) => string | undefined} [formatMap] The format map function, which should return the file extension for the given output path
 */

/**
 * @param {string} path
 * @param {string} outputPath
 * @param {RewriteRelativeImportPluginExtensionsOptions} options
 * @returns {string}
 */
export function rewriteRelativeImportExtension(path, outputPath, options) {
  if (!/^\.\.?\//.test(path)) {
    return path
  }

  return path.replace(
    /\.([jt]sx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i,
    function (m, tsx, d, ext, cm) {
      if (tsx) {
        return options.preserveJsx ? ".jsx" : ".js"
      }

      if (d && (!ext || !cm)) {
        return m
      }

      const fullExtension = d + ext + "." + cm + "ts"

      const outputExtension = options.formatMap?.(fullExtension, outputPath)

      if (outputExtension) {
        return outputExtension
      }

      return d + ext + "." + cm.toLowerCase() + "js"
    },
  )
}

/**
 * efficiently process large files by streaming through chunks
 * @param {string} content
 * @param {string} outputPath
 * @param {RewriteRelativeImportPluginExtensionsOptions} options
 * @returns {string}
 */
function processFileContent(content, outputPath, options) {
  const chunkSize = 64 * 1024 // 64kb chunks
  if (content.length <= chunkSize) {
    return processSmallFile(content, outputPath, options)
  }

  let result = ""
  let buffer = ""
  let position = 0

  while (position < content.length) {
    const chunk = content.slice(position, position + chunkSize)
    buffer += chunk

    // find last complete statement to avoid splitting imports/exports
    let lastSafeIndex = buffer.length
    const lastNewline = buffer.lastIndexOf("\n")
    const lastSemicolon = buffer.lastIndexOf(";")
    const lastBrace = buffer.lastIndexOf("}")

    if (position + chunkSize < content.length) {
      lastSafeIndex = Math.max(lastNewline, lastSemicolon, lastBrace)
      if (lastSafeIndex <= 0) lastSafeIndex = buffer.length
    }

    const processChunk = buffer.slice(0, lastSafeIndex)
    buffer = buffer.slice(lastSafeIndex)

    result += processChunkContent(processChunk, outputPath, options)
    position += chunkSize
  }

  // process remaining buffer
  if (buffer.length > 0) {
    result += processChunkContent(buffer, outputPath, options)
  }

  return result
}

/**
 * process small files with original logic (optimized)
 * @param {string} content
 * @param {string} outputPath
 * @param {RewriteRelativeImportPluginExtensionsOptions} options
 * @returns {string}
 */
function processSmallFile(content, outputPath, options) {
  return content.replace(
    /(?<=(?:import|export\s*[*{])[^"']+["'])([^"']+)(?=["'])/g,
    (match) => rewriteRelativeImportExtension(match, outputPath, options),
  )
}

/**
 * process a chunk of content
 * @param {string} chunk
 * @param {string} outputPath
 * @param {RewriteRelativeImportPluginExtensionsOptions} options
 * @returns {string}
 */
function processChunkContent(chunk, outputPath, options) {
  // use single pass regex replacement instead of multiple operations
  return chunk.replace(
    /(?<=(?:import|export\s*[*{])[^"']+["'])([^"']+)(?=["'])/g,
    (match) => rewriteRelativeImportExtension(match, outputPath, options),
  )
}

/**
 * Please see https://github.com/evanw/esbuild/issues/2435
 * @param {RewriteRelativeImportPluginExtensionsOptions} [options]
 * @returns {Plugin}
 */
export function rewriteRelativeImportExtensionsPlugin(options = {}) {
  return {
    name: "rewrite-relative-import-extensions",
    setup(build) {
      build.onEnd((result) => {
        const files = result.outputFiles ?? []

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          if (!file) {
            continue
          }

          const processedText = processFileContent(
            file.text,
            file.path,
            options,
          )

          // directly modify the file object instead of creating new arrays
          files[i] = {
            ...file,
            text: processedText,
          }
        }
      })
    },
  }
}
