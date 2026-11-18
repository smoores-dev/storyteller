/**
 * Like readFile, but streams the file into memory in chunks
 * to avoid hard-coded 2GB limit on file I/O operations in
 * Node.js/libuv https://github.com/libuv/libuv/pull/1501
 */
export declare function streamFile(path: string): Promise<Uint8Array>;
/**
 * Streams a file in chunks using an async generator,
 * avoiding the 2GB limit referenced above.
 */
export declare function getFileChunks(path: string): AsyncGenerator<Buffer>;
export declare function scratchPath(...segments: string[]): string;
/**
 * Detect whether a file is meant to be "hidden", per OS-specific
 * file naming conventions.
 *
 * Returns true for files whose basename begins with a dot (e.g. `.env`)
 * or whose paths contain the segment `@eaDir` (e.g. `@eaDir/file.mp3`),
 * which is Synology's "metadata" directory name.
 */
export declare function isHiddenFile(nameOrPath: string): boolean;
