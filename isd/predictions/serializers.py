from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Prediction
from predictors.models import Predictor
from dataset.models import Dataset


# ----------------------------
# Lightweight Serializers
# ----------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]


class PredictorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Predictor
        fields = ["predictor_id", "name"]


class DatasetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dataset
        fields = ["dataset_id", "dataset_name", "original_filename"]


# ----------------------------
# Prediction Serializer
# ----------------------------
class PredictionSerializer(serializers.ModelSerializer):
    """
    Serializer for Prediction model.
    Handles saving and retrieving prediction results.
    """
    user = UserSerializer(read_only=True)
    predictor = PredictorSerializer(read_only=True)
    dataset = DatasetSerializer(read_only=True)
    
    # Write-only fields for creating predictions
    predictor_id = serializers.PrimaryKeyRelatedField(
        queryset=Predictor.objects.all(),
        source='predictor',
        write_only=True
    )
    dataset_id = serializers.PrimaryKeyRelatedField(
        queryset=Dataset.objects.all(),
        source='dataset',
        write_only=True
    )
    
    class Meta:
        model = Prediction
        fields = [
            'prediction_id',
            'user',
            'predictor',
            'predictor_id',
            'dataset',
            'dataset_id',
            'name',
            'is_labeled',
            'prediction_data',
            'c_index',
            'ibs_score',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['prediction_id', 'user', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """Automatically attach user during creation."""
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['user'] = request.user
        return super().create(validated_data)
