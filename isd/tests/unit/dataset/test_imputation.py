"""
Unit tests for feature imputation functionality.
"""
import pandas as pd
import numpy as np
import tempfile
import os
from unittest.mock import patch, MagicMock

# Only import Django components if Django is properly configured
try:
    import django
    from django.test import TestCase
    from django.contrib.auth.models import User
    from dataset.models import Dataset
    from dataset.tasks import process_feature_imputation, validate_dataset_for_imputation
    DJANGO_AVAILABLE = True
except (ImportError, django.core.exceptions.ImproperlyConfigured):
    DJANGO_AVAILABLE = False
    TestCase = object  # Fallback for when Django isn't available


class FeatureImputationTestCase(TestCase if DJANGO_AVAILABLE else object):
    """Test cases for feature imputation functionality."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        self.dataset = Dataset.objects.create(
            dataset_name='Test Dataset',
            owner=self.user,
            file_path='test/path/test_file.csv',
            original_filename='test_file.csv',
            file_size=1024,
            is_public=False
        )
    
    def test_imputation_logic_with_sample_data(self):
        """Test the core imputation logic with sample data."""
        
        # Create sample data with missing values
        data = {
            'numeric_col1': [1.0, 2.0, np.nan, 4.0, 5.0],
            'numeric_col2': [10.0, np.nan, 30.0, np.nan, 50.0],
            'categorical_col': ['A', 'B', np.nan, 'A', 'B'],
            'complete_col': [100, 200, 300, 400, 500]
        }
        
        df = pd.DataFrame(data)
        
        # Store original missing count
        original_missing = df.isnull().sum().sum()
        self.assertGreater(original_missing, 0, "Test data should have missing values")
        
        # Process numeric columns
        imputed_columns = []
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        for col in numeric_columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                mean_value = df[col].mean()
                df[col] = df[col].fillna(mean_value)
                imputed_columns.append({
                    'column': col,
                    'type': 'numeric',
                    'missing_count': int(missing_count),
                    'imputed_with': 'mean',
                    'imputed_value': float(mean_value)
                })
        
        # Process categorical columns
        categorical_columns = df.select_dtypes(include=['object']).columns
        for col in categorical_columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                mode_value = df[col].mode()
                if len(mode_value) > 0:
                    df[col] = df[col].fillna(mode_value[0])
                    imputed_columns.append({
                        'column': col,
                        'type': 'categorical',
                        'missing_count': int(missing_count),
                        'imputed_with': 'mode',
                        'imputed_value': str(mode_value[0])
                    })
        
        # Verify imputation worked
        final_missing = df.isnull().sum().sum()
        self.assertEqual(final_missing, 0, "All missing values should be imputed")
        
        # Verify specific imputed values
        self.assertEqual(len(imputed_columns), 3, "Should have imputed 3 columns")
        
        # Check numeric imputation
        numeric_imputed = [col for col in imputed_columns if col['type'] == 'numeric']
        self.assertEqual(len(numeric_imputed), 2, "Should have imputed 2 numeric columns")
        
        # Check categorical imputation
        categorical_imputed = [col for col in imputed_columns if col['type'] == 'categorical']
        self.assertEqual(len(categorical_imputed), 1, "Should have imputed 1 categorical column")
        
        print("✅ Imputation logic test passed!")
        print(f"Original missing values: {original_missing}")
        print(f"Final missing values: {final_missing}")
        print(f"Imputed columns: {[col['column'] for col in imputed_columns]}")
    
    @patch('dataset.tasks.FileStorageManager')
    @patch('pandas.read_csv')
    def test_process_feature_imputation_success(self, mock_read_csv, mock_storage_manager):
        """Test successful feature imputation process."""
        
        # Mock the file storage manager
        mock_storage = MagicMock()
        mock_storage_manager.return_value = mock_storage
        mock_storage.get_full_path.return_value = '/fake/path/test_file.csv'
        mock_storage.file_exists.return_value = True
        mock_storage.copy_file.return_value = True
        mock_storage.get_file_size.return_value = 2048
        
        # Create sample DataFrame with missing values
        sample_data = pd.DataFrame({
            'col1': [1.0, 2.0, np.nan, 4.0],
            'col2': ['A', np.nan, 'B', 'A']
        })
        mock_read_csv.return_value = sample_data
        
        # Mock DataFrame.to_csv method
        with patch.object(pd.DataFrame, 'to_csv'):
            result = process_feature_imputation(self.dataset.dataset_id)
        
        # Verify result
        self.assertTrue(result['success'])
        self.assertIn('details', result)
        self.assertEqual(result['details']['missing_values_before'], 2)
        self.assertEqual(result['details']['missing_values_after'], 0)
        self.assertEqual(len(result['details']['imputed_columns']), 2)
        
        print("✅ Process feature imputation test passed!")
    
    @patch('dataset.tasks.FileStorageManager')
    def test_process_feature_imputation_no_file(self, mock_storage_manager):
        """Test imputation when dataset has no file."""
        
        # Create dataset without file
        dataset_no_file = Dataset.objects.create(
            dataset_name='No File Dataset',
            owner=self.user,
            file_path=None,
            is_public=False
        )
        
        result = process_feature_imputation(dataset_no_file.dataset_id)
        
        self.assertFalse(result['success'])
        self.assertIn('No file associated', result['error'])
        
        print("✅ No file test passed!")
    
    def test_process_feature_imputation_nonexistent_dataset(self):
        """Test imputation with non-existent dataset."""
        
        result = process_feature_imputation(99999)  # Non-existent ID
        
        self.assertFalse(result['success'])
        self.assertIn('not found', result['error'])
        
        print("✅ Non-existent dataset test passed!")
    
    @patch('dataset.tasks.FileStorageManager')
    @patch('pandas.read_csv')
    def test_validate_dataset_for_imputation(self, mock_read_csv, mock_storage_manager):
        """Test dataset validation for imputation."""
        
        # Mock the file storage manager
        mock_storage = MagicMock()
        mock_storage_manager.return_value = mock_storage
        mock_storage.get_full_path.return_value = '/fake/path/test_file.csv'
        
        # Create sample DataFrame with missing values
        sample_data = pd.DataFrame({
            'col1': [1.0, 2.0, np.nan, 4.0, 5.0],  # 1 missing
            'col2': ['A', 'B', 'C', 'D', 'E'],     # 0 missing
            'col3': [np.nan, np.nan, 3.0, 4.0, 5.0]  # 2 missing
        })
        mock_read_csv.return_value = sample_data
        
        result = validate_dataset_for_imputation(self.dataset.dataset_id)
        
        self.assertTrue(result['valid'])
        self.assertIn('details', result)
        
        details = result['details']
        self.assertEqual(details['total_rows'], 5)
        self.assertEqual(details['total_columns'], 3)
        self.assertEqual(details['total_missing_values'], 3)
        self.assertTrue(details['has_missing_values'])
        self.assertEqual(len(details['columns_with_missing']), 2)
        
        print("✅ Validation test passed!")
        print(f"Total missing values: {details['total_missing_values']}")
        print(f"Missing percentage: {details['missing_percentage']}%")


def run_simple_imputation_test():
    """Run a simple standalone test of the imputation logic."""
    print("🧪 Running simple imputation logic test...")
    
    # Create sample data with missing values
    data = {
        'numeric_col1': [1.0, 2.0, np.nan, 4.0, 5.0],
        'numeric_col2': [10.0, np.nan, 30.0, np.nan, 50.0],
        'categorical_col': ['A', 'B', np.nan, 'A', 'B'],
        'complete_col': [100, 200, 300, 400, 500]
    }
    
    df = pd.DataFrame(data)
    
    print("\n📊 Original data:")
    print(df)
    print(f"\n❌ Missing values per column:")
    print(df.isnull().sum())
    
    original_missing = df.isnull().sum().sum()
    
    # Test numeric imputation
    numeric_columns = df.select_dtypes(include=[np.number]).columns
    imputed_info = []
    
    for col in numeric_columns:
        missing_count = df[col].isnull().sum()
        if missing_count > 0:
            mean_value = df[col].mean()
            df[col] = df[col].fillna(mean_value)
            imputed_info.append(f"  • {col}: {missing_count} values → mean = {mean_value:.2f}")
    
    # Test categorical imputation
    categorical_columns = df.select_dtypes(include=['object']).columns
    for col in categorical_columns:
        missing_count = df[col].isnull().sum()
        if missing_count > 0:
            mode_value = df[col].mode()
            if len(mode_value) > 0:
                df[col] = df[col].fillna(mode_value[0])
                imputed_info.append(f"  • {col}: {missing_count} values → mode = '{mode_value[0]}'")
    
    print(f"\n🔧 Imputation performed:")
    for info in imputed_info:
        print(info)
    
    print(f"\n📊 Data after imputation:")
    print(df)
    
    final_missing = df.isnull().sum().sum()
    print(f"\n✅ Missing values: {original_missing} → {final_missing}")
    
    if final_missing == 0:
        print("🎉 SUCCESS: All missing values have been imputed!")
        return True
    else:
        print("❌ FAILED: Some missing values remain!")
        return False


if __name__ == "__main__":
    # Run the simple test
    success = run_simple_imputation_test()
    if success:
        print("\n✅ Simple imputation test PASSED!")
    else:
        print("\n❌ Simple imputation test FAILED!")