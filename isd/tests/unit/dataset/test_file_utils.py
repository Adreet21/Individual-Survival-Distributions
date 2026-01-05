"""
Unit tests for file validation and storage utilities.
"""

import os
import tempfile
import uuid
from unittest.mock import Mock, patch, MagicMock
from django.test import TestCase, override_settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile, InMemoryUploadedFile
from django.core.files.storage import default_storage
from io import BytesIO

from dataset.file_utils import FileValidator, FileStorageManager


class FileValidatorTests(TestCase):
    """Test cases for FileValidator class."""
    
    def setUp(self):
        self.validator = FileValidator()
    
    def test_validate_file_success_csv(self):
        """Test successful validation of a CSV file."""
        csv_content = b"name,age,city\nJohn,25,NYC\nJane,30,LA"
        uploaded_file = SimpleUploadedFile(
            "test.csv", 
            csv_content, 
            content_type="text/csv"
        )
        
        result = self.validator.validate_file(uploaded_file)
        self.assertTrue(result)
        self.assertEqual(len(self.validator.errors), 0)
    
    def test_validate_file_success_tsv(self):
        """Test successful validation of a TSV file."""
        tsv_content = b"name\tage\tcity\nJohn\t25\tNYC\nJane\t30\tLA"
        uploaded_file = SimpleUploadedFile(
            "test.tsv", 
            tsv_content, 
            content_type="text/tab-separated-values"
        )
        
        result = self.validator.validate_file(uploaded_file)
        self.assertTrue(result)
        self.assertEqual(len(self.validator.errors), 0)
    
    def test_validate_file_no_file_provided(self):
        """Test validation fails when no file is provided."""
        with self.assertRaises(ValidationError) as context:
            self.validator.validate_file(None)
        
        self.assertIn("No file provided", str(context.exception))
    
    def test_validate_file_size_too_large(self):
        """Test validation fails for files exceeding size limit."""
        # Create a mock file that reports a large size
        large_file = Mock()
        large_file.name = "large_file.csv"
        large_file.size = FileValidator.MAX_FILE_SIZE + 1
        large_file.read.return_value = b"name,age\nJohn,25"
        large_file.seek = Mock()
        
        with self.assertRaises(ValidationError) as context:
            self.validator.validate_file(large_file)
        
        error_message = str(context.exception)
        self.assertIn("exceeds maximum limit", error_message)
        self.assertIn("100", error_message)  # Should mention 100MB limit
    
    def test_validate_file_empty_file(self):
        """Test validation fails for empty files."""
        empty_file = SimpleUploadedFile("empty.csv", b"", content_type="text/csv")
        
        with self.assertRaises(ValidationError) as context:
            self.validator.validate_file(empty_file)
        
        self.assertIn("File is empty", str(context.exception))
    
    def test_validate_file_invalid_extension(self):
        """Test validation fails for files with invalid extensions."""
        txt_file = SimpleUploadedFile(
            "test.txt", 
            b"some content", 
            content_type="text/plain"
        )
        
        with self.assertRaises(ValidationError) as context:
            self.validator.validate_file(txt_file)
        
        error_message = str(context.exception)
        self.assertIn("not allowed", error_message)
        self.assertIn(".txt", error_message)
        self.assertIn(".csv", error_message)
        self.assertIn(".tsv", error_message)
    
    def test_sanitize_filename_basic(self):
        """Test basic filename sanitization."""
        result = FileValidator.sanitize_filename("my_file.csv")
        self.assertEqual(result, "my_file.csv")
    
    def test_sanitize_filename_dangerous_characters(self):
        """Test sanitization removes dangerous characters."""
        dangerous_filename = "my<>file|with*dangerous?chars.csv"
        result = FileValidator.sanitize_filename(dangerous_filename)
        self.assertEqual(result, "myfilewithdangerouschars.csv")
    
    def test_sanitize_filename_path_components(self):
        """Test sanitization removes path components."""
        path_filename = "/path/to/my/file.csv"
        result = FileValidator.sanitize_filename(path_filename)
        self.assertEqual(result, "file.csv")


class FileStorageManagerTests(TestCase):
    """Test cases for FileStorageManager class."""
    
    def setUp(self):
        self.storage_manager = FileStorageManager()
        self.temp_dir = tempfile.mkdtemp()
    
    def tearDown(self):
        # Clean up any test files
        import shutil
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)
    
    @patch('dataset.file_utils.default_storage')
    def test_save_uploaded_file_success(self, mock_storage):
        """Test successful file saving."""
        # Setup mock
        mock_storage.save.return_value = "datasets/2024/01/abc12345_test.csv"
        
        # Create test file
        test_content = b"name,age\nJohn,25"
        uploaded_file = SimpleUploadedFile("test.csv", test_content)
        
        # Test the method
        with patch.object(self.storage_manager, '_generate_unique_filename') as mock_unique:
            mock_unique.return_value = "abc12345_test.csv"
            with patch.object(self.storage_manager, '_get_directory_path') as mock_dir:
                mock_dir.return_value = "datasets/2024/01"
                
                saved_path, sanitized_name = self.storage_manager.save_uploaded_file(
                    uploaded_file, "test.csv"
                )
        
        # Verify results
        self.assertEqual(saved_path, "datasets/2024/01/abc12345_test.csv")
        self.assertEqual(sanitized_name, "test.csv")
        mock_storage.save.assert_called_once()
    
    @patch('dataset.file_utils.default_storage')
    def test_delete_file_success(self, mock_storage):
        """Test successful file deletion."""
        mock_storage.exists.return_value = True
        mock_storage.delete.return_value = None
        
        result = self.storage_manager.delete_file("datasets/2024/01/test.csv")
        
        self.assertTrue(result)
        mock_storage.exists.assert_called_once_with("datasets/2024/01/test.csv")
        mock_storage.delete.assert_called_once_with("datasets/2024/01/test.csv")
    
    @patch('dataset.file_utils.default_storage')
    def test_delete_file_not_exists(self, mock_storage):
        """Test deletion of non-existent file."""
        mock_storage.exists.return_value = False
        
        result = self.storage_manager.delete_file("datasets/2024/01/nonexistent.csv")
        
        self.assertTrue(result)  # Should return True even if file doesn't exist
        mock_storage.exists.assert_called_once_with("datasets/2024/01/nonexistent.csv")
        mock_storage.delete.assert_not_called()
    
    def test_generate_unique_filename(self):
        """Test unique filename generation."""
        original = "my_file.csv"
        
        with patch('uuid.uuid4') as mock_uuid:
            mock_uuid.return_value = Mock()
            mock_uuid.return_value.__str__ = Mock(return_value="12345678-1234-1234-1234-123456789012")
            
            result = self.storage_manager._generate_unique_filename(original)
        
        self.assertEqual(result, "12345678_my_file.csv")