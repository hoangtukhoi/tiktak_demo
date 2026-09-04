exports.getMetadata = async (filePath) => ({ durationMs: 10000, width: 1920, height: 1080, fps: 30 });
exports.transcodeToHLS = async (inputPath, outputDir, onProgress) => ({ masterPath: 'master.m3u8', files: [] });
exports.extractThumbnail = async (inputPath, outputPath, timestampSec = 1) => outputPath;