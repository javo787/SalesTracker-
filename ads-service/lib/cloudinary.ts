import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export default cloudinary;

/**
 * Upload a base64 image string to Cloudinary.
 * @param base64 - full data URI e.g. "data:image/jpeg;base64,..."
 * @param folder - 'savdo/classifieds' | 'savdo/wholesale'
 * @param maxWidthPx - resize on Cloudinary side (saves bandwidth)
 */
export async function uploadImage(
  base64: string,
  folder: 'savdo/classifieds' | 'savdo/wholesale',
  maxWidthPx: number = 800
): Promise<{ url: string; publicId: string }> {
  const result = await cloudinary.uploader.upload(base64, {
    folder,
    transformation: [
      { width: maxWidthPx, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
    ],
    resource_type: 'image',
  });
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Delete an image from Cloudinary by publicId.
 * Call this when a classified is deleted to free storage.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
