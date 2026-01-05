"""
Unit tests for Dataset model functionality.
Tests model methods, file cleanup, and database operations.
"""

from django.test import TestCase
from django.contrib.auth.models import User
from unittest.mock import patch, MagicMock

from dataset.models import Dataset
from dataset.file_utils import FileStorageManager


class DatasetModelTests(TestCase):
    """Test suite for Dataset model functionality."""
    
    def setUp(self):
        self.owner = User.objects.create_user(
            username='testowner', 
            email='owner@example.com', 
            password='testpass123'
        )
    
    def test_dataset_creation(self):
        """Test basic dataset creation."""
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            time_unit='month'
        )
        
        self.assertEqual(dataset.dataset_name, "Test Dataset")
        self.assertEqual(dataset.owner, self.owner)
        self.assertEqual(dataset.time_unit, 'month')
        self.assertFalse(dataset.is_public)
        self.assertEqual(dataset.notes, '')
    
    def test_dataset_str_representation(self):
        """Test dataset string representation."""
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner
        )
        
        expected = f"Test Dataset ({self.owner.username})"
        self.assertEqual(str(dataset), expected)
    
    def test_has_file_method(self):
        """Test has_file method."""
        # Dataset without file
        dataset_no_file = Dataset.objects.create(
            dataset_name="No File Dataset",
            owner=self.owner
        )
        self.assertFalse(dataset_no_file.has_file())
        
        # Dataset with file
        dataset_with_file = Dataset.objects.create(
            dataset_name="With File Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/test.csv",
            original_filename="test.csv"
        )
        self.assertTrue(dataset_with_file.has_file())
    
    def test_get_file_size_display(self):
        """Test file size display formatting."""
        dataset = Dataset.objects.create(
            dataset_name="Size Test Dataset",
            owner=self.owner,
            file_size=1024
        )
        
        self.assertEqual(dataset.get_file_size_display(), "1.0 KB")
        
        # Test with no file size
        dataset_no_size = Dataset.objects.create(
            dataset_name="No Size Dataset",
            owner=self.owner
        )
        self.assertEqual(dataset_no_size.get_file_size_display(), "Unknown size")
    
    def test_get_file_display_name(self):
        """Test file display name method."""
        # Dataset with original filename
        dataset_with_file = Dataset.objects.create(
            dataset_name="With File Dataset",
            owner=self.owner,
            original_filename="my_data.csv"
        )
        self.assertEqual(dataset_with_file.get_file_display_name(), "my_data.csv")
        
        # Dataset without file
        dataset_no_file = Dataset.objects.create(
            dataset_name="No File Dataset",
            owner=self.owner
        )
        self.assertEqual(dataset_no_file.get_file_display_name(), "No file uploaded")


class DatasetFileDeletionTests(TestCase):
    """Tests for file deletion when datasets are removed."""
    
    def setUp(self):
        self.owner = User.objects.create_user(
            username='testowner', 
            email='owner@example.com', 
            password='testpass123'
        )
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_dataset_delete_removes_file_success(self, mock_storage_manager_class):
        """Test that deleting a dataset successfully removes its associated file."""
        # Setup mock
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = True
        
        # Create dataset with file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/abc12345_test_file.csv",
            original_filename="test_file.csv",
            file_size=1024
        )
        dataset_id = dataset.dataset_id
        
        # Delete dataset
        dataset.delete()
        
        # Verify file deletion was called with correct path
        mock_storage_manager.delete_file.assert_called_once_with("datasets/2024/01/abc12345_test_file.csv")
        
        # Verify dataset is deleted from database
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset_id).exists())
    
    @patch('dataset.file_utils.FileStorageManager')
    @patch('dataset.models.logger')
    def test_dataset_delete_handles_file_deletion_failure(self, mock_logger, mock_storage_manager_class):
        """Test that dataset deletion continues even if file deletion fails."""
        # Setup mock to simulate file deletion failure
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = False
        
        # Create dataset with file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/abc12345_test_file.csv",
            original_filename="test_file.csv",
            file_size=1024
        )
        dataset_id = dataset.dataset_id
        
        # Delete dataset (should not raise exception)
        dataset.delete()
        
        # Verify file deletion was attempted
        mock_storage_manager.delete_file.assert_called_once_with("datasets/2024/01/abc12345_test_file.csv")
        
        # Verify warning was logged
        mock_logger.warning.assert_called_once()
        warning_call = mock_logger.warning.call_args[0][0]
        self.assertIn("Failed to delete file", warning_call)
        self.assertIn("datasets/2024/01/abc12345_test_file.csv", warning_call)
        
        # Verify dataset is still deleted despite file deletion failure
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset_id).exists())
    
    def test_dataset_delete_without_file_path(self):
        """Test that deleting a dataset without a file path works normally."""
        # Create dataset without file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner
            # No file_path set
        )
        dataset_id = dataset.dataset_id
        
        # Delete dataset (should not raise exception)
        dataset.delete()
        
        # Verify dataset is deleted
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset_id).exists())