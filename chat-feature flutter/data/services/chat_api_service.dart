import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

class ChatApiService {
  static const int maxFileSizeBytes = 150 * 1024 * 1024; // 150 MB
  static const String _baseUrl = 'http://192.168.1.5:8080';

  late final Dio _dio; // For internal server requests
  late final Dio _s3Dio; // For S3 uploads (no base URL)

  ChatApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    ));

    _s3Dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(seconds: 60),
    ));
  }

  /// Set authorization token for authenticated requests
  void setAuthToken(String token) {
    _dio.options.headers['Authorization'] = 'Bearer $token';
  }

  /// Request presigned upload URLs from the server
  /// Returns a map of filename -> {upload_url, s3_key} for each file
  /// Returns null only on network/server error
  /// Note: File size validation should be done by caller before calling this
  Future<Map<String, Map<String, String>>?> getPresignedUploadUrls({
    required List<String> filePaths,
    required List<String> contentTypes,
    required String mediaType, // 'image', 'video', 'document', etc.
    required String userID,
    required String token, // JWT token
  }) async {

    try {
      // Build request body: array of {file_name, content_type}
      final requestBody = <Map<String, String>>[];
      for (int i = 0; i < filePaths.length; i++) {
        final fileName = filePaths[i].split('/').last;
        requestBody.add({
          'file_name': fileName,
          'content_type': contentTypes[i],
        });
      }

      // Set Authorization header with JWT token
      _dio.options.headers['Authorization'] = 'Bearer $token';
      _dio.options.headers['X-User-Id'] = userID;

      final response = await _dio.post(
        '${_baseUrl}/media/messages/presigned-upload',
        data: requestBody,
      );

      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300) {
        final json = response.data as Map<String, dynamic>?;
        if (json == null) return null;

        final dataList = json['data'] as List? ?? [];

        // Build map of filename -> {upload_url, s3_key}
        final result = <String, Map<String, String>>{};
        for (int i = 0; i < filePaths.length && i < dataList.length; i++) {
          final fileName = filePaths[i].split('/').last;
          final item = dataList[i] as Map<String, dynamic>?;
          if (item != null) {
            result[fileName] = {
              'upload_url': item['upload_url'] as String? ?? '',
              's3_key': item['s3_key'] as String? ?? '',
            };
          }
        }

        return result;
      }

      print('[ChatApiService] Presigned URL request failed with status ${response.statusCode}');
      return null;
    } on DioException catch (e) {
      print('[ChatApiService] Error getting presigned URLs: ${e.message}');
      return null;
    }
  }

  /// Upload a single file to S3 using a presigned URL
  /// Returns the S3 key on success, or null on failure
  Future<String?> uploadFileToS3({
    required String filePath,
    required String presignedUrl,
    required String contentType,
    void Function(int sent, int total)? onSendProgress,
  }) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        return null;
      }

      final bytes = await file.readAsBytes();
      final fileName = filePath.split('/').last;

      final response = await _s3Dio.put(
        presignedUrl,
        data: bytes,
        options: Options(
          contentType: contentType,
          headers: {
            'Content-Type': contentType,
          },
        ),
        onSendProgress: (sent, total) {
          if (onSendProgress != null && total > 0) {
            onSendProgress(sent, total);
          }
        },
      );

      if (response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300) {
        return fileName; // Return the filename as identifier (S3 key will be provided by server)
      }

      return null;
    } on DioException catch (e) {
      print('[ChatApiService] Error uploading to S3: ${e.message}');
      return null;
    }
  }

  /// Upload files to S3 using presigned URLs
  /// Returns: {fileName: s3_key} on success
  /// Returns empty map on any failure
  /// Note: File size validation should be done by caller before calling this
  Future<Map<String, String>?> uploadFilesToS3({
    required List<String> filePaths,
    required Map<String, Map<String, String>> presignedUrls, // file_name -> {upload_url, s3_key}
    required List<String> contentTypes,
    void Function(int fileIndex, int sent, int total)? onFileProgress,
  }) async {

    try {
      final result = <String, String>{};

      for (int i = 0; i < filePaths.length; i++) {
        final filePath = filePaths[i];
        final fileName = filePath.split('/').last;
        final urlInfo = presignedUrls[fileName];

        if (urlInfo == null) continue;

        final uploadUrl = urlInfo['upload_url'] ?? '';
        final s3Key = urlInfo['s3_key'] ?? '';

        if (uploadUrl.isEmpty || s3Key.isEmpty) continue;

        // Upload file
        final success = await uploadFileToS3(
          filePath: filePath,
          presignedUrl: uploadUrl,
          contentType: contentTypes[i],
          onSendProgress: (sent, total) {
            if (onFileProgress != null) {
              onFileProgress(i, sent, total);
            }
          },
        );

        if (success != null) {
          result[fileName] = s3Key;
        }
      }

      return result;
    } on DioException catch (e) {
      print('[ChatApiService] Error uploading files to S3: ${e.message}');
      return {};
    }
  }
}
