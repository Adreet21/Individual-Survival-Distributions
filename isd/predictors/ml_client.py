"""
ML API Client for connecting to the survival analysis model API
Place this file in: predictors/ml_client.py
"""
import requests
import os
from typing import Dict, List, Optional, Any
from django.conf import settings


class MLAPIClient:
    """Client for interacting with the ML model API"""
    
    def __init__(self):
        # Get API URL from environment or use default
        self.api_url = os.environ.get('ML_API_URL', 'http://localhost:5000')
        self.timeout = 600  # 10 minutes for training
    
    def health_check(self) -> Dict[str, Any]:
        """Check if ML API is healthy"""
        try:
            response = requests.get(
                f'{self.api_url}/health',
                timeout=5
            )
            response.raise_for_status()
            return {
                'status': 'healthy',
                'data': response.json()
            }
        except requests.exceptions.RequestException as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }
    
    def train_model(
        self,
        dataset_file,  # Django UploadedFile object
        selected_features: Optional[List[str]] = None,
        parameters: Optional[Dict] = None,
        return_cv_predictions: bool = True
    ) -> Dict[str, Any]:
        """
        Train a new model by uploading a dataset
        
        Args:
            dataset_file: Django UploadedFile object from request.FILES
            selected_features: List of feature column names to use (or None/'all' for all)
            parameters: Optional dict of model parameters (neurons, dropout, etc.)
            return_cv_predictions: Whether to return cross-validation predictions
            
        Returns:
            Dict with status, model_id, metrics, etc.
        """
        try:
            # Prepare files for upload
            files = {
                'dataset': (dataset_file.name, dataset_file.read(), 'text/csv')
            }
            
            # Default parameters
            default_params = {
                'neurons': [64, 64],
                'dropout': 0.2,
                'seed': 42,
                'n_quantiles': 9,
                'lr': 1e-3,
                'batch_size': 256,
                'n_epochs': 1000,
                'weight_decay': 1e-4,
                'n_exp': 10,
            }
            
            # Merge with provided parameters
            if parameters:
                default_params.update(parameters)
            
            # Prepare request data
            import json
            data = {
                'parameters': json.dumps(default_params),
                'return_cv_predictions': 'true'
            }
            
            # Add features if provided
            if selected_features:
                data['selected_features'] = json.dumps(selected_features)
            else:
                data['selected_features'] = json.dumps('all')
            
            # Make request
            response = requests.post(
                f'{self.api_url}/train',
                files=files,
                data=data,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            result = response.json()
            return {
                'success': True,
                'data': result
            }
            
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': 'Training request timed out'
            }
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'API request failed: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Unexpected error: {str(e)}'
            }
    
    def retrain_model(
        self,
        model_id: str,
        selected_features: Optional[List[str]] = None,
        parameters: Optional[Dict] = None,
        return_cv_predictions: bool = True
    ) -> Dict[str, Any]:
        """
        Retrain an existing model with different features or parameters
        
        Args:
            model_id: ID of the model to retrain
            selected_features: New list of features (or None to keep original)
            parameters: Parameter overrides
            return_cv_predictions: Whether to return CV predictions
            
        Returns:
            Dict with success status and new model data
        """
        try:
            payload = {
                'model_id': model_id,
                'return_cv_predictions': True
            }
            
            if selected_features is not None:
                payload['selected_features'] = selected_features
            
            if parameters:
                payload['parameters'] = parameters
            
            response = requests.post(
                f'{self.api_url}/retrain',
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            result = response.json()
            return {
                'success': True,
                'data': result
            }
            
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Retrain request failed: {str(e)}'
            }
    
    def predict(
        self,
        model_id: str,
        features: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Make predictions using a trained model
        
        Args:
            model_id: ID of the trained model
            features: Dict of feature_name -> value
            
        Returns:
            Dict with predictions (median survival time, quantiles, etc.)
        """
        try:
            response = requests.post(
                f'{self.api_url}/predict',
                json={
                    'model_id': model_id,
                    'features': features
                },
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            return {
                'success': True,
                'data': result
            }
            
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Prediction failed: {str(e)}'
            }

    def list_models(self) -> Dict[str, Any]:
        """Get list of all trained models"""
        try:
            response = requests.get(
                f'{self.api_url}/models',
                timeout=10
            )
            response.raise_for_status()
            
            result = response.json()
            return {
                'success': True,
                'data': result
            }
            
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Failed to list models: {str(e)}'
            }
