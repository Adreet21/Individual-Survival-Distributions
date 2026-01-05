from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import Folder, FolderItem, FolderPermission, PinnedFolder
from predictors.models import Predictor
from dataset.models import Dataset


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]


# ----------------------------
# Folder Item Serializer
# ----------------------------
class FolderItemSerializer(serializers.ModelSerializer):
    """Serializer for items within folders with content object details."""
    
    item_type = serializers.SerializerMethodField()
    item_name = serializers.SerializerMethodField()
    item_id = serializers.SerializerMethodField()
    item_owner = serializers.SerializerMethodField()
    item_privacy = serializers.SerializerMethodField()
    item_updated_at = serializers.SerializerMethodField()
    added_by_name = serializers.CharField(source='added_by.username', read_only=True)
    
    class Meta:
        model = FolderItem
        fields = [
            'folder', 'content_type', 'object_id', 'added_at', 'added_by', 'added_by_name',
            'item_type', 'item_name', 'item_id', 'item_owner', 'item_privacy', 'item_updated_at'
        ]
        read_only_fields = ['added_at', 'added_by']
    
    def get_item_type(self, obj):
        """Return the type of the content object (predictor or dataset)."""
        if obj.content_type.model == 'predictor':
            return 'predictor'
        elif obj.content_type.model == 'dataset':
            return 'dataset'
        return obj.content_type.model
    
    def get_item_name(self, obj):
        """Return the name of the content object."""
        item = obj.content_object
        if hasattr(item, 'name'):
            return item.name
        elif hasattr(item, 'dataset_name'):
            return item.dataset_name
        return str(item)
    
    def get_item_id(self, obj):
        """Return the ID of the content object."""
        item = obj.content_object
        if hasattr(item, 'predictor_id'):
            return item.predictor_id
        elif hasattr(item, 'dataset_id'):
            return item.dataset_id
        return obj.object_id
    
    def get_item_owner(self, obj):
        """Return the owner username of the content object."""
        item = obj.content_object
        if hasattr(item, 'owner'):
            return item.owner.username
        return None
    
    def get_item_privacy(self, obj):
        """Return the privacy status of the content object."""
        item = obj.content_object
        if hasattr(item, 'is_private'):
            return item.is_private
        elif hasattr(item, 'is_public'):
            return not item.is_public
        return True  # Default to private if unknown
    
    def get_item_updated_at(self, obj):
        """Return the last updated timestamp of the content object."""
        item = obj.content_object
        if hasattr(item, 'updated_at'):
            return item.updated_at
        elif hasattr(item, 'uploaded_at'):
            return item.uploaded_at
        return obj.added_at


# ----------------------------
# Folder Serializer
# ----------------------------
class FolderSerializer(serializers.ModelSerializer):
    """Serializer for Folder model with nested item data."""
    
    owner = UserSerializer(read_only=True)
    item_count = serializers.ReadOnlyField()
    public_item_count = serializers.SerializerMethodField()
    should_hide_from_public = serializers.SerializerMethodField()
    items = FolderItemSerializer(source='folder_items', many=True, read_only=True)
    initial_items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        help_text="List of items to add to the folder upon creation"
    )
    
    class Meta:
        model = Folder
        fields = [
            'folder_id', 'name', 'description', 'owner', 'is_private',
            'created_at', 'updated_at', 'item_count', 'public_item_count', 
            'should_hide_from_public', 'items', 'initial_items'
        ]
        read_only_fields = ['folder_id', 'created_at', 'updated_at', 'item_count', 'public_item_count', 'should_hide_from_public']
    
    def get_public_item_count(self, obj):
        """Get the efficient public item count."""
        return obj.get_public_item_count_efficient()
    
    def get_should_hide_from_public(self, obj):
        """Check if folder should be hidden from public view."""
        return obj.should_hide_from_public()
    

    def get_items(self, obj):
        """Get items visible to the current user."""
        request = self.context.get('request')
        user = request.user if request and request.user.is_authenticated else None
        
        # Get visible items for this user
        visible_items = obj.get_visible_items_for_user(user)
        
        # Serialize the visible items
        return FolderItemSerializer(visible_items, many=True).data
    
    def validate_name(self, value):
        """Validate folder name."""
        if not value or not value.strip():
            raise ValidationError("Folder name cannot be empty")
        
        if len(value.strip()) > 100:
            raise ValidationError("Folder name cannot exceed 100 characters")
        
        return value.strip()
    
    def validate(self, attrs):
        """Perform object-level validation."""
        name = attrs.get('name')
        if name and self.context.get('request'):
            user = self.context['request'].user
            existing_query = Folder.objects.filter(name=name, owner=user)
            
            # Exclude current instance if updating
            if self.instance:
                existing_query = existing_query.exclude(pk=self.instance.pk)
            
            if existing_query.exists():
                raise ValidationError({
                    'name': 'You already have a folder with this name'
                })
        
        return attrs
    
    def create(self, validated_data):
        """Create a new folder with the authenticated user as owner."""
        request = self.context.get('request')
        if not request or not request.user:
            raise ValidationError("User context is required")
        
        # Extract initial_items before creating the folder
        initial_items = validated_data.pop('initial_items', [])
        
        validated_data['owner'] = request.user
        folder = super().create(validated_data)
        
        # Add initial items to the folder
        if initial_items:
            self._add_initial_items(folder, initial_items, request.user)
        
        return folder
    
    def _add_initial_items(self, folder, initial_items, user):
        """Add initial items to the newly created folder."""
        from django.contrib.contenttypes.models import ContentType
        
        for item_data in initial_items:
            item_type = item_data.get('item_type')
            item_id = item_data.get('item_id')
            
            if not item_type or not item_id:
                continue
                
            try:
                # Convert item_id to integer if it's a string
                if isinstance(item_id, str):
                    item_id = int(item_id)
                
                # Get the appropriate model and item
                if item_type == 'predictor':
                    item = Predictor.objects.get(predictor_id=item_id)
                    content_type = ContentType.objects.get_for_model(Predictor)
                    object_id = item.predictor_id
                    
                    # Check if user has access to this predictor
                    if item.owner != user and not item.permissions.filter(user=user).exists() and item.is_private:
                        continue  # Skip items user doesn't have access to
                        
                elif item_type == 'dataset':
                    item = Dataset.objects.get(dataset_id=item_id)
                    content_type = ContentType.objects.get_for_model(Dataset)
                    object_id = item.dataset_id
                    
                    # Check if user has access to this dataset
                    if item.owner != user and not item.permissions.filter(user=user).exists():
                        continue  # Skip items user doesn't have access to
                else:
                    continue  # Skip unknown item types
                
                # Check if item is already in the folder
                existing_item = FolderItem.objects.filter(
                    folder=folder,
                    content_type=content_type,
                    object_id=object_id
                ).first()
                
                if not existing_item:
                    # Create the folder item
                    folder_item = FolderItem.objects.create(
                        folder=folder,
                        content_type=content_type,
                        object_id=object_id,
                        added_by=user
                    )
                    
                    # Apply permission inheritance to the new item
                    folder.apply_permission_inheritance_to_item(folder_item)
                    
            except (ValueError, Predictor.DoesNotExist, Dataset.DoesNotExist):
                # Skip invalid items
                continue


# ----------------------------
# Folder Permission Serializer
# ----------------------------
class FolderPermissionSerializer(serializers.ModelSerializer):
    """Serializer for FolderPermission model."""
    
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source="user", write_only=True
    )
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    granted_by_name = serializers.CharField(source='granted_by.username', read_only=True)
    
    class Meta:
        model = FolderPermission
        fields = [
            'id', 'folder', 'folder_name', 'user', 'user_id', 'permission_type',
            'granted_at', 'granted_by', 'granted_by_name'
        ]
        read_only_fields = ['id', 'granted_at', 'granted_by']
    
    def create(self, validated_data):
        """Ensure only folder owners can grant permission."""
        request = self.context.get('request')
        folder = validated_data['folder']
        
        if folder.owner != request.user:
            raise PermissionDenied("You can only grant access to folders you own.")
        
        # Set the user who granted the permission
        validated_data['granted_by'] = request.user
        
        return super().create(validated_data)


# ----------------------------
# Add/Remove Item Serializers
# ----------------------------
class AddItemToFolderSerializer(serializers.Serializer):
    """Serializer for adding items to folders."""
    
    item_type = serializers.ChoiceField(choices=['predictor', 'dataset'])
    item_id = serializers.IntegerField()
    
    def validate(self, attrs):
        """Validate that the item exists and user has access."""
        item_type = attrs['item_type']
        item_id = attrs['item_id']
        request = self.context.get('request')
        
        if not request or not request.user:
            raise ValidationError("User context is required")
        
        user = request.user
        
        # Get the appropriate model and check access
        if item_type == 'predictor':
            try:
                item = Predictor.objects.get(predictor_id=item_id)
                # Check if user has access to this predictor
                if item.owner != user and not item.permissions.filter(user=user).exists() and item.is_private:
                    raise PermissionDenied("You don't have access to this predictor")
            except Predictor.DoesNotExist:
                raise ValidationError("Predictor not found")
        
        elif item_type == 'dataset':
            try:
                item = Dataset.objects.get(dataset_id=item_id)
                # Check if user has access to this dataset
                if item.owner != user and not item.permissions.filter(user=user).exists():
                    raise PermissionDenied("You don't have access to this dataset")
            except Dataset.DoesNotExist:
                raise ValidationError("Dataset not found")
        
        attrs['item'] = item
        return attrs


class RemoveItemFromFolderSerializer(serializers.Serializer):
    """Serializer for removing items from folders."""
    
    item_type = serializers.ChoiceField(choices=['predictor', 'dataset'])
    item_id = serializers.IntegerField()


# ----------------------------
# Bulk Permission Serializers
# ----------------------------
class BulkGrantPermissionSerializer(serializers.Serializer):
    """Serializer for bulk granting folder permissions."""
    
    folder_id = serializers.IntegerField()
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text="List of user IDs to grant access to"
    )
    permission_type = serializers.ChoiceField(
        choices=FolderPermission.PERMISSION_CHOICES,
        default='view',
        help_text="Type of permission to grant"
    )
    
    def validate_folder_id(self, value):
        """Validate that the folder exists."""
        try:
            folder = Folder.objects.get(folder_id=value)
            return value
        except Folder.DoesNotExist:
            raise ValidationError("Folder not found")
    
    def validate_user_ids(self, value):
        """Validate that all users exist."""
        from django.contrib.auth.models import User
        existing_users = User.objects.filter(id__in=value)
        if existing_users.count() != len(value):
            missing_ids = set(value) - set(existing_users.values_list('id', flat=True))
            raise ValidationError(f"Users not found: {list(missing_ids)}")
        return value


class BulkRevokePermissionSerializer(serializers.Serializer):
    """Serializer for bulk revoking folder permissions."""
    
    folder_id = serializers.IntegerField()
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text="List of user IDs to revoke access from"
    )
    
    def validate_folder_id(self, value):
        """Validate that the folder exists."""
        try:
            folder = Folder.objects.get(folder_id=value)
            return value
        except Folder.DoesNotExist:
            raise ValidationError("Folder not found")


# ----------------------------
# Folder Management Serializers
# ----------------------------
class DuplicateFolderSerializer(serializers.Serializer):
    """Serializer for duplicating folders."""
    
    name = serializers.CharField(max_length=100, help_text="Name for the duplicated folder")
    description = serializers.CharField(required=False, allow_blank=True, help_text="Optional description")
    is_private = serializers.BooleanField(required=False, help_text="Privacy setting for the duplicated folder")
    
    def validate_name(self, value):
        """Validate folder name."""
        if not value or not value.strip():
            raise ValidationError("Folder name cannot be empty")
        
        if len(value.strip()) > 100:
            raise ValidationError("Folder name cannot exceed 100 characters")
        
        return value.strip()


class BulkMoveItemsSerializer(serializers.Serializer):
    """Serializer for bulk moving items between folders."""
    
    source_folder_id = serializers.IntegerField(required=False, allow_null=True, help_text="Source folder ID")
    target_folder_id = serializers.IntegerField(required=False, allow_null=True, help_text="Target folder ID")
    items = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        help_text="List of items to move"
    )
    
    def validate_items(self, value):
        """Validate items list structure."""
        for item in value:
            if 'item_type' not in item or 'item_id' not in item:
                raise ValidationError("Each item must have 'item_type' and 'item_id'")
            
            if item['item_type'] not in ['predictor', 'dataset']:
                raise ValidationError("item_type must be 'predictor' or 'dataset'")
            
            try:
                int(item['item_id'])
            except (ValueError, TypeError):
                raise ValidationError("item_id must be a valid integer")
        
        return value
    
    def validate(self, attrs):
        """Validate that at least one folder is specified."""
        source_folder_id = attrs.get('source_folder_id')
        target_folder_id = attrs.get('target_folder_id')

        if not source_folder_id and not target_folder_id:
            raise ValidationError("At least one of source_folder_id or target_folder_id must be specified")

        return attrs


# ----------------------------
# Pinned Folder Serializer
# ----------------------------
class PinnedFolderSerializer(serializers.ModelSerializer):
    folder = FolderSerializer(read_only=True)
    folder_id = serializers.PrimaryKeyRelatedField(
        queryset=Folder.objects.all(), source="folder", write_only=True
    )
    name = serializers.CharField(source="folder.name", read_only=True)
    user = UserSerializer(read_only=True)

    class Meta:
        model = PinnedFolder
        fields = ["id", "folder", "folder_id", "name", "user", "pinned_at"]
        read_only_fields = ["id", "pinned_at", "user"]

    def create(self, validated_data):
        """Prevent duplicate pins for same user."""
        request = self.context.get("request")
        user = request.user if request else None
        folder = validated_data.get("folder")

        if user and folder:
            # Check if already pinned
            existing = PinnedFolder.objects.filter(user=user, folder=folder).first()
            if existing:
                return existing

        return super().create(validated_data)