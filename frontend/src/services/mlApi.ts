/**
 * React service for calling the ML API through Django backend
 * Place this in: frontend/src/services/mlApi.ts
 */

const API_BASE_URL = 'http://localhost:8000/api/ml';

interface TrainModelParams {
  dataset: File;
  selectedFeatures?: string[];
  parameters?: {
    neurons?: number[];
    dropout?: number;
    seed?: number;
    n_quantiles?: number;
    lr?: number;
    batch_size?: number;
    n_epochs?: number;
    weight_decay?: number;
    n_exp?: number;
  };
  returnCvPredictions?: boolean;
}

interface RetrainModelParams {
  modelId: string;
  selectedFeatures?: string[];
  parameters?: Record<string, any>;
  returnCvPredictions?: boolean;
}

interface PredictParams {
  modelId: string;
  features: Record<string, number>;
}

class MLApiService {
  private getAuthHeaders(): HeadersInit {
    // Get JWT token from localStorage or your auth context
    const token = localStorage.getItem('access_token');
    
    return {
      'Authorization': `Bearer ${token}`,
    };
  }

  async healthCheck(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/health/`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }

  async trainModel(params: TrainModelParams): Promise<any> {
    const formData = new FormData();
    formData.append('dataset', params.dataset);

    if (params.selectedFeatures) {
      formData.append('selected_features', JSON.stringify(params.selectedFeatures));
    }

    if (params.parameters) {
      formData.append('parameters', JSON.stringify(params.parameters));
    }

    if (params.returnCvPredictions !== undefined) {
      formData.append('return_cv_predictions', String(params.returnCvPredictions));
    }

    const response = await fetch(`${API_BASE_URL}/train/`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Training failed');
    }

    return response.json();
  }

  async retrainModel(params: RetrainModelParams): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/retrain/`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: params.modelId,
        selected_features: params.selectedFeatures,
        parameters: params.parameters,
        return_cv_predictions: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Retraining failed');
    }

    return response.json();
  }

  async predict(params: PredictParams): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/predict/`, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: params.modelId,
        features: params.features,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Prediction failed');
    }

    return response.json();
  }

  async listModels(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/models/`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list models');
    }

    return response.json();
  }
}

export const mlApiService = new MLApiService();