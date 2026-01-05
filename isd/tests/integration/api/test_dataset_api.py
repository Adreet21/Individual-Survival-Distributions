"""
Integration tests for Dataset API endpoints.
Tests the complete API workflow including file uploads, downloads, and CRUD operations.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.files.storage import default_storage
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken
from unittest.mock import patch

from dataset.models import Dataset, DatasetPermission
from dataset.file_utils import FileStorageManager


class DatasetAPIIntegrationTests(APITestCase):
    """Integration tests for Dataset API endpoints."""
    
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
    
    def test_create_dataset_with_file_upload(self):
        """Test creating a dataset with file upload."""
        test_file = self.create_test_file(self.valid_csv_content, "test_data.csv")
        data = {
            'dataset_name': 'Test CSV Dataset',
            'notes': 'Test notes for CSV dataset',
            'time_unit': 'month',
            'is_public': False,
            'file': test_file
        }
        
        response = self.client.post(self.url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Verify response structure
        self.assertIn('dataset_id', response_data)
        self.assertEqual(response_data['dataset_name'], 'Test CSV Dataset')
        self.assertEqual(response_data['owner'], self.owner.id)
        self.assertEqual(response_data['notes'], 'Test notes for CSV dataset')
        self.assertEqual(response_data['time_unit'], 'month')
        self.assertEqual(response_data['is_public'], False)
        self.assertIsNotNone(response_data['file_path'])
        self.assertEqual(response_data['original_filename'], 'test_data.csv')
        
        # Verify database record
        dataset = Dataset.objects.get(dataset_id=response_data['dataset_id'])
        self.assertEqual(dataset.dataset_name, 'Test CSV Dataset')
        self.assertEqual(dataset.owner, self.owner)
        self.assertTrue(default_storage.exists(dataset.file_path))
    
    def test_list_datasets(self):
        """Test listing datasets."""
        # Create a dataset
        Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            time_unit='month'
        )
        
        response = self.client.get(self.url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['dataset_name'], "Test Dataset")
    
    def test_retrieve_dataset(self):
        """Test retrieving a specific dataset."""
        dataset = Dataset.objects.create(
            dataset_name="Test Dataset",
            owner=self.owner,
            time_unit='month'
        )
        
        response = self.client.get(f"{self.url}{dataset.dataset_id}/")
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['dataset_name'], "Test Dataset")
    
    def test_update_dataset(self):
        """Test updating a dataset."""
        dataset = Dataset.objects.create(
            dataset_name="Original Name",
            owner=self.owner,
            time_unit='month'
        )
        
        data = {
            'dataset_name': 'Updated Name',
            'notes': 'Updated notes'
        }
        
        response = self.client.patch(f"{self.url}{dataset.dataset_id}/", data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dataset.refresh_from_db()
        self.assertEqual(dataset.dataset_name, 'Updated Name')
        self.assertEqual(dataset.notes, 'Updated notes')
    
    def test_delete_dataset(self):
        """Test deleting a dataset."""
        dataset = Dataset.objects.create(
            dataset_name="To Delete",
            owner=self.owner,
            time_unit='month'
        )
        dataset_id = dataset.dataset_id
        
        response = self.client.delete(f"{self.url}{dataset_id}/")
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Dataset.objects.filter(dataset_id=dataset_id).exists())
    
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
    
    def test_unauthenticated_access_denied(self):
        """Test that unauthenticated users cannot access the API."""
        # Remove authentication
        self.client.credentials()
        
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_permission_based_access(self):
        """Test permission-based access to datasets."""
        # Create dataset as owner
        dataset = Dataset.objects.create(
            dataset_name="Shared Dataset",
            owner=self.owner,
            time_unit='month'
        )
        
        # Grant permission to other user
        DatasetPermission.objects.create(dataset=dataset, user=self.other_user)
        
        # Switch to other user
        self.authenticate_as_other_user()
        
        # Should be able to view the dataset
        response = self.client.get(f"{self.url}{dataset.dataset_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # But should not be able to update it
        response = self.client.patch(f"{self.url}{dataset.dataset_id}/", {'notes': 'Hacked'})
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])