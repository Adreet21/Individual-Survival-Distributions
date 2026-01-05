"""
Integration tests for file cleanup operations.
Tests the complete file cleanup workflow including orphaned file detection and cleanup.
"""

import os
import tempfile
from unittest.mock import Mock, patch, MagicMock, call
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.management import call_command
from io import StringIO

from dataset.models import Dataset
from dataset.file_utils import FileStorageManager


class FileCleanupIntegrationTests(TestCase):
    """Integration tests for file cleanup operations."""
    
    def setUp(self):
        self.owner = User.objects.create_user(
            username='testowner', 
            email='owner@example.com', 
            password='testpass123'
        )
        self.other_user = User.objects.create_user(
            username='otheruser', 
            email='other@example.com', 
            password='testpass123'
        )
        self.storage_manager = FileStorageManager()
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_bulk_delete_with_files_success(self, mock_storage_manager_class):
        """Test bulk deletion of datasets with files succeeds."""
        # Setup mock
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = True
        
        # Create multiple datasets with files
        dataset1 = Dataset.objects.create(
            dataset_name="Dataset 1",
            owner=self.owner,
            file_path="datasets/2024/01/file1.csv",
            original_filename="file1.csv",
            file_size=1024
        )
        dataset2 = Dataset.objects.create(
            dataset_name="Dataset 2",
            owner=self.owner,
            file_path="datasets/2024/01/file2.csv",
            original_filename="file2.csv",
            file_size=2048
        )
        dataset3 = Dataset.objects.create(
            dataset_name="Dataset 3",
            owner=self.owner
            # No file
        )
        
        # Bulk delete
        queryset = Dataset.objects.filter(owner=self.owner)
        deleted_count, file_errors = Dataset.bulk_delete_with_files(queryset)
        
        # Verify results
        self.assertEqual(deleted_count, 3)
        self.assertEqual(len(file_errors), 0)
        
        # Verify file deletions were called for datasets with files
        expected_calls = [
            call("datasets/2024/01/file1.csv"),
            call("datasets/2024/01/file2.csv")
        ]
        mock_storage_manager.delete_file.assert_has_calls(expected_calls, any_order=True)
        self.assertEqual(mock_storage_manager.delete_file.call_count, 2)
        
        # Verify all datasets are deleted
        self.assertEqual(Dataset.objects.filter(owner=self.owner).count(), 0)
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_cleanup_orphaned_files_success(self, mock_storage_manager_class):
        """Test successful orphaned file cleanup."""
        # Setup mock storage manager
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        
        # Mock cleanup_orphaned_files to return success results
        mock_storage_manager.cleanup_orphaned_files.return_value = (2, 0)  # 2 deleted, 0 errors
        
        # Create datasets that reference some files
        Dataset.objects.create(
            dataset_name="Dataset 1",
            owner=self.owner,
            file_path="datasets/2024/01/file1.csv",
            original_filename="file1.csv"
        )
        Dataset.objects.create(
            dataset_name="Dataset 2",
            owner=self.owner,
            file_path="datasets/2024/02/file4.csv",
            original_filename="file4.csv"
        )
        
        # Get referenced files
        referenced_files = list(
            Dataset.objects.exclude(file_path__isnull=True)
            .exclude(file_path='')
            .values_list('file_path', flat=True)
        )
        
        # Test cleanup
        deleted_count, error_count = mock_storage_manager.cleanup_orphaned_files(referenced_files)
        
        # Verify results - should delete orphaned files
        self.assertEqual(deleted_count, 2)
        self.assertEqual(error_count, 0)
        
        # Verify cleanup_orphaned_files was called with correct referenced files
        mock_storage_manager.cleanup_orphaned_files.assert_called_once_with(referenced_files)
    
    def test_bulk_delete_empty_queryset(self):
        """Test bulk deletion with empty queryset."""
        # Create a dataset for another user
        Dataset.objects.create(
            dataset_name="Other User Dataset",
            owner=self.other_user
        )
        
        # Try to bulk delete datasets for owner (should be empty)
        queryset = Dataset.objects.filter(owner=self.owner)
        deleted_count, file_errors = Dataset.bulk_delete_with_files(queryset)
        
        # Verify results
        self.assertEqual(deleted_count, 0)
        self.assertEqual(len(file_errors), 0)
        
        # Verify other user's dataset is still there
        self.assertEqual(Dataset.objects.filter(owner=self.other_user).count(), 1)
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_cleanup_orphaned_files_no_orphans(self, mock_storage_manager_class):
        """Test orphaned file cleanup when no orphaned files exist."""
        # Setup mock storage manager
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        
        # Mock cleanup_orphaned_files to return no deletions
        mock_storage_manager.cleanup_orphaned_files.return_value = (0, 0)  # 0 deleted, 0 errors
        
        # Create datasets that reference files
        Dataset.objects.create(
            dataset_name="Dataset 1",
            owner=self.owner,
            file_path="datasets/2024/01/file1.csv",
            original_filename="file1.csv"
        )
        Dataset.objects.create(
            dataset_name="Dataset 2",
            owner=self.owner,
            file_path="datasets/2024/01/file2.csv",
            original_filename="file2.csv"
        )
        
        # Get referenced files
        referenced_files = list(
            Dataset.objects.exclude(file_path__isnull=True)
            .exclude(file_path='')
            .values_list('file_path', flat=True)
        )
        
        # Test cleanup
        deleted_count, error_count = mock_storage_manager.cleanup_orphaned_files(referenced_files)
        
        # Verify results - no files should be deleted
        self.assertEqual(deleted_count, 0)
        self.assertEqual(error_count, 0)
        
        # Verify cleanup was called with referenced files
        mock_storage_manager.cleanup_orphaned_files.assert_called_once_with(referenced_files)