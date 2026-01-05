"""
File validation and storage utilities for dataset uploads.
"""

import os
import uuid
import re
from datetime import datetime
from pathlib import Path
from django.core.exceptions import ValidationError
from django.conf import settings
from django.core.files.storage import default_storage


class FileValidator:
    """Validates uploaded files for dataset creation."""
    
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB in bytes
    ALLOWED_EXTENSIONS = ['.csv', '.tsv']
    ALLOWED_MIME_TYPES = ['text/csv', 'text/tab-separated-values', 'text/plain']
    
    def __init__(self):
        self.errors = []
    
    def validate_file(self, uploaded_file):
        """
        Validate an uploaded file for dataset creation.
        
        Args:
            uploaded_file: Django UploadedFile object
            
        Returns:
            bool: True if file is valid
            
        Raises:
            ValidationError: If file validation fails
        """
        self.errors = []
        
        # Validate file exists and has content
        if not uploaded_file:
            self.errors.append("No file provided")
        else:
            self._validate_file_size(uploaded_file)
            self._validate_file_extension(uploaded_file)
            self._validate_file_content(uploaded_file)
            self._validate_filename_security(uploaded_file)
        
        if self.errors:
            raise ValidationError(self.errors)
        
        return True
    
    def _validate_file_size(self, uploaded_file):
        """Validate file size is within limits."""
        if uploaded_file.size > self.MAX_FILE_SIZE:
            size_mb = uploaded_file.size / (1024 * 1024)
            max_size_mb = self.MAX_FILE_SIZE / (1024 * 1024)
            self.errors.append(
                f"File size ({size_mb:.1f}MB) exceeds maximum limit of {max_size_mb}MB"
            )
        
        if uploaded_file.size == 0:
            self.errors.append("File is empty")
    
    def _validate_file_extension(self, uploaded_file):
        """Validate file has an allowed extension."""
        filename = uploaded_file.name.lower()
        file_ext = os.path.splitext(filename)[1]
        
        if file_ext not in self.ALLOWED_EXTENSIONS:
            allowed_exts = ', '.join(self.ALLOWED_EXTENSIONS)
            self.errors.append(
                f"File extension '{file_ext}' not allowed. Allowed extensions: {allowed_exts}"
            )
    
    def _validate_file_content(self, uploaded_file):
        """Validate file content is not empty and appears to be CSV/TSV."""
        try:
            # Read first few bytes to check if file has content
            uploaded_file.seek(0)
            first_chunk = uploaded_file.read(1024).decode('utf-8', errors='ignore')
            uploaded_file.seek(0)  # Reset file pointer
            
            if not first_chunk.strip():
                self.errors.append("File appears to be empty or contains no readable content")
                return
            
            # Basic check for CSV/TSV structure (should have some delimiters)
            has_commas = ',' in first_chunk
            has_tabs = '\t' in first_chunk
            
            if not (has_commas or has_tabs):
                self.errors.append(
                    "File does not appear to be a valid CSV or TSV file (no delimiters found)"
                )
        
        except UnicodeDecodeError:
            self.errors.append("File contains invalid characters and cannot be read as text")
        except Exception as e:
            self.errors.append(f"Error reading file content: {str(e)}")
    
    def _validate_filename_security(self, uploaded_file):
        """Validate filename for security issues."""
        filename = uploaded_file.name
        
        # Check for path traversal attempts
        if '..' in filename or '/' in filename or '\\' in filename:
            self.errors.append("Filename contains invalid path characters")
        
        # Check for null bytes
        if '\x00' in filename:
            self.errors.append("Filename contains null bytes")
        
        # Check filename length
        if len(filename) > 255:
            self.errors.append("Filename is too long (maximum 255 characters)")
        
        # Check for empty filename
        if not filename.strip():
            self.errors.append("Filename is empty")
    
    @staticmethod
    def sanitize_filename(filename):
        """
        Sanitize filename to prevent security issues.
        
        Args:
            filename (str): Original filename
            
        Returns:
            str: Sanitized filename
        """
        if not filename:
            return "unnamed_file"
        
        # Remove path components
        filename = os.path.basename(filename)
        
        # Remove or replace dangerous characters
        # Keep only alphanumeric, dots, hyphens, underscores, and spaces
        filename = re.sub(r'[^\w\s.-]', '', filename)
        
        # Replace multiple spaces with single space
        filename = re.sub(r'\s+', ' ', filename)
        
        # Remove leading/trailing whitespace and dots
        filename = filename.strip(' .')
        
        # Ensure filename is not empty after sanitization
        if not filename:
            filename = "unnamed_file"
        
        # Truncate if too long (leave room for extension)
        if len(filename) > 200:
            name, ext = os.path.splitext(filename)
            filename = name[:200-len(ext)] + ext
        
        return filename


class FileStorageManager:
    """Manages file storage operations for dataset uploads."""
    
    def __init__(self):
        self.base_path = 'datasets'
    
    def save_uploaded_file(self, uploaded_file, original_filename=None):
        """
        Save an uploaded file to the storage system.
        
        Args:
            uploaded_file: Django UploadedFile object
            original_filename (str, optional): Original filename to preserve
            
        Returns:
            tuple: (relative_file_path, sanitized_original_filename)
        """
        # Sanitize the original filename
        if original_filename is None:
            original_filename = uploaded_file.name
        
        sanitized_filename = FileValidator.sanitize_filename(original_filename)
        
        # Generate unique filename with UUID
        unique_filename = self._generate_unique_filename(sanitized_filename)
        
        # Create directory structure (year/month)
        directory_path = self._get_directory_path()
        
        # Full relative path for storage
        relative_path = os.path.join(directory_path, unique_filename)
        
        # Save the file
        saved_path = default_storage.save(relative_path, uploaded_file)
        
        return saved_path, sanitized_filename
    
    def delete_file(self, file_path):
        """
        Delete a file from storage.
        
        Args:
            file_path (str): Relative path to the file
            
        Returns:
            bool: True if file was deleted successfully
        """
        if not file_path:
            return True
        
        try:
            if default_storage.exists(file_path):
                default_storage.delete(file_path)
                return True
            return True  # File doesn't exist, consider it "deleted"
        except Exception as e:
            # Log the error but don't raise it to prevent cascade failures
            print(f"Error deleting file {file_path}: {str(e)}")
            return False
    
    def get_file_path(self, relative_path):
        """
        Get the full file system path for a relative path.
        
        Args:
            relative_path (str): Relative path from MEDIA_ROOT
            
        Returns:
            str: Full file system path
        """
        return default_storage.path(relative_path)
    
    def file_exists(self, relative_path):
        """
        Check if a file exists in storage.
        
        Args:
            relative_path (str): Relative path to check
            
        Returns:
            bool: True if file exists
        """
        if not relative_path:
            return False
        return default_storage.exists(relative_path)
    
    def get_file_size(self, relative_path):
        """
        Get the size of a file in storage.
        
        Args:
            relative_path (str): Relative path to the file
            
        Returns:
            int: File size in bytes, or None if file doesn't exist
        """
        try:
            return default_storage.size(relative_path)
        except Exception:
            return None
    
    def get_full_path(self, relative_path):
        """
        Get the full file system path for a relative path.
        
        Args:
            relative_path (str): Relative path from storage root
            
        Returns:
            str: Full file system path
        """
        return default_storage.path(relative_path)
    
    def copy_file(self, source_path, destination_path):
        """
        Copy a file within the storage system.
        
        Args:
            source_path (str): Relative path to source file
            destination_path (str): Relative path for destination file
            
        Returns:
            bool: True if file was copied successfully
        """
        try:
            if not default_storage.exists(source_path):
                return False
            
            # Read source file
            with default_storage.open(source_path, 'rb') as source_file:
                # Save to destination
                default_storage.save(destination_path, source_file)
            
            return True
        except Exception as e:
            print(f"Error copying file from {source_path} to {destination_path}: {str(e)}")
            return False
    
    def cleanup_orphaned_files(self, existing_file_paths):
        """
        Remove files that are not referenced by any dataset.
        
        Args:
            existing_file_paths (list): List of file paths that should be kept
            
        Returns:
            tuple: (deleted_count, error_count)
        """
        deleted_count = 0
        error_count = 0
        
        try:
            # Get all files in the datasets directory
            datasets_path = self.base_path
            if default_storage.exists(datasets_path):
                all_files = self._get_all_files_recursive(datasets_path)
                
                for file_path in all_files:
                    if file_path not in existing_file_paths:
                        if self.delete_file(file_path):
                            deleted_count += 1
                        else:
                            error_count += 1
        
        except Exception as e:
            print(f"Error during orphaned file cleanup: {str(e)}")
            error_count += 1
        
        return deleted_count, error_count
    
    def _generate_unique_filename(self, original_filename):
        """Generate a unique filename using UUID prefix."""
        name, ext = os.path.splitext(original_filename)
        unique_id = str(uuid.uuid4())[:8]  # Use first 8 characters of UUID
        return f"{unique_id}_{name}{ext}"
    
    def _get_directory_path(self):
        """Get directory path organized by year/month."""
        now = datetime.now()
        return os.path.join(
            self.base_path,
            str(now.year),
            f"{now.month:02d}"
        )
    
    def _get_all_files_recursive(self, directory_path):
        """
        Recursively get all files in a directory.
        
        Args:
            directory_path (str): Directory to search
            
        Returns:
            list: List of relative file paths
        """
        files = []
        try:
            dirs, filenames = default_storage.listdir(directory_path)
            
            # Add files in current directory
            for filename in filenames:
                files.append(os.path.join(directory_path, filename))
            
            # Recursively process subdirectories
            for dirname in dirs:
                subdir_path = os.path.join(directory_path, dirname)
                files.extend(self._get_all_files_recursive(subdir_path))
        
        except Exception as e:
            print(f"Error listing directory {directory_path}: {str(e)}")
        
        return files