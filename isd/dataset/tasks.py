"""
Dataset processing tasks for feature imputation and other data operations.
"""
import pandas as pd
import numpy as np
import os
import logging
from django.core.files.storage import default_storage
from django.conf import settings
from .models import Dataset
from .file_utils import FileStorageManager
from .statistics import calculate_and_store_dataset_statistics

logger = logging.getLogger(__name__)


def process_feature_imputation(dataset_id):
    """
    Process feature imputation for a dataset.
    Replaces missing values with column means for numeric columns.
    
    Args:
        dataset_id (int): The ID of the dataset to process
        
    Returns:
        dict: Result dictionary with success status and details
    """
    try:
        # Get the dataset
        dataset = Dataset.objects.get(dataset_id=dataset_id)
        
        if not dataset.file_path:
            return {
                'success': False,
                'error': 'No file associated with this dataset'
            }
        
        # Read the dataset file
        storage_manager = FileStorageManager()
        file_path = storage_manager.get_full_path(dataset.file_path)
        
        logger.info(f"Starting feature imputation for dataset {dataset_id}: {dataset.dataset_name}")
        
        # Determine file type and read accordingly
        if dataset.file_path.lower().endswith('.csv'):
            df = pd.read_csv(file_path)
        elif dataset.file_path.lower().endswith('.tsv'):
            df = pd.read_csv(file_path, sep='\t')
        else:
            # Try CSV as default
            df = pd.read_csv(file_path)
        
        # Store original info
        original_shape = df.shape
        warnings = []
        imputed_cols_summary = []
        
        if df.shape[1] < 3:
            return {'success': False, 'error': 'Dataset must have at least 3 columns (Survival, Censorship, and 1+ feature).'}
        
        label_cols = df.columns[:2].tolist()
        feature_cols = df.columns[2:].tolist()

        numeric_features = df[feature_cols].select_dtypes(include=[np.number]).columns.tolist()
        categorical_features = df[feature_cols].select_dtypes(include=['object', 'category']).columns.tolist()
        
        # --- 1. Imputation ---
        
        # Impute NUMERIC features with mean
        for col in numeric_features:
            if df[col].isnull().any():
                mean_val = df[col].mean()
                df[col] = df[col].fillna(mean_val)
                imputed_cols_summary.append(f"Imputed missing values in numeric column '{col}' with mean ({mean_val:.2f}).")

        # Impute CATEGORICAL features with "unknown"
        for col in categorical_features:
            if df[col].isnull().any():
                df[col] = df[col].fillna("unknown")
                imputed_cols_summary.append(f"Imputed missing values in categorical column '{col}' with 'unknown'.")
        
        # --- 2. Warning Generation ---
        
        for col in categorical_features:
            unique_count = df[col].nunique()
            
            # Generate warning if > 30 unique categories
            if unique_count > 30:
                warnings.append(
                    f"Warning: Feature '{col}' has {unique_count} unique categories. "
                    "This may create many new features and could adversely affect model performance."
                )

        # --- 3. Save Processed File ---
        
        # Overwrite the original file
        if dataset.file_path.lower().endswith('.tsv'):
            df.to_csv(file_path, sep='\t', index=False)
        else:
            df.to_csv(file_path, index=False)
            
        # Update file size
        new_file_size = storage_manager.get_file_size(dataset.file_path)
        dataset.file_size = new_file_size
        dataset.save()

        # --- 4. Persist statistics ---
        try:
            calculate_and_store_dataset_statistics(dataset, dataframe=df)
        except Exception as stats_error:
            logger.warning(
                "Dataset statistics calculation failed for dataset %s: %s",
                dataset.dataset_id,
                stats_error,
            )
        
        logger.info(f"Data processing completed for dataset {dataset_id}. New shape: {df.shape}")

        return {
            'success': True,
            'details': {
                'message': 'Imputation and one-hot encoding completed.',
                'original_rows': original_shape[0],
                'original_cols': original_shape[1],
                'final_rows': df.shape[0],
                'final_cols': df.shape[1],
                'imputation_summary': imputed_cols_summary,
            },
            'warnings': warnings  # Pass the warnings back
        }
        
    except Dataset.DoesNotExist:
        logger.error(f"Dataset {dataset_id} not found")
        return {
            'success': False,
            'error': f'Dataset {dataset_id} not found'
        }
    except pd.errors.EmptyDataError:
        logger.error(f"Dataset {dataset_id} file is empty")
        return {
            'success': False,
            'error': 'Dataset file is empty or corrupted'
        }
    except pd.errors.ParserError as e:
        logger.error(f"Error parsing dataset {dataset_id}: {str(e)}")
        return {
            'success': False,
            'error': f'Error parsing dataset file: {str(e)}'
        }
    except Exception as e:
        logger.error(f"Error processing feature imputation for dataset {dataset_id}: {str(e)}")
        return {
            'success': False,
            'error': f'Feature imputation failed: {str(e)}'
        }


def validate_dataset_for_imputation(dataset_id):
    """
    Validate if a dataset is suitable for feature imputation.
    
    Args:
        dataset_id (int): The ID of the dataset to validate
        
    Returns:
        dict: Validation result with details about missing values
    """
    try:
        dataset = Dataset.objects.get(dataset_id=dataset_id)
        
        if not dataset.file_path:
            return {
                'valid': False,
                'error': 'No file associated with this dataset'
            }
        
        # Read the dataset file
        storage_manager = FileStorageManager()
        file_path = storage_manager.get_full_path(dataset.file_path)
        
        # Determine file type and read accordingly
        if dataset.file_path.lower().endswith('.csv'):
            df = pd.read_csv(file_path)
        elif dataset.file_path.lower().endswith('.tsv'):
            df = pd.read_csv(file_path, sep='\t')
        else:
            df = pd.read_csv(file_path)
        
        # Analyze missing values
        total_cells = df.shape[0] * df.shape[1]
        missing_cells = df.isnull().sum().sum()
        missing_percentage = (missing_cells / total_cells) * 100 if total_cells > 0 else 0
        
        # Column-wise missing value analysis
        missing_by_column = []
        for col in df.columns:
            missing_count = df[col].isnull().sum()
            if missing_count > 0:
                missing_by_column.append({
                    'column': col,
                    'missing_count': int(missing_count),
                    'missing_percentage': (missing_count / len(df)) * 100,
                    'data_type': str(df[col].dtype)
                })
        
        return {
            'valid': True,
            'details': {
                'total_rows': df.shape[0],
                'total_columns': df.shape[1],
                'total_missing_values': int(missing_cells),
                'missing_percentage': round(missing_percentage, 2),
                'columns_with_missing': missing_by_column,
                'has_missing_values': missing_cells > 0
            }
        }
        
    except Exception as e:
        logger.error(f"Error validating dataset {dataset_id} for imputation: {str(e)}")
        return {
            'valid': False,
            'error': f'Validation failed: {str(e)}'
        }
