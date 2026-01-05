"""
Unit tests for Dataset serializer file handling functionality.

Tests multipart form data processing, file validation integration,
and error handling for invalid uploads.
"""

from django.test import TestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory
from rest_framework import serializers
from unittest.mock import patch, MagicMock

from dataset.models import Dataset
from dataset.serializers import DatasetSerializer
from dataset.file_utils import FileValidator, FileStorageManager


class DatasetSerializerFileHandlingTests(TestCase):
    """Test suite for DatasetSerializer file handling functionality."""
    
    def setUp(self):
        """Set up test data and users."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create request factory for context
        self.factory = APIRequestFactory()
        
        # Test file contents
        self.valid_csv_content = "name,age,status\nJohn,25,1\nJane,30,0\n"
        
    def create_test_file(self, content, filename="test.csv", content_type="text/csv"):
        """Helper method to create test uploaded files."""
        return SimpleUploadedFile(
            filename,
            content.encode('utf-8'),
            content_type=content_type
        )
    
    def create_request_context(self, user=None):
        """Helper method to create request context for serializer."""
        request = self.factory.post('/api/datasets/')
        request.user = user or self.user
        return {'request': request}
    
    def test_serializer_accepts_multipart_data_with_file(self):
        """Test that serializer properly handles multipart form data with file upload."""
        test_file = self.create_test_file(self.valid_csv_content, "test_data.csv")
        
        data = {
            'dataset_name': 'Test Dataset',
            'notes': 'Test notes',
            'time_unit': 'month',
            'is_public': False,
            'file': test_file
        }
        
        context = self.create_request_context()
        serializer = DatasetSerializer(data=data, context=context)
        
        self.assertTrue(serializer.is_valid(), f"Serializer errors: {serializer.errors}")
        
        # Verify all fields are properly parsed
        validated_data = serializer.validated_data
        self.assertEqual(validated_data['dataset_name'], 'Test Dataset')
        self.assertEqual(validated_data['notes'], 'Test notes')
        self.assertEqual(validated_data['time_unit'], 'month')
        self.assertEqual(validated_data['is_public'], False)
        self.assertIn('file', validated_data)
        self.assertEqual(validated_data['file'].name, 'test_data.csv')
    
    def test_missing_file_error(self):
        """Test error handling when file is missing from upload."""
        data = {
            'dataset_name': 'No File Dataset',
            'time_unit': 'month',
            # Missing 'file' field
        }
        
        context = self.create_request_context()
        serializer = DatasetSerializer(data=data, context=context)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('file', serializer.errors)
        self.assertIn('required', str(serializer.errors['file']).lower())
    
    def test_invalid_time_unit_error(self):
        """Test error handling for invalid time_unit values."""
        test_file = self.create_test_file(self.valid_csv_content, "test.csv")
        
        data = {
            'dataset_name': 'Invalid Time Unit Test',
            'time_unit': 'invalid_unit',
            'file': test_file
        }
        
        context = self.create_request_context()
        serializer = DatasetSerializer(data=data, context=context)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('time_unit', serializer.errors)
    
    def test_duplicate_dataset_name_error(self):
        """Test error handling for duplicate dataset names for same user."""
        # Create first dataset
        Dataset.objects.create(
            dataset_name='Duplicate Name',
            owner=self.user,
            time_unit='month'
        )
        
        # Try to create second dataset with same name
        test_file = self.create_test_file(self.valid_csv_content, "test.csv")
        data = {
            'dataset_name': 'Duplicate Name',
            'time_unit': 'month',
            'file': test_file
        }
        
        context = self.create_request_context()
        serializer = DatasetSerializer(data=data, context=context)
        
        self.assertFalse(serializer.is_valid())
        self.assertIn('dataset_name', serializer.errors)
        self.assertIn('already have a dataset', str(serializer.errors['dataset_name']))