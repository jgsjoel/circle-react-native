import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

class DocumentPickerScreen extends StatefulWidget {
  final void Function(List<File> files) onPicked;

  const DocumentPickerScreen({
    super.key,
    required this.onPicked,
  });

  @override
  State<DocumentPickerScreen> createState() => _DocumentPickerScreenState();
}

class _DocumentPickerScreenState extends State<DocumentPickerScreen> {
  List<File> _selectedFiles = [];

  final List<String> allowedExtensions = [
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'csv',
    'rtf',
  ];

  Future<void> _pickDocuments() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: allowedExtensions,
      allowMultiple: true,
    );

    if (result == null) return;

    final files = result.paths
        .whereType<String>()
        .map((path) => File(path))
        .toList();

    setState(() {
      _selectedFiles = files;
    });
  }

  void _send() {
    if (_selectedFiles.isEmpty) return;
    widget.onPicked(_selectedFiles);
    Navigator.pop(context);
  }

  IconData _getIcon(String path) {
    final ext = path.split('.').last.toLowerCase();

    switch (ext) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'doc':
      case 'docx':
        return Icons.description;
      case 'xls':
      case 'xlsx':
        return Icons.table_chart;
      case 'ppt':
      case 'pptx':
        return Icons.slideshow;
      case 'txt':
        return Icons.text_snippet;
      default:
        return Icons.insert_drive_file;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text("Select Documents"),
        actions: [
          TextButton(
            onPressed: _send,
            child: const Text(
              "Send",
              style: TextStyle(color: Colors.blue),
            ),
          )
        ],
      ),
      body: Column(
        children: [
          const SizedBox(height: 10),

          ElevatedButton.icon(
            onPressed: _pickDocuments,
            icon: const Icon(Icons.folder_open),
            label: const Text("Pick Documents"),
          ),

          const SizedBox(height: 10),

          Expanded(
            child: _selectedFiles.isEmpty
                ? const Center(
                    child: Text(
                      "No documents selected",
                      style: TextStyle(color: Colors.white70),
                    ),
                  )
                : ListView.builder(
                    itemCount: _selectedFiles.length,
                    itemBuilder: (context, index) {
                      final file = _selectedFiles[index];

                      return ListTile(
                        leading: Icon(
                          _getIcon(file.path),
                          color: Colors.white,
                        ),
                        title: Text(
                          file.path.split('/').last,
                          style: const TextStyle(color: Colors.white),
                        ),
                        subtitle: Text(
                          file.path,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white54),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.close, color: Colors.red),
                          onPressed: () {
                            setState(() {
                              _selectedFiles.removeAt(index);
                            });
                          },
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}