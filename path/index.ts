const CHAR_FORWARD_SLASH = 47 /* / */
const CHAR_BACKWARD_SLASH = 92 /* / */
const CHAR_DOT = 46 /* . */
const CHAR_UPPERCASE_A = 65 /* A */
const CHAR_LOWERCASE_A = 97 /* a */
const CHAR_UPPERCASE_Z = 90 /* Z */
const CHAR_LOWERCASE_Z = 122 /* z */
const CHAR_COLON = 58 /* : */

const WINDOWS_RESERVED_NAMES = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
  "COM\xb9",
  "COM\xb2",
  "COM\xb3",
  "LPT\xb9",
  "LPT\xb2",
  "LPT\xb3",
]

function isWindowsReservedName(path: string, colonIndex: number) {
  const devicePart = path.slice(0, colonIndex).toUpperCase()
  return WINDOWS_RESERVED_NAMES.includes(devicePart)
}

const isWindows = typeof process !== "undefined" && process.platform === "win32"

function isWindowsDeviceRoot(code: number) {
  return (
    (code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z) ||
    (code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z)
  )
}

function isPathSeparator(code: number) {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH
}

function isPosixPathSeparator(code: number) {
  return code === CHAR_FORWARD_SLASH
}

const forwardSlashRegExp = /\//g

function normalizeString(
  path: string,
  allowAboveRoot: boolean,
  separator: string,
  isPathSeparator: (code: number) => boolean,
) {
  let res = ""
  let lastSegmentLength = 0
  let lastSlash = -1
  let dots = 0
  let code = 0
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i)
    else if (isPathSeparator(code)) break
    else code = CHAR_FORWARD_SLASH

    if (isPathSeparator(code)) {
      if (lastSlash === i - 1 || dots === 1) {
        // NOOP
      } else if (dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(res.length - 1) !== CHAR_DOT ||
          res.charCodeAt(res.length - 2) !== CHAR_DOT
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.length - lastSegmentLength - 1
            if (lastSlashIndex === -1) {
              res = ""
              lastSegmentLength = 0
            } else {
              res = res.slice(0, lastSlashIndex)
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator)
            }
            lastSlash = i
            dots = 0
            continue
          } else if (res.length !== 0) {
            res = ""
            lastSegmentLength = 0
            lastSlash = i
            dots = 0
            continue
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? `${separator}..` : ".."
          lastSegmentLength = 2
        }
      } else {
        if (res.length > 0) res += `${separator}${path.slice(lastSlash + 1, i)}`
        else res = path.slice(lastSlash + 1, i)
        lastSegmentLength = i - lastSlash - 1
      }
      lastSlash = i
      dots = 0
    } else if (code === CHAR_DOT && dots !== -1) {
      ++dots
    } else {
      dots = -1
    }
  }
  return res
}

const windows = {
  normalize(path: string) {
    const len = path.length
    if (len === 0) return "."
    let rootEnd = 0
    let device
    let isAbsolute = false
    const code = path.charCodeAt(0)

    // Try to match a root
    if (len === 1) {
      // `path` contains just a single char, exit early to avoid
      // unnecessary work
      return isPosixPathSeparator(code) ? "\\" : path
    }
    if (isPathSeparator(code)) {
      // Possible UNC root

      // If we started with a separator, we know we at least have an absolute
      // path of some kind (UNC or otherwise)
      isAbsolute = true

      if (isPathSeparator(path.charCodeAt(1))) {
        // Matched double path separator at beginning
        let j = 2
        let last = j
        // Match 1 or more non-path separators
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j)
          // Matched!
          last = j
          // Match 1 or more path separators
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++
          }
          if (j < len && j !== last) {
            // Matched!
            last = j
            // Match 1 or more non-path separators
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++
            }
            if (j === len || j !== last) {
              if (firstPart === "." || firstPart === "?") {
                // We matched a device root (e.g. \\\\.\\PHYSICALDRIVE0)
                device = `\\\\${firstPart}`
                rootEnd = 4
              } else if (j === len) {
                // We matched a UNC root only
                // Return the normalized version of the UNC root since there
                // is nothing left to process
                return `\\\\${firstPart}\\${path.slice(last)}\\`
              } else {
                // We matched a UNC root with leftovers
                device = `\\\\${firstPart}\\${path.slice(last, j)}`
                rootEnd = j
              }
            }
          }
        }
      } else {
        rootEnd = 1
      }
    } else {
      const colonIndex = path.indexOf(":")
      if (colonIndex > 0) {
        if (isWindowsDeviceRoot(code) && colonIndex === 1) {
          device = path.slice(0, 2)
          rootEnd = 2
          if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
            isAbsolute = true
            rootEnd = 3
          }
        } else if (isWindowsReservedName(path, colonIndex)) {
          device = path.slice(0, colonIndex + 1)
          rootEnd = colonIndex + 1
        }
      }
    }

    let tail =
      rootEnd < len
        ? normalizeString(
            path.slice(rootEnd),
            !isAbsolute,
            "\\",
            isPathSeparator,
          )
        : ""
    if (tail.length === 0 && !isAbsolute) tail = "."
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1)))
      tail += "\\"
    if (!isAbsolute && device === undefined && path.includes(":")) {
      // If the original path was not absolute and if we have not been able to
      // resolve it relative to a particular device, we need to ensure that the
      // `tail` has not become something that Windows might interpret as an
      // absolute path. See CVE-2024-36139.
      if (
        tail.length >= 2 &&
        isWindowsDeviceRoot(tail.charCodeAt(0)) &&
        tail.charCodeAt(1) === CHAR_COLON
      ) {
        return `.\\${tail}`
      }
      let index = path.indexOf(":")

      do {
        if (index === len - 1 || isPathSeparator(path.charCodeAt(index + 1))) {
          return `.\\${tail}`
        }
      } while ((index = path.indexOf(":", index + 1)) !== -1)
    }
    const colonIndex = path.indexOf(":")
    if (isWindowsReservedName(path, colonIndex)) {
      return `.\\${device ?? ""}${tail}`
    }
    if (device === undefined) {
      return isAbsolute ? `\\${tail}` : tail
    }
    return isAbsolute ? `${device}\\${tail}` : `${device}${tail}`
  },

  join(...args: string[]) {
    if (args.length === 0) return "."

    let joined
    let firstPart!: string
    for (const arg of args) {
      if (arg.length > 0) {
        if (joined === undefined) joined = firstPart = arg
        else joined += `\\${arg}`
      }
    }

    if (joined === undefined) return "."

    // Make sure that the joined path doesn't start with two slashes, because
    // normalize() will mistake it for a UNC path then.
    //
    // This step is skipped when it is very clear that the user actually
    // intended to point at a UNC path. This is assumed when the first
    // non-empty string arguments starts with exactly two slashes followed by
    // at least one more non-slash character.
    //
    // Note that for normalize() to treat a path as a UNC path it needs to
    // have at least 2 components, so we don't filter for that here.
    // This means that the user can use join to construct UNC paths from
    // a server name and a share name; for example:
    //   path.join('//server', 'share') -> '\\\\server\\share\\')
    let needsReplace = true
    let slashCount = 0
    if (isPathSeparator(firstPart.charCodeAt(0))) {
      ++slashCount
      const firstLen = firstPart.length
      if (firstLen > 1 && isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount
          else {
            // We matched a UNC path in the first part
            needsReplace = false
          }
        }
      }
    }
    if (needsReplace) {
      // Find any more consecutive slashes we need to replace
      while (
        slashCount < joined.length &&
        isPathSeparator(joined.charCodeAt(slashCount))
      ) {
        slashCount++
      }

      // Replace the slashes if needed
      if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`
    }

    return windows.normalize(joined)
  },

  extname(path: string) {
    let start = 0
    let startDot = -1
    let startPart = 0
    let end = -1
    let matchedSlash = true
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    let preDotState = 0

    // Check for a drive letter prefix so as not to mistake the following
    // path separator as an extra separator at the end of the path that can be
    // disregarded

    if (
      path.length >= 2 &&
      path.charCodeAt(1) === CHAR_COLON &&
      isWindowsDeviceRoot(path.charCodeAt(0))
    ) {
      start = startPart = 2
    }

    for (let i = path.length - 1; i >= start; --i) {
      const code = path.charCodeAt(i)
      if (isPathSeparator(code)) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1
          break
        }
        continue
      }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false
        end = i + 1
      }
      if (code === CHAR_DOT) {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1) startDot = i
        else if (preDotState !== 1) preDotState = 1
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1
      }
    }

    if (
      startDot === -1 ||
      end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    ) {
      return ""
    }
    return path.slice(startDot, end)
  },

  basename(path: string, suffix?: string) {
    let start = 0
    let end = -1
    let matchedSlash = true

    // Check for a drive letter prefix so as not to mistake the following
    // path separator as an extra separator at the end of the path that can be
    // disregarded
    if (
      path.length >= 2 &&
      isWindowsDeviceRoot(path.charCodeAt(0)) &&
      path.charCodeAt(1) === CHAR_COLON
    ) {
      start = 2
    }

    if (
      suffix !== undefined &&
      suffix.length > 0 &&
      suffix.length <= path.length
    ) {
      if (suffix === path) return ""
      let extIdx = suffix.length - 1
      let firstNonSlashEnd = -1
      for (let i = path.length - 1; i >= start; --i) {
        const code = path.charCodeAt(i)
        if (isPathSeparator(code)) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            start = i + 1
            break
          }
        } else {
          if (firstNonSlashEnd === -1) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching
            matchedSlash = false
            firstNonSlashEnd = i + 1
          }
          if (extIdx >= 0) {
            // Try to match the explicit extension
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = i
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIdx = -1
              end = firstNonSlashEnd
            }
          }
        }
      }

      if (start === end) end = firstNonSlashEnd
      else if (end === -1) end = path.length
      return path.slice(start, end)
    }
    for (let i = path.length - 1; i >= start; --i) {
      if (isPathSeparator(path.charCodeAt(i))) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1
          break
        }
      } else if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // path component
        matchedSlash = false
        end = i + 1
      }
    }

    if (end === -1) return ""
    return path.slice(start, end)
  },

  dirname(path: string) {
    if (path.length === 0) return "."
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH
    let end = -1
    let matchedSlash = true
    for (let i = path.length - 1; i >= 1; --i) {
      if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          end = i
          break
        }
      } else {
        // We saw the first non-path separator
        matchedSlash = false
      }
    }

    if (end === -1) return hasRoot ? "/" : "."
    if (hasRoot && end === 1) return "//"
    return path.slice(0, end)
  },

  resolve(...args: string[]) {
    let resolvedDevice = ""
    let resolvedTail = ""
    let resolvedAbsolute = false

    for (let i = args.length - 1; i >= -1; i--) {
      let path
      if (i >= 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        path = args[i]!

        // Skip empty entries
        if (path.length === 0) {
          continue
        }
      } else if (resolvedDevice.length === 0) {
        path = process.cwd()
        // Fast path for current directory
        if (
          args.length === 0 ||
          (args.length === 1 &&
            (args[0] === "" || args[0] === ".") &&
            isPathSeparator(path.charCodeAt(0)))
        ) {
          if (!isWindows) {
            path = path.replace(forwardSlashRegExp, "\\")
          }
          return path
        }
      } else {
        // Windows has the concept of drive-specific current working
        // directories. If we've resolved a drive letter but not yet an
        // absolute path, get cwd for that drive, or the process cwd if
        // the drive cwd is not available. We're sure the device is not
        // a UNC path at this points, because UNC paths are always absolute.
        path = process.env[`=${resolvedDevice}`] || process.cwd()

        // Verify that a cwd was found and that it actually points
        // to our drive. If not, default to the drive's root.
        if (
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          path === undefined ||
          (path.slice(0, 2).toLowerCase() !== resolvedDevice.toLowerCase() &&
            path.charCodeAt(2) === CHAR_BACKWARD_SLASH)
        ) {
          path = `${resolvedDevice}\\`
        }
      }

      const len = path.length
      let rootEnd = 0
      let device = ""
      let isAbsolute = false
      const code = path.charCodeAt(0)

      // Try to match a root
      if (len === 1) {
        if (isPathSeparator(code)) {
          // `path` contains just a path separator
          rootEnd = 1
          isAbsolute = true
        }
      } else if (isPathSeparator(code)) {
        // Possible UNC root

        // If we started with a separator, we know we at least have an
        // absolute path of some kind (UNC or otherwise)
        isAbsolute = true

        if (isPathSeparator(path.charCodeAt(1))) {
          // Matched double path separator at beginning
          let j = 2
          let last = j
          // Match 1 or more non-path separators
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++
          }
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j)
            // Matched!
            last = j
            // Match 1 or more path separators
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++
            }
            if (j < len && j !== last) {
              // Matched!
              last = j
              // Match 1 or more non-path separators
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++
              }
              if (j === len || j !== last) {
                if (firstPart !== "." && firstPart !== "?") {
                  // We matched a UNC root
                  device = `\\\\${firstPart}\\${path.slice(last, j)}`
                  rootEnd = j
                } else {
                  // We matched a device root (e.g. \\\\.\\PHYSICALDRIVE0)
                  device = `\\\\${firstPart}`
                  rootEnd = 4
                }
              }
            }
          }
        } else {
          rootEnd = 1
        }
      } else if (
        isWindowsDeviceRoot(code) &&
        path.charCodeAt(1) === CHAR_COLON
      ) {
        // Possible device root
        device = path.slice(0, 2)
        rootEnd = 2
        if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
          // Treat separator following drive name as an absolute path
          // indicator
          isAbsolute = true
          rootEnd = 3
        }
      }

      if (device.length > 0) {
        if (resolvedDevice.length > 0) {
          if (device.toLowerCase() !== resolvedDevice.toLowerCase())
            // This path points to another device so it is not applicable
            continue
        } else {
          resolvedDevice = device
        }
      }

      if (resolvedAbsolute) {
        if (resolvedDevice.length > 0) break
      } else {
        resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`
        resolvedAbsolute = isAbsolute
        if (isAbsolute && resolvedDevice.length > 0) {
          break
        }
      }
    }

    // At this point the path should be resolved to a full absolute path,
    // but handle relative paths to be safe (might happen when process.cwd()
    // fails)

    // Normalize the tail path
    resolvedTail = normalizeString(
      resolvedTail,
      !resolvedAbsolute,
      "\\",
      isPathSeparator,
    )

    return resolvedAbsolute
      ? `${resolvedDevice}\\${resolvedTail}`
      : `${resolvedDevice}${resolvedTail}` || "."
  },
}

const posixCwd = (() => {
  if (isWindows) {
    // Converts Windows' backslash path separators to POSIX forward slashes
    // and truncates any drive indicator
    const regexp = /\\/g
    return () => {
      const cwd = process.cwd().replace(regexp, "/")
      return cwd.slice(cwd.indexOf("/"))
    }
  }

  // We're already on POSIX, no need for any transformations
  return () => process.cwd()
})()

const posix = {
  resolve(...args: string[]) {
    if (
      args.length === 0 ||
      (args.length === 1 && (args[0] === "" || args[0] === "."))
    ) {
      const cwd = posixCwd()
      if (cwd.charCodeAt(0) === CHAR_FORWARD_SLASH) {
        return cwd
      }
    }
    let resolvedPath = ""
    let resolvedAbsolute = false

    for (let i = args.length - 1; i >= 0 && !resolvedAbsolute; i--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const path = args[i]!

      // Skip empty entries
      if (path.length === 0) {
        continue
      }

      resolvedPath = `${path}/${resolvedPath}`
      resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH
    }

    if (!resolvedAbsolute) {
      const cwd = posixCwd()
      resolvedPath = `${cwd}/${resolvedPath}`
      resolvedAbsolute = cwd.charCodeAt(0) === CHAR_FORWARD_SLASH
    }

    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)

    // Normalize the path
    resolvedPath = normalizeString(
      resolvedPath,
      !resolvedAbsolute,
      "/",
      isPosixPathSeparator,
    )

    if (resolvedAbsolute) {
      return `/${resolvedPath}`
    }
    return resolvedPath.length > 0 ? resolvedPath : "."
  },

  dirname(path: string) {
    if (path.length === 0) return "."
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH
    let end = -1
    let matchedSlash = true
    for (let i = path.length - 1; i >= 1; --i) {
      if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          end = i
          break
        }
      } else {
        // We saw the first non-path separator
        matchedSlash = false
      }
    }

    if (end === -1) return hasRoot ? "/" : "."
    if (hasRoot && end === 1) return "//"
    return path.slice(0, end)
  },

  basename(path: string, suffix?: string) {
    let start = 0
    let end = -1
    let matchedSlash = true

    if (
      suffix !== undefined &&
      suffix.length > 0 &&
      suffix.length <= path.length
    ) {
      if (suffix === path) return ""
      let extIdx = suffix.length - 1
      let firstNonSlashEnd = -1
      for (let i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i)
        if (code === CHAR_FORWARD_SLASH) {
          // If we reached a path separator that was not part of a set of path
          // separators at the end of the string, stop now
          if (!matchedSlash) {
            start = i + 1
            break
          }
        } else {
          if (firstNonSlashEnd === -1) {
            // We saw the first non-path separator, remember this index in case
            // we need it if the extension ends up not matching
            matchedSlash = false
            firstNonSlashEnd = i + 1
          }
          if (extIdx >= 0) {
            // Try to match the explicit extension
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                // We matched the extension, so mark this as the end of our path
                // component
                end = i
              }
            } else {
              // Extension does not match, so our result is the entire path
              // component
              extIdx = -1
              end = firstNonSlashEnd
            }
          }
        }
      }

      if (start === end) end = firstNonSlashEnd
      else if (end === -1) end = path.length
      return path.slice(start, end)
    }
    for (let i = path.length - 1; i >= 0; --i) {
      if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          start = i + 1
          break
        }
      } else if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // path component
        matchedSlash = false
        end = i + 1
      }
    }

    if (end === -1) return ""
    return path.slice(start, end)
  },
  extname(path: string) {
    let startDot = -1
    let startPart = 0
    let end = -1
    let matchedSlash = true
    // Track the state of characters (if any) we see before our first dot and
    // after any path separator we find
    let preDotState = 0
    for (let i = path.length - 1; i >= 0; --i) {
      const char = path[i]
      if (char === "/") {
        // If we reached a path separator that was not part of a set of path
        // separators at the end of the string, stop now
        if (!matchedSlash) {
          startPart = i + 1
          break
        }
        continue
      }
      if (end === -1) {
        // We saw the first non-path separator, mark this as the end of our
        // extension
        matchedSlash = false
        end = i + 1
      }
      if (char === ".") {
        // If this is our first dot, mark it as the start of our extension
        if (startDot === -1) startDot = i
        else if (preDotState !== 1) preDotState = 1
      } else if (startDot !== -1) {
        // We saw a non-dot and non-path separator before our dot, so we should
        // have a good chance at having a non-empty extension
        preDotState = -1
      }
    }

    if (
      startDot === -1 ||
      end === -1 ||
      // We saw a non-dot character immediately before the dot
      preDotState === 0 ||
      // The (right-most) trimmed path component is exactly '..'
      (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    ) {
      return ""
    }
    return path.slice(startDot, end)
  },
  normalize(path: string) {
    if (path.length === 0) return "."

    const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH
    const trailingSeparator =
      path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH

    // Normalize the path
    path = normalizeString(path, !isAbsolute, "/", isPosixPathSeparator)

    if (path.length === 0) {
      if (isAbsolute) return "/"
      return trailingSeparator ? "./" : "."
    }
    if (trailingSeparator) path += "/"

    return isAbsolute ? `/${path}` : path
  },
  join(...args: string[]) {
    if (args.length === 0) return "."

    const path = []
    for (const arg of args) {
      if (arg.length > 0) {
        path.push(arg)
      }
    }

    if (path.length === 0) return "."

    return posix.normalize(path.join("/"))
  },
}

export function resolve(...args: string[]) {
  return isWindows ? windows.resolve(...args) : posix.resolve(...args)
}

export function extname(path: string) {
  return isWindows ? windows.extname(path) : posix.extname(path)
}

export function basename(path: string, suffix?: string) {
  return isWindows
    ? windows.basename(path, suffix)
    : posix.basename(path, suffix)
}

export function dirname(path: string) {
  return isWindows ? windows.dirname(path) : posix.dirname(path)
}

export function join(...args: string[]) {
  return isWindows ? windows.join(...args) : posix.join(...args)
}
