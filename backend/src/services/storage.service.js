exports.uploadBuffer = async (key, buffer, mimetype, bucket) => { return `https://fake-s3.com/${bucket}/${key}`; };
exports.uploadStream = async (key, stream, mimetype, bucket) => { return `https://fake-s3.com/${bucket}/${key}`; };
exports.deleteFile = async (key, bucket) => { return true; };
exports.getPresignedUploadUrl = async (key, expiresIn, bucket) => { return `https://fake-s3.com/presigned/${bucket}/${key}`; };