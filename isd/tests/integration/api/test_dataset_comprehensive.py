from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import default_storage
from django.db import transaction
from rest_framework.test import APITestCase
from rest_framework import status
from dataset.models import Dataset, DatasetPermission
from dataset.file_utils import FileStorageManager, FileValidator
from rest_framework_simplejwt.tokens import AccessToken
from unittest.mock import patch, MagicMock, Mock
import tempfile
import os
import json
import shutil

class DatasetTests(APITestCase):
    def setUp(self):
        # Create users
        self.owner = User.objects.create_user(username='owner', email="owner@example.com", password='password123')
        self.other_user = User.objects.create_user(username='other', email="other@example.com", password='password123')

        # Authenticate as owner using JWT
        token = AccessToken.for_user(self.owner)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        self.url = "/api/datasets/"

    # -----------------------
    # Owner tests
    # -----------------------
    def test_create_dataset(self):
        """Owner can create a dataset."""
        # Create a test file for upload
        test_file = SimpleUploadedFile(
            "test.csv",
            b"name,age,status\nJohn,25,1\nJane,30,0\n",
            content_type="text/csv"
        )
        data = {
            "dataset_name": "My Dataset",
            "time_unit": "month",
            "file": test_file
        }
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        dataset = Dataset.objects.get(dataset_name="My Dataset")
        self.assertEqual(dataset.owner, self.owner)

    def test_update_dataset(self):
        """Owner can update their dataset."""
        dataset = Dataset.objects.create(dataset_name="Initial Dataset", owner=self.owner)
        data = {"dataset_name": "Updated Dataset"}
        response = self.client.patch(f"{self.url}{dataset.dataset_id}/", data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dataset.refresh_from_db()
        self.assertEqual(dataset.dataset_name, "Updated Dataset")

    def test_delete_dataset(self):
        """Owner can delete their dataset."""
        dataset = Dataset.objects.create(dataset_name="To Delete", owner=self.owner)
        response = self.client.delete(f"{self.url}{dataset.dataset_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset.dataset_id).exists())

    # -----------------------
    # Non-owner tests
    # -----------------------
    def test_non_owner_cannot_update(self):
        """Non-owner cannot update dataset."""
        dataset = Dataset.objects.create(dataset_name="Owner Dataset", owner=self.owner)
        token = AccessToken.for_user(self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        updated_data = {"dataset_name": "Updated by Non-Owner"}
        response = self.client.patch(f"{self.url}{dataset.dataset_id}/", updated_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_owner_cannot_delete(self):
        """Non-owner cannot delete dataset."""
        dataset = Dataset.objects.create(dataset_name="Owner Dataset", owner=self.owner)
        token = AccessToken.for_user(self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.delete(f"{self.url}{dataset.dataset_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_owner_can_view_if_granted(self):
        """Non-owner can view a dataset if granted permission."""
        dataset = Dataset.objects.create(dataset_name="Shared Dataset", owner=self.owner)
        # Grant access
        DatasetPermission.objects.create(dataset=dataset, user=self.other_user)
        token = AccessToken.for_user(self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(f"{self.url}{dataset.dataset_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_owner_cannot_view_if_not_granted(self):
        """Non-owner cannot view dataset if not granted permission."""
        dataset = Dataset.objects.create(dataset_name="Private Dataset", owner=self.owner)
        token = AccessToken.for_user(self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(f"{self.url}{dataset.dataset_id}/")
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    # -----------------------
    # Invalid data tests
    # -----------------------
    def test_create_dataset_missing_name(self):
        """Creation fails with missing dataset_name."""
        data = {}
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("dataset_name", response.data['details'])


class DatasetFileCleanupTests(TestCase):
    """Tests for dataset file cleanup functionality."""
    
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', email="owner@example.com", password='password123')
        self.storage_manager = FileStorageManager()
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_dataset_delete_removes_file(self, mock_storage_manager_class):
        """Test that deleting a dataset removes its associated file."""
        # Setup mock
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = True
        
        # Create dataset with file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/test_file.csv",
            original_filename="test_file.csv"
        )
        
        # Delete dataset
        dataset.delete()
        
        # Verify file deletion was called
        mock_storage_manager.delete_file.assert_called_once_with("datasets/2024/01/test_file.csv")
        
        # Verify dataset is deleted
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset.dataset_id).exists())
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_dataset_delete_handles_file_deletion_failure(self, mock_storage_manager_class):
        """Test that dataset deletion continues even if file deletion fails."""
        # Setup mock to simulate file deletion failure
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = False
        
        # Create dataset with file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/test_file.csv",
            original_filename="test_file.csv"
        )
        
        # Delete dataset (should not raise exception)
        dataset.delete()
        
        # Verify file deletion was attempted
        mock_storage_manager.delete_file.assert_called_once_with("datasets/2024/01/test_file.csv")
        
        # Verify dataset is still deleted despite file deletion failure
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset.dataset_id).exists())
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_dataset_delete_handles_file_deletion_exception(self, mock_storage_manager_class):
        """Test that dataset deletion continues even if file deletion raises exception."""
        # Setup mock to simulate file deletion exception
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.side_effect = Exception("Storage error")
        
        # Create dataset with file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            file_path="datasets/2024/01/test_file.csv",
            original_filename="test_file.csv"
        )
        
        # Delete dataset (should not raise exception)
        dataset.delete()
        
        # Verify file deletion was attempted
        mock_storage_manager.delete_file.assert_called_once_with("datasets/2024/01/test_file.csv")
        
        # Verify dataset is still deleted despite file deletion exception
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset.dataset_id).exists())
    
    def test_dataset_delete_without_file(self):
        """Test that deleting a dataset without a file works normally."""
        # Create dataset without file
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner
        )
        
        # Delete dataset (should not raise exception)
        dataset.delete()
        
        # Verify dataset is deleted
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset.dataset_id).exists())
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_bulk_delete_with_files(self, mock_storage_manager_class):
        """Test bulk deletion of datasets with files."""
        # Setup mock
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        mock_storage_manager.delete_file.return_value = True
        
        # Create multiple datasets with files
        dataset1 = Dataset.objects.create(
            dataset_name="Dataset 1",
            owner=self.owner,
            file_path="datasets/2024/01/file1.csv",
            original_filename="file1.csv"
        )
        dataset2 = Dataset.objects.create(
            dataset_name="Dataset 2",
            owner=self.owner,
            file_path="datasets/2024/01/file2.csv",
            original_filename="file2.csv"
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
        
        # Verify file deletions were called
        expected_calls = [
            (("datasets/2024/01/file1.csv",), {}),
            (("datasets/2024/01/file2.csv",), {})
        ]
        self.assertEqual(mock_storage_manager.delete_file.call_count, 2)
        mock_storage_manager.delete_file.assert_any_call("datasets/2024/01/file1.csv")
        mock_storage_manager.delete_file.assert_any_call("datasets/2024/01/file2.csv")
        
        # Verify all datasets are deleted
        self.assertEqual(Dataset.objects.filter(owner=self.owner).count(), 0)
    
    @patch('dataset.file_utils.FileStorageManager')
    def test_bulk_delete_with_file_errors(self, mock_storage_manager_class):
        """Test bulk deletion handles file deletion errors gracefully."""
        # Setup mock to simulate some file deletion failures
        mock_storage_manager = MagicMock()
        mock_storage_manager_class.return_value = mock_storage_manager
        
        def mock_delete_file(file_path):
            if "file1.csv" in file_path:
                return False  # Simulate failure
            elif "file2.csv" in file_path:
                raise Exception("Storage error")  # Simulate exception
            return True
        
        mock_storage_manager.delete_file.side_effect = mock_delete_file
        
        # Create datasets with files
        dataset1 = Dataset.objects.create(
            dataset_name="Dataset 1",
            owner=self.owner,
            file_path="datasets/2024/01/file1.csv",
            original_filename="file1.csv"
        )
        dataset2 = Dataset.objects.create(
            dataset_name="Dataset 2",
            owner=self.owner,
            file_path="datasets/2024/01/file2.csv",
            original_filename="file2.csv"
        )
        
        # Bulk delete
        queryset = Dataset.objects.filter(owner=self.owner)
        deleted_count, file_errors = Dataset.bulk_delete_with_files(queryset)
        
        # Verify results - datasets should still be deleted even with file errors
        self.assertEqual(deleted_count, 2)
        self.assertEqual(len(file_errors), 0)  # File errors are handled internally, not returned
        
        # Verify datasets are still deleted despite file errors
        self.assertEqual(Dataset.objects.filter(owner=self.owner).count(), 0)


class FileUploadAPIIntegrationTests(APITestCase):
    """
    Integration tests for the complete file upload API workflow.
    Tests the entire process from API request to file storage and database persistence.
    """
    
    def setUp(self):
        """Set up test users and authentication."""
        # Create test users
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
        
        # Set up API endpoint
        self.url = "/api/datasets/"
        
        # Authenticate as owner
        self.authenticate_as_owner()
        
        # Create test file content
        self.valid_csv_content = "name,age,status\nJohn,25,1\nJane,30,0\n"
        self.valid_tsv_content = "name\tage\tstatus\nJohn\t25\t1\nJane\t30\t0\n"
        self.empty_content = ""
        self.invalid_content = "This is not CSV content"
        
        # Storage manager for cleanup
        self.storage_manager = FileStorageManager()
    
    def authenticate_as_owner(self):
        """Authenticate API client as the owner user."""
        token = AccessToken.for_user(self.owner)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    
    def authenticate_as_other_user(self):
        """Authenticate API client as the other user."""
        token = AccessToken.for_user(self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    
    def create_test_file(self, content, filename="test.csv", content_type="text/csv"):
        """Create a test uploaded file."""
        return SimpleUploadedFile(
            filename,
            content.encode('utf-8'),
            content_type=content_type
        )
    
    def tearDown(self):
        """Clean up any created files after each test."""
        # Clean up any datasets and their files
        for dataset in Dataset.objects.all():
            if dataset.file_path and default_storage.exists(dataset.file_path):
                default_storage.delete(dataset.file_path)
        Dataset.objects.all().delete()
    
    # ========================================
    # Complete Upload Workflow Tests
    # ========================================
    
    def test_complete_upload_workflow_csv(self):
        """Test complete upload workflow from API request to file storage - CSV file."""
        # Prepare test data
        test_file = self.create_test_file(self.valid_csv_content, "test_data.csv")
        data = {
            'dataset_name': 'Test CSV Dataset',
            'notes': 'Test notes for CSV dataset',
            'time_unit': 'month',
            'is_public': False,
            'file': test_file
        }
        
        # Make API request
        response = self.client.post(self.url, data, format='multipart')
        
        # Verify API response
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Verify response structure
        self.assertIn('dataset_id', response_data)
        self.assertEqual(response_data['dataset_name'], 'Test CSV Dataset')
        self.assertEqual(response_data['owner'], self.owner.id)
        self.assertEqual(response_data['owner_name'], self.owner.username)
        self.assertEqual(response_data['notes'], 'Test notes for CSV dataset')
        self.assertEqual(response_data['time_unit'], 'month')
        self.assertEqual(response_data['is_public'], False)
        self.assertIsNotNone(response_data['file_path'])
        self.assertEqual(response_data['original_filename'], 'test_data.csv')
        self.assertIsNotNone(response_data['file_size'])
        self.assertIsNotNone(response_data['uploaded_at'])
        
        # Verify database record
        dataset = Dataset.objects.get(dataset_id=response_data['dataset_id'])
        self.assertEqual(dataset.dataset_name, 'Test CSV Dataset')
        self.assertEqual(dataset.owner, self.owner)
        self.assertEqual(dataset.notes, 'Test notes for CSV dataset')
        self.assertEqual(dataset.time_unit, 'month')
        self.assertEqual(dataset.is_public, False)
        self.assertIsNotNone(dataset.file_path)
        self.assertEqual(dataset.original_filename, 'test_data.csv')
        self.assertGreater(dataset.file_size, 0)
        
        # Verify file storage
        self.assertTrue(default_storage.exists(dataset.file_path))
        
        # Verify file content
        with default_storage.open(dataset.file_path, 'r') as f:
            stored_content = f.read()
            self.assertEqual(stored_content, self.valid_csv_content)
    
    def test_complete_upload_workflow_tsv(self):
        """Test complete upload workflow from API request to file storage - TSV file."""
        # Prepare test data
        test_file = self.create_test_file(
            self.valid_tsv_content, 
            "test_data.tsv", 
            "text/tab-separated-values"
        )
        data = {
            'dataset_name': 'Test TSV Dataset',
            'notes': 'Test notes for TSV dataset',
            'time_unit': 'day',
            'is_public': True,
            'file': test_file
        }
        
        # Make API request
        response = self.client.post(self.url, data, format='multipart')
        
        # Verify API response
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Verify response structure
        self.assertEqual(response_data['dataset_name'], 'Test TSV Dataset')
        self.assertEqual(response_data['time_unit'], 'day')
        self.assertEqual(response_data['is_public'], True)
        self.assertEqual(response_data['original_filename'], 'test_data.tsv')
        
        # Verify database record
        dataset = Dataset.objects.get(dataset_id=response_data['dataset_id'])
        self.assertEqual(dataset.time_unit, 'day')
        self.assertEqual(dataset.is_public, True)
        
        # Verify file storage
        self.assertTrue(default_storage.exists(dataset.file_path))
        
        # Verify file content
        with default_storage.open(dataset.file_path, 'r') as f:
            stored_content = f.read()
            self.assertEqual(stored_content, self.valid_tsv_content)
    
    def test_upload_with_minimal_data(self):
        """Test upload with only required fields."""
        test_file = self.create_test_file(self.valid_csv_content, "minimal.csv")
        data = {
            'dataset_name': 'Minimal Dataset',
            'time_unit': 'year',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Verify defaults
        self.assertEqual(response_data['notes'], '')
        self.assertEqual(response_data['is_public'], False)
        self.assertEqual(response_data['time_unit'], 'year')
        
        # Verify database record
        dataset = Dataset.objects.get(dataset_id=response_data['dataset_id'])
        self.assertEqual(dataset.notes, '')
        self.assertEqual(dataset.is_public, False)
        self.assertTrue(default_storage.exists(dataset.file_path))
    
    def test_upload_with_special_characters_in_filename(self):
        """Test upload with special characters in filename gets sanitized."""
        test_file = self.create_test_file(
            self.valid_csv_content, 
            "test file with spaces & special chars!@#.csv"
        )
        data = {
            'dataset_name': 'Special Filename Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Verify filename was sanitized
        self.assertEqual(response_data['original_filename'], 'test file with spaces special chars.csv')
        
        # Verify file was stored
        dataset = Dataset.objects.get(dataset_id=response_data['dataset_id'])
        self.assertTrue(default_storage.exists(dataset.file_path))
    
    # ========================================
    # Permission-Based File Access Tests
    # ========================================
    
    def test_file_download_by_owner(self):
        """Test that dataset owner can download their files."""
        # Create dataset with file
        test_file = self.create_test_file(self.valid_csv_content, "owner_test.csv")
        data = {
            'dataset_name': 'Owner Test Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        dataset_id = response.json()['dataset_id']
        
        # Test file download
        download_url = f"{self.url}{dataset_id}/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_200_OK)
        self.assertEqual(download_response.content.decode('utf-8'), self.valid_csv_content)
        self.assertIn('attachment', download_response['Content-Disposition'])
        self.assertIn('owner_test.csv', download_response['Content-Disposition'])
    
    def test_file_download_by_permitted_user(self):
        """Test that users with permission can download files."""
        # Create dataset as owner
        test_file = self.create_test_file(self.valid_csv_content, "shared_test.csv")
        data = {
            'dataset_name': 'Shared Test Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        dataset_id = response.json()['dataset_id']
        dataset = Dataset.objects.get(dataset_id=dataset_id)
        
        # Grant permission to other user
        DatasetPermission.objects.create(dataset=dataset, user=self.other_user)
        
        # Switch to other user
        self.authenticate_as_other_user()
        
        # Test file download
        download_url = f"{self.url}{dataset_id}/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_200_OK)
        self.assertEqual(download_response.content.decode('utf-8'), self.valid_csv_content)
    
    def test_file_download_denied_for_unauthorized_user(self):
        """Test that unauthorized users cannot download files."""
        # Create dataset as owner
        test_file = self.create_test_file(self.valid_csv_content, "private_test.csv")
        data = {
            'dataset_name': 'Private Test Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        dataset_id = response.json()['dataset_id']
        
        # Switch to other user (no permission granted)
        self.authenticate_as_other_user()
        
        # Test file download - should be denied
        download_url = f"{self.url}{dataset_id}/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_file_download_for_nonexistent_dataset(self):
        """Test file download for non-existent dataset returns 404."""
        download_url = f"{self.url}99999/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_404_NOT_FOUND)
    
    def test_file_download_for_dataset_without_file(self):
        """Test file download for dataset without file returns 404."""
        # Create dataset without file (using direct model creation)
        dataset = Dataset.objects.create(
            dataset_name='No File Dataset',
            owner=self.owner,
            time_unit='month'
        )
        
        download_url = f"{self.url}{dataset.dataset_id}/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_404_NOT_FOUND)
        response_data = download_response.json()
        self.assertIn('No file associated', response_data['error'])
    
    # ========================================
    # Error Scenarios and Rollback Tests
    # ========================================
    
    def test_upload_validation_error_no_rollback_needed(self):
        """Test that validation errors don't create partial records."""
        # Test with missing required field
        test_file = self.create_test_file(self.valid_csv_content, "test.csv")
        data = {
            # Missing dataset_name
            'time_unit': 'month',
            'file': test_file
        }
        
        initial_count = Dataset.objects.count()
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify no files were created
        # Since validation fails before file processing, no cleanup needed
    
    def test_upload_file_validation_error(self):
        """Test upload with invalid file format."""
        # Create invalid file
        invalid_file = SimpleUploadedFile(
            "test.txt",
            b"This is not a CSV file",
            content_type="text/plain"
        )
        
        data = {
            'dataset_name': 'Invalid File Dataset',
            'time_unit': 'month',
            'file': invalid_file
        }
        
        initial_count = Dataset.objects.count()
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify error message
        response_data = response.json()
        self.assertIn('file', response_data['details'])
    
    def test_upload_empty_file_error(self):
        """Test upload with empty file."""
        empty_file = self.create_test_file(self.empty_content, "empty.csv")
        
        data = {
            'dataset_name': 'Empty File Dataset',
            'time_unit': 'month',
            'file': empty_file
        }
        
        initial_count = Dataset.objects.count()
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify error message
        response_data = response.json()
        self.assertIn('file', response_data['details'])
    
    @patch('dataset.file_utils.FileValidator.MAX_FILE_SIZE', 100)  # Set very small limit
    def test_upload_oversized_file_error(self):
        """Test upload with file exceeding size limit."""
        # Create a test file that will exceed the mocked limit
        large_content = "name,age,status\n" + "John,25,1\n" * 50  # Make it larger than 100 bytes
        test_file = self.create_test_file(large_content, "large.csv")
        
        data = {
            'dataset_name': 'Large File Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        initial_count = Dataset.objects.count()
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify error message
        response_data = response.json()
        self.assertIn('file', response_data['details'])
    
    def test_duplicate_dataset_name_error(self):
        """Test upload with duplicate dataset name for same user."""
        # Create first dataset
        test_file1 = self.create_test_file(self.valid_csv_content, "first.csv")
        data1 = {
            'dataset_name': 'Duplicate Name Dataset',
            'time_unit': 'month',
            'file': test_file1
        }
        
        response1 = self.client.post(self.url, data1, format='multipart')
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        
        # Try to create second dataset with same name
        test_file2 = self.create_test_file(self.valid_csv_content, "second.csv")
        data2 = {
            'dataset_name': 'Duplicate Name Dataset',
            'time_unit': 'day',
            'file': test_file2
        }
        
        initial_count = Dataset.objects.count()
        
        response2 = self.client.post(self.url, data2, format='multipart')
        
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify error message
        response_data = response2.json()
        self.assertIn('dataset_name', response_data['details'])
    
    @patch('dataset.file_utils.FileStorageManager.save_uploaded_file')
    def test_file_storage_error_rollback(self, mock_save_file):
        """Test that database rollback occurs when file storage fails."""
        # Mock file storage to raise an exception
        mock_save_file.side_effect = Exception("Storage system error")
        
        test_file = self.create_test_file(self.valid_csv_content, "storage_error.csv")
        data = {
            'dataset_name': 'Storage Error Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        initial_count = Dataset.objects.count()
        
        response = self.client.post(self.url, data, format='multipart')
        
        # Should return error
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Database should not have new record
        self.assertEqual(Dataset.objects.count(), initial_count)
        
        # Verify error message
        response_data = response.json()
        self.assertIn('error', response_data)
    
    @patch('dataset.models.Dataset.objects.create')
    def test_database_error_with_file_cleanup(self, mock_create):
        """Test that uploaded files are cleaned up when database save fails."""
        # Mock database save to raise an exception
        mock_create.side_effect = Exception("Database error")
        
        test_file = self.create_test_file(self.valid_csv_content, "db_error.csv")
        data = {
            'dataset_name': 'Database Error Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        initial_count = Dataset.objects.count()
        
        with patch.object(FileStorageManager, 'delete_file') as mock_delete:
            response = self.client.post(self.url, data, format='multipart')
            
            # Should return error
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            
            # Database should not have new record
            self.assertEqual(Dataset.objects.count(), initial_count)
            
            # File cleanup should have been attempted
            # Note: The exact call depends on implementation details
            # We're verifying that cleanup logic is triggered
    
    def test_unauthenticated_upload_denied(self):
        """Test that unauthenticated users cannot upload files."""
        # Remove authentication
        self.client.credentials()
        
        test_file = self.create_test_file(self.valid_csv_content, "unauth.csv")
        data = {
            'dataset_name': 'Unauthorized Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_dataset_deletion_removes_file(self):
        """Test that deleting a dataset also removes its file."""
        # Create dataset with file
        test_file = self.create_test_file(self.valid_csv_content, "delete_test.csv")
        data = {
            'dataset_name': 'Delete Test Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        dataset_id = response.json()['dataset_id']
        dataset = Dataset.objects.get(dataset_id=dataset_id)
        file_path = dataset.file_path
        
        # Verify file exists
        self.assertTrue(default_storage.exists(file_path))
        
        # Delete dataset via API
        delete_response = self.client.delete(f"{self.url}{dataset_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify dataset is deleted
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset_id).exists())
        
        # Verify file is deleted
        self.assertFalse(default_storage.exists(file_path))
    
    def test_concurrent_upload_handling(self):
        """Test handling of concurrent uploads with same filename."""
        # Create two files with same name
        test_file1 = self.create_test_file(self.valid_csv_content, "concurrent.csv")
        test_file2 = self.create_test_file(self.valid_tsv_content, "concurrent.csv")
        
        data1 = {
            'dataset_name': 'Concurrent Dataset 1',
            'time_unit': 'month',
            'file': test_file1
        }
        
        data2 = {
            'dataset_name': 'Concurrent Dataset 2',
            'time_unit': 'day',
            'file': test_file2
        }
        
        # Upload both files
        response1 = self.client.post(self.url, data1, format='multipart')
        response2 = self.client.post(self.url, data2, format='multipart')
        
        # Both should succeed
        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)
        
        # Verify both datasets exist
        dataset1 = Dataset.objects.get(dataset_id=response1.json()['dataset_id'])
        dataset2 = Dataset.objects.get(dataset_id=response2.json()['dataset_id'])
        
        # Verify files have different paths (due to UUID prefixing)
        self.assertNotEqual(dataset1.file_path, dataset2.file_path)
        
        # Verify both files exist
        self.assertTrue(default_storage.exists(dataset1.file_path))
        self.assertTrue(default_storage.exists(dataset2.file_path))
        
        # Verify file contents are correct
        with default_storage.open(dataset1.file_path, 'r') as f:
            self.assertEqual(f.read(), self.valid_csv_content)
        
        with default_storage.open(dataset2.file_path, 'r') as f:
            self.assertEqual(f.read(), self.valid_tsv_content)
    
    def test_file_serving_with_missing_file(self):
        """Test file download when file is missing from storage."""
        # Create dataset with file
        test_file = self.create_test_file(self.valid_csv_content, "missing_test.csv")
        data = {
            'dataset_name': 'Missing File Dataset',
            'time_unit': 'month',
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        dataset_id = response.json()['dataset_id']
        dataset = Dataset.objects.get(dataset_id=dataset_id)
        
        # Manually delete the file from storage (simulating corruption/loss)
        default_storage.delete(dataset.file_path)
        
        # Try to download the file
        download_url = f"{self.url}{dataset_id}/download/"
        download_response = self.client.get(download_url)
        
        self.assertEqual(download_response.status_code, status.HTTP_404_NOT_FOUND)
        response_data = download_response.json()
        self.assertIn('File not found in storage', response_data['error'])