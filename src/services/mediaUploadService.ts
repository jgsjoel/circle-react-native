import api from '../api/client';
import { Blurhash } from 'react-native-blurhash';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

export interface SelectedMediaForUpload {
  uri: string;
  type: 'photo' | 'video' | 'file';
  filename: string;
  mimeType: string;
}

export interface PresignedURLResponse {
  upload_url: string;
  s3_key: string;
}

export interface UploadProgress {
  fileIndex: number;
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * Get presigned URLs from the backend for multiple media files.
 */
export async function getPresignedUploadURLs(
  media: SelectedMediaForUpload[],
  mediaType: 'image' | 'video' | 'file',
): Promise<PresignedURLResponse[]> {
  const request = media.map((m) => ({
    file_name: m.filename,
    content_type: m.mimeType,
  }));

  const userId = await SecureStore.getItemAsync('user_id');
  console.log('[mediaUploadService] Requesting presigned URLs:', {
    endpoint: `/messages/presigned-upload`,
    mediaType,
    fileCount: media.length,
    userId,
    request,
  });

  try {
    const response = await api.post<{
      message: string;
      data: PresignedURLResponse[];
    }>(`media/messages/presigned-upload`, request, {
      headers: {
        'X-User-Id': userId || '',
      },
    });

    console.log('[mediaUploadService] Presigned URLs received:', response.data);
    return response.data.data;
  } catch (error) {
    console.error('[mediaUploadService] getPresignedUploadURLs error:', {
      error,
      status: (error as any)?.response?.status,
      statusText: (error as any)?.response?.statusText,
      data: (error as any)?.response?.data,
      endpoint: `/messages/presigned-upload`,
    });
    throw error;
  }
}

/**
 * Upload a single file to S3 using a presigned URL.
 * Calls onProgress callback with upload progress.
 */
export async function uploadToS3(
  fileUri: string,
  uploadUrl: string,
  mimeType: string,
  onProgress?: (progress: UploadProgress) => void,
  fileIndex?: number,
): Promise<void> {
  try {
    // Read file as blob using fetch
    const response = await fetch(fileUri);
    const blob = await response.blob();

    // Upload using XMLHttpRequest to track progress
    const xhr = new XMLHttpRequest();

    if (onProgress && fileIndex !== undefined) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({
            fileIndex,
            bytesTransferred: e.loaded,
            totalBytes: e.total,
          });
        }
      });
    }

    return new Promise((resolve, reject) => {
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('S3 upload failed: network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('S3 upload aborted'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', mimeType);
      xhr.send(blob);
    });
  } catch (error) {
    console.error('[mediaUploadService] uploadToS3 error:', error);
    throw error;
  }
}

/**
 * Generate blurhash for an image file.
 * Returns null if generation fails.
 */


/**
 * Upload multiple media files to S3 and generate blurhashes.
 * Returns array of {s3_key, blurhash} for each file.
 */
export async function uploadMediaToS3(
  media: SelectedMediaForUpload[],
  mediaType: 'image' | 'video' | 'file',
  onProgress?: (progress: UploadProgress) => void,
): Promise<Array<{ s3_key: string; blurhash: string | null }>> {
  try {
    // Step 1: Get presigned URLs
    const presignedUrls = await getPresignedUploadURLs(media, mediaType);

    if (presignedUrls.length !== media.length) {
      throw new Error('Presigned URL count mismatch');
    }

    // Step 2: Upload each file to S3 and generate blurhash
    const results: Array<{ s3_key: string; blurhash: string | null }> = [];

    for (let i = 0; i < media.length; i++) {
      const mediaItem = media[i];
      const presignedData = presignedUrls[i];

      console.log(`[mediaUploadService] Uploading file ${i + 1}/${media.length}: ${mediaItem.filename}`);

      // Upload to S3
      await uploadToS3(
        mediaItem.uri,
        presignedData.upload_url,
        mediaItem.mimeType,
        onProgress,
        i,
      );

      console.log(`[mediaUploadService] Uploaded ${mediaItem.filename} to S3`);

      // Generate blurhash for photos only
      const blurhash = mediaItem.type === 'photo' ? await Blurhash.encode(mediaItem.uri, 4, 3) : null;

      results.push({
        s3_key: presignedData.s3_key,
        blurhash: blurhash ?? '',
      });
    }

    return results;
  } catch (error) {
    console.error('[mediaUploadService] uploadMediaToS3 error:', error);
    throw error;
  }
}
