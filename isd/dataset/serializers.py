from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Dataset, DatasetPermission, PinnedDataset, DatasetStatistics
from .file_utils import FileValidator
from rest_framework.exceptions import PermissionDenied

# ----------------------------
# User Serializer (lightweight)
# ----------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]

# ----------------------------
# Folder Serializer (lightweight)
# ----------------------------
class FolderSerializer(serializers.ModelSerializer):
    class Meta:
        from folders.models import Folder
        model = Folder
        fields = ["folder_id", "name"]


# Dataset Serializer
# ----------------------------
class DatasetSerializer(serializers.ModelSerializer):
    """
    Serializer for Dataset model.
    
    Handles serialization and validation of dataset data including file uploads.
    """
    
    owner_name = serializers.CharField(source='owner.username', read_only=True)
    allow_admin_access = serializers.BooleanField(default=True, help_text="Whether to allow admin users to access")
    file = serializers.FileField(write_only=True, required=True, help_text='CSV or TSV file to upload')
    file_size_display = serializers.CharField(source='get_file_size_display', read_only=True)
    file_display_name = serializers.CharField(source='get_file_display_name', read_only=True)
    has_file = serializers.BooleanField(read_only=True)
    folder_id = serializers.IntegerField(write_only=True, required=False, allow_null=True, help_text="ID of folder to add dataset to")
    folder = FolderSerializer(read_only=True, help_text="Folder containing this dataset")
    num_features = serializers.IntegerField(read_only=True, help_text="Number of feature columns (total columns - 2)")
    num_labels = serializers.IntegerField(read_only=True, help_text="Number of samples/rows (total rows - 1)")
    
    class Meta:
        model = Dataset
        fields = [
            "dataset_id", "dataset_name", "owner", "owner_name",
            "file", "file_path", "original_filename", "file_size", 
            "file_size_display", "file_display_name", "has_file",
            "folder", "folder_id",
            "notes", "time_unit", "is_public", "uploaded_at",
            "num_features", "num_labels",
            "allow_admin_access"
        ]
        extra_kwargs = {
            'dataset_id': {'read_only': True},
            'dataset_name': {
                'help_text': 'A descriptive name for the dataset',
                'max_length': 200,
                'required': True
            },
            'owner': {
                'help_text': 'The user who owns this dataset',
                'read_only': True
            },
            'file_path': {
                'read_only': True,
                'help_text': 'Relative path to the uploaded file'
            },
            'original_filename': {
                'read_only': True,
                'help_text': 'Original filename as uploaded by user'
            },
            'file_size': {
                'read_only': True,
                'help_text': 'File size in bytes'
            },
            'notes': {
                'help_text': 'Optional notes about the dataset',
                'required': False,
                'allow_blank': True
            },
            'time_unit': {
                'help_text': 'Time unit for survival analysis',
                'required': True
            },
            'is_public': {
                'help_text': 'Whether the dataset is publicly visible',
                'required': False,
                'default': False
            },
            'uploaded_at': {
                'read_only': True,
                'help_text': 'Timestamp when dataset was created'
            }
        }
    
    def validate_file(self, value):
        """
        Validate the uploaded file using FileValidator.
        
        Args:
            value: The uploaded file
            
        Returns:
            The validated file
            
        Raises:
            serializers.ValidationError: If file validation fails
        """
        validator = FileValidator()
        try:
            validator.validate_file(value)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        
        return value
    
    def validate_folder_id(self, value):
        """Validate folder_id field."""
        if value is None:
            return value
            
        request = self.context.get("request")
        if not request or not request.user:
            raise serializers.ValidationError("User context is required")
        
        # Import here to avoid circular imports
        from folders.models import Folder
        
        try:
            folder = Folder.objects.get(folder_id=value)
        except Folder.DoesNotExist:
            raise serializers.ValidationError("Folder does not exist")
        
        # Check if user owns the folder
        if folder.owner != request.user:
            raise serializers.ValidationError("You can only add datasets to folders you own")
        
        return value
    
    def validate_time_unit(self, value):
        """
        Validate time_unit field.
        
        Args:
            value: The time unit value
            
        Returns:
            The validated time unit
            
        Raises:
            serializers.ValidationError: If time unit is invalid
        """
        valid_choices = [choice[0] for choice in Dataset.TIME_UNIT_CHOICES]
        if value not in valid_choices:
            raise serializers.ValidationError(
                f"Invalid time unit. Must be one of: {', '.join(valid_choices)}"
            )
        return value
    
    def validate_dataset_name(self, value):
        """
        Validate dataset_name field.
        
        Args:
            value: The dataset name
            
        Returns:
            The validated dataset name
            
        Raises:
            serializers.ValidationError: If dataset name is invalid
        """
        if not value or not value.strip():
            raise serializers.ValidationError("Dataset name cannot be empty")
        
        # Check for reasonable length
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Dataset name must be at least 3 characters long")
        
        return value.strip()
    
    def validate(self, attrs):
        """
        Perform object-level validation.
        
        Args:
            attrs: Dictionary of field values
            
        Returns:
            Validated attributes
            
        Raises:
            serializers.ValidationError: If validation fails
        """
        # Ensure file is provided for creation
        if not self.instance and 'file' not in attrs:
            raise serializers.ValidationError({
                'file': 'File is required when creating a dataset'
            })
        
        # Validate that dataset name is unique for the user
        dataset_name = attrs.get('dataset_name')
        if dataset_name and self.context.get('request'):
            user = self.context['request'].user
            existing_query = Dataset.objects.filter(
                dataset_name=dataset_name,
                owner=user
            )
            
            # Exclude current instance if updating
            if self.instance:
                existing_query = existing_query.exclude(pk=self.instance.pk)
            
            if existing_query.exists():
                raise serializers.ValidationError({
                    'dataset_name': 'You already have a dataset with this name'
                })
        
        return attrs
    
    def to_representation(self, instance):
        """Add folder information to the response."""
        data = super().to_representation(instance)
        
        # Get folder information if dataset is in a folder
        from folders.models import FolderItem
        from django.contrib.contenttypes.models import ContentType
        
        dataset_ct = ContentType.objects.get_for_model(Dataset)
        folder_item = FolderItem.objects.filter(
            content_type=dataset_ct,
            object_id=instance.dataset_id
        ).select_related('folder').first()
        
        if folder_item:
            data['folder'] = {
                'folder_id': folder_item.folder.folder_id,
                'name': folder_item.folder.name
            }
        else:
            data['folder'] = None
            
        return data
    
    def create(self, validated_data):
        """
        Create a new dataset with file upload processing.
        
        Args:
            validated_data: Validated data from the serializer
            
        Returns:
            Dataset: The created dataset instance
            
        Raises:
            serializers.ValidationError: If file processing fails
        """
        from .file_utils import FileStorageManager
        from django.db import transaction
        
        # Extract file and folder_id from validated data
        uploaded_file = validated_data.pop('file')
        folder_id = validated_data.pop('folder_id', None)
        
        # Get the current user from context
        request = self.context.get('request')
        if not request or not request.user:
            raise serializers.ValidationError("User context is required")
        
        validated_data['owner'] = request.user
        
        # Use transaction to ensure atomicity
        try:
            with transaction.atomic():
                # Initialize file storage manager
                storage_manager = FileStorageManager()
                
                # Save the uploaded file
                file_path, sanitized_filename = storage_manager.save_uploaded_file(
                    uploaded_file, 
                    uploaded_file.name
                )
                
                # Add file metadata to validated data
                validated_data['file_path'] = file_path
                validated_data['original_filename'] = sanitized_filename
                validated_data['file_size'] = uploaded_file.size
                
                # Create the dataset instance
                dataset = Dataset.objects.create(**validated_data)
                
                # Add to folder if specified
                if folder_id:
                    self._add_to_folder(dataset, folder_id, request.user)
                
                return dataset
                
        except Exception as e:
            # If dataset creation fails, try to clean up the uploaded file
            if 'file_path' in locals():
                try:
                    storage_manager.delete_file(file_path)
                except:
                    pass  # Don't fail if cleanup fails
            
            # Re-raise the original exception
            if hasattr(e, 'message_dict'):
                # Django ValidationError with field-specific errors
                raise serializers.ValidationError(e.message_dict)
            else:
                # Generic error
                raise serializers.ValidationError(f"Failed to create dataset: {str(e)}")
    
    def update(self, instance, validated_data):
        """
        Update an existing dataset.
        
        Note: File updates are not supported - users must create a new dataset.
        
        Args:
            instance: The existing dataset instance
            validated_data: Validated data from the serializer
            
        Returns:
            Dataset: The updated dataset instance
        """
        # Remove file from validated_data if present (file updates not supported)
        validated_data.pop('file', None)
        
        # Update allowed fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance
    
    def _add_to_folder(self, dataset, folder_id, user):
        """Add dataset to specified folder."""
        from folders.models import Folder, FolderItem
        from django.contrib.contenttypes.models import ContentType
        
        try:
            folder = Folder.objects.get(folder_id=folder_id, owner=user)
            dataset_ct = ContentType.objects.get_for_model(Dataset)
            
            # Create folder item
            FolderItem.objects.create(
                folder=folder,
                content_type=dataset_ct,
                object_id=dataset.dataset_id,
                added_by=user
            )
            
            # Apply folder permission inheritance
            folder.apply_permission_inheritance_to_item(
                FolderItem.objects.get(
                    folder=folder,
                    content_type=dataset_ct,
                    object_id=dataset.dataset_id
                )
            )
        except Exception as e:
            # Log error but don't fail dataset creation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to add dataset {dataset.dataset_id} to folder {folder_id}: {str(e)}")


# ----------------------------
# Dataset Permission Serializer
# ----------------------------
class DatasetPermissionSerializer(serializers.ModelSerializer):
    """
    Serializer for DatasetPermission model.
    Manages user permissions for dataset access.
    """
    
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source="user", write_only=True
    )
    dataset = serializers.PrimaryKeyRelatedField(queryset=Dataset.objects.all())

    class Meta:
        model = DatasetPermission
        fields = ["id", "dataset", "user", "user_id"]
        read_only_fields = ["id", "pinned_at", "user"]

    def create(self, validated_data):
        """Ensure only dataset owners can grant permission."""
        request = self.context.get("request")
        dataset = validated_data["dataset"]
        if dataset.owner != request.user:
            raise PermissionDenied("You can only grant access to datasets you own.")
        return super().create(validated_data)


# ----------------------------
# Pinnned Dataset Serializer
# ----------------------------
class PinnedDatasetSerializer(serializers.ModelSerializer):
    dataset_detail = DatasetSerializer(source="dataset", read_only=True)
    dataset = serializers.PrimaryKeyRelatedField(
        queryset=Dataset.objects.all(), write_only=True
    )
    name = serializers.CharField(source="dataset.dataset_name", read_only=True)
    user = UserSerializer(read_only=True)

    class Meta:
        model = PinnedDataset
        fields = ["id", "dataset", "dataset_id", "name", "user", "pinned_at", "dataset_detail"]
        read_only_fields = ["id", "pinned_at", "user"]

    def create(self, validated_data):
        """Prevent duplicate pins for same user."""
        request = self.context.get("request")
        user = request.user
        dataset = validated_data["dataset"]

        existing_pin = PinnedDataset.objects.filter(user=user, dataset=dataset).first()
        if existing_pin:
            raise serializers.ValidationError("This dataset is already pinned.")

        validated_data["user"] = user
        return super().create(validated_data)
# ----------------------------
# Dataset Statistics Serializer
# ----------------------------
class DatasetStatisticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatasetStatistics
        fields = [
            "computed_at",
            "schema_version",
            "general_stats",
            "feature_correlations",
            "event_time_histogram",
        ]
        read_only_fields = fields
