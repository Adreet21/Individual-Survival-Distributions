from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Predictor, PredictorPermission, PinnedPredictor
from dataset.models import Dataset
from folders.models import Folder
from rest_framework.exceptions import PermissionDenied
import os
import json
from django.conf import settings


# ----------------------------
# User Serializer (lightweight)
# ----------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]

# ----------------------------
# Dataset Serializer (minimal)
# ----------------------------
class DatasetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dataset
        fields = ["dataset_id", "dataset_name", "original_filename"]  

# ----------------------------
# Folder Serializer (lightweight)
# ----------------------------
class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        from folders.models import Folder
        model = Folder
        fields = ["folder_id", "name"]


# ----------------------------
# Predictor Permission Serializer
# ----------------------------
class PredictorPermissionSerializer(serializers.ModelSerializer):
    """
    Serializer for PredictorPermission model.
    Manages granting access to predictors for specific users.
    """
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source="user", write_only=True
    )
    predictor = serializers.PrimaryKeyRelatedField(queryset=Predictor.objects.all())
    role = serializers.ChoiceField(
        choices=PredictorPermission.ROLE_CHOICES,
        default="viewer",
        required=False,
    )

    class Meta:
        model = PredictorPermission
        fields = ["id", "predictor", "user", "user_id", "role"]

    def to_internal_value(self, data):
        """
        Allow clients to submit either `user_id` (preferred) or `user`.
        """
        mutable_data = data.copy() if hasattr(data, "copy") else dict(data)
        if "user_id" not in mutable_data and "user" in mutable_data:
            mutable_data["user_id"] = mutable_data["user"]
        return super().to_internal_value(mutable_data)

    def validate_predictor(self, value):
        """Validate that the user owns the predictor."""
        request = self.context.get("request")
        if not request or not request.user:
            raise PermissionDenied("Authentication required.")
        
        if value.owner != request.user:
            raise PermissionDenied("You can only grant access to predictors you own.")
        
        return value

    def create(self, validated_data):
        """Create predictor permission after validation."""
        return super().create(validated_data)



# ----------------------------
# Predictor Serializer
# ----------------------------
class PredictorSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    dataset = DatasetSerializer(read_only=True)
    dataset_id = serializers.PrimaryKeyRelatedField(
        queryset=Dataset.objects.all(),
        source='dataset',
        write_only=False # This means it will not appear in responses (get, etc)
    )

    permissions = PredictorPermissionSerializer(
        many=True, read_only=True
    )
    
    folder = FolderSerializer(read_only=True, help_text="Folder containing this predictor")
    folder_id = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(),
        source="folder",
        write_only=True,
        required=False,
        allow_null=True,
        help_text="ID of folder to add predictor to"
    )
    features = serializers.ListField(child=serializers.CharField(), read_only=True, required=False)

    class Meta:
        model = Predictor
        fields = '__all__'
        read_only_fields = [
            "predictor_id", 
            "owner", 
            "created_at", 
            "updated_at", 
            "features",
        ]
    
    def validate_folder_id(self, folder):
        """Ensure user owns the folder before assigning it."""
        if folder is None:
            return folder

        request = self.context.get("request")
        if not request or not request.user:
            raise serializers.ValidationError("User context is required")

        if folder.owner != request.user:
            raise serializers.ValidationError("You can only add predictors to folders you own")

        return folder
    
    def to_representation(self, instance):
        """Add folder information and model metadata to the response."""
        
        data = super().to_representation(instance)
        
        # Get folder information if predictor is in a folder
        from folders.models import FolderItem
        from django.contrib.contenttypes.models import ContentType
        
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        folder_item = FolderItem.objects.filter(
            content_type=predictor_ct,
            object_id=instance.predictor_id
        ).select_related('folder').first()
        
        if folder_item:
            data['folder'] = {
                'folder_id': folder_item.folder.folder_id,
                'name': folder_item.folder.name
            }
        else:
            data['folder'] = None
        
        # Add model metadata if available (model_type and n_features)
        if instance.model_id:
            model_config_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                instance.model_id,
                'model_config.json'
            )
            
            if os.path.exists(model_config_path):
                try:
                    with open(model_config_path, 'r') as f:
                        model_config = json.load(f)
                    data['model_metadata'] = {
                        'model_type': model_config.get('model_type'),
                        'n_features': model_config.get('n_features')
                    }
                except Exception:
                    data['model_metadata'] = None
            else:
                data['model_metadata'] = None
        else:
            data['model_metadata'] = None
            
        return data
    
    
    def create(self, validated_data):
        """Automatically attach owner and handle folder assignment during creation."""
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["owner"] = request.user
        return super().create(validated_data)


# ----------------------------
# Pinned Predictor Serializer
# ----------------------------
class PinnedPredictorSerializer(serializers.ModelSerializer):
    predictor = PredictorSerializer(read_only=True)
    predictor_id = serializers.PrimaryKeyRelatedField(
        queryset=Predictor.objects.all(), source="predictor", write_only=True
    )
    name = serializers.CharField(source="predictor.name", read_only=True)
    user = UserSerializer(read_only=True)

    class Meta:
        model = PinnedPredictor
        fields = ["id", "predictor", "predictor_id", "name", "user", "pinned_at"]
        read_only_fields = ["id", "pinned_at", "user"]

    def create(self, validated_data):
        """Prevent duplicate pins for same user."""
        request = self.context.get("request")
        user = request.user
        predictor = validated_data["predictor"]

        existing_pin = PinnedPredictor.objects.filter(user=user, predictor=predictor).first()
        if existing_pin:
            raise serializers.ValidationError("This predictor is already pinned.")

        validated_data["user"] = user
        return super().create(validated_data)
