from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.db.models import Q, Exists, OuterRef


class FolderManager(models.Manager):
    """Custom manager for Folder model with privacy-aware filtering."""
    
    def public_visible(self):
        """
        Return folders that should be visible in public views.
        Applies auto-hide logic to exclude folders with no public content.
        """
        from predictors.models import Predictor
        from dataset.models import Dataset
        
        # Get content types
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        dataset_ct = ContentType.objects.get_for_model(Dataset)
        
        # Subquery to check if folder has any public predictors
        public_predictors_exist = FolderItem.objects.filter(
            folder=OuterRef('pk'),
            content_type=predictor_ct,
            object_id__in=Predictor.objects.filter(is_private=False).values_list('predictor_id', flat=True)
        )
        
        # Subquery to check if folder has any public datasets
        public_datasets_exist = FolderItem.objects.filter(
            folder=OuterRef('pk'),
            content_type=dataset_ct,
            object_id__in=Dataset.objects.filter(is_public=True).values_list('dataset_id', flat=True)
        )
        
        # Return public folders that have at least one public item
        return self.filter(
            is_private=False
        ).filter(
            Q(Exists(public_predictors_exist)) | Q(Exists(public_datasets_exist))
        )
    
    def accessible_to_user(self, user):
        """
        Return folders accessible to a specific user.
        Includes owned folders, shared folders, and public folders with content.
        """
        if user is None or not user.is_authenticated:
            return self.public_visible()
        
        return self.filter(
            Q(owner=user) |  # Owned folders
            Q(permissions__user=user) |  # Shared folders
            Q(pk__in=self.public_visible().values_list('pk', flat=True))  # Public visible folders
        ).distinct()


class Folder(models.Model):
    """Folder model for organizing predictors and datasets."""
    
    objects = FolderManager()
    
    folder_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100, help_text="Name of the folder")
    description = models.TextField(blank=True, help_text="Optional description of the folder")
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_folders')
    is_private = models.BooleanField(default=False, help_text="Whether the folder is private (True) or public (False)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('owner', 'name')  # Folder names must be unique per user
        indexes = [
            models.Index(fields=['owner', 'is_private']),
            models.Index(fields=['is_private']),
            models.Index(fields=['created_at']),
        ]
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.owner.username})"
    
    @property
    def item_count(self):
        """Total number of items in the folder."""
        return self.folder_items.count()
    
    @property
    def public_item_count(self):
        """Count of items visible to public users."""
        from django.contrib.contenttypes.models import ContentType
        from predictors.models import Predictor
        from dataset.models import Dataset
        
        public_count = 0
        
        # Get content types for efficient querying
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        dataset_ct = ContentType.objects.get_for_model(Dataset)
        
        for folder_item in self.folder_items.select_related('content_type').all():
            item = folder_item.content_object
            
            # Handle predictors (is_private=False means public)
            if folder_item.content_type == predictor_ct:
                if hasattr(item, 'is_private') and not item.is_private:
                    public_count += 1
            # Handle datasets (is_public=True means public)
            elif folder_item.content_type == dataset_ct:
                if hasattr(item, 'is_public') and item.is_public:
                    public_count += 1
            # Handle other content types with generic privacy check
            else:
                if hasattr(item, 'is_public') and item.is_public:
                    public_count += 1
                elif hasattr(item, 'is_private') and not item.is_private:
                    public_count += 1
        
        return public_count
    
    def get_public_item_count_efficient(self):
        """
        More efficient version of public_item_count using database queries.
        This method reduces the number of database hits by using direct queries.
        """
        from django.contrib.contenttypes.models import ContentType
        from predictors.models import Predictor
        from dataset.models import Dataset
        
        # Get content types
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        dataset_ct = ContentType.objects.get_for_model(Dataset)
        
        # Count public predictors in this folder (is_private=False)
        public_predictors = self.folder_items.filter(
            content_type=predictor_ct,
            object_id__in=Predictor.objects.filter(is_private=False).values_list('predictor_id', flat=True)
        ).count()
        
        # Count public datasets in this folder (is_public=True)
        public_datasets = self.folder_items.filter(
            content_type=dataset_ct,
            object_id__in=Dataset.objects.filter(is_public=True).values_list('dataset_id', flat=True)
        ).count()
        
        return public_predictors + public_datasets
    
    def should_hide_from_public(self):
        """
        Determine if this public folder should be hidden from public view
        because all its contents are private.
        
        Returns True if:
        - Folder is private, OR
        - Folder has no items, OR  
        - All items in the folder are private
        """
        if self.is_private:
            return True
        
        # If folder has no items, hide it
        if self.item_count == 0:
            return True
            
        # Check if any items are public
        return self.get_public_item_count_efficient() == 0
    
    def is_visible_to_user(self, user):
        """
        Check if this folder is visible to a specific user.
        
        Args:
            user: User instance or None for anonymous users
            
        Returns:
            bool: True if folder should be visible to the user
        """
        # Anonymous users can only see public folders with public content
        if user is None or not user.is_authenticated:
            return not self.should_hide_from_public()
        
        # Owners can always see their folders
        if self.owner == user:
            return True
        
        # Users with explicit permissions can see the folder
        if self.permissions.filter(user=user).exists():
            return True
        
        # Other authenticated users can see public folders with public content
        return not self.should_hide_from_public()
    
    def get_visible_items_for_user(self, user):
        """
        Get folder items that are visible to a specific user.
        
        Args:
            user: User instance or None for anonymous users
            
        Returns:
            QuerySet: FolderItem objects visible to the user
        """
        from django.contrib.contenttypes.models import ContentType
        from predictors.models import Predictor
        from dataset.models import Dataset
        
        # If user is the folder owner, they can see all items
        if user and user.is_authenticated and self.owner == user:
            return self.folder_items.all()
        
        # Get content types
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        dataset_ct = ContentType.objects.get_for_model(Dataset)
        
        visible_items = []
        
        for folder_item in self.folder_items.select_related('content_type').all():
            item = folder_item.content_object
            
            # Check if user can access this specific item
            if folder_item.content_type == predictor_ct:
                # For predictors: owner or public (is_private=False) or has permission
                if (item.owner == user or 
                    not item.is_private or
                    (user and user.is_authenticated and 
                     hasattr(item, 'permissions') and 
                     item.permissions.filter(user=user).exists())):
                    visible_items.append(folder_item.id)
            elif folder_item.content_type == dataset_ct:
                # For datasets: owner or public (is_public=True) or has permission
                if (item.owner == user or 
                    item.is_public or
                    (user and user.is_authenticated and 
                     hasattr(item, 'permissions') and 
                     item.permissions.filter(user=user).exists())):
                    visible_items.append(folder_item.id)
        
        return self.folder_items.filter(id__in=visible_items)
    
    def apply_permission_inheritance_to_item(self, folder_item):
        """
        Apply folder permissions to a newly added item.
        
        Args:
            folder_item: FolderItem instance that was just added
        """
        from predictors.models import PredictorPermission
        from dataset.models import DatasetPermission
        
        # Get all users with folder permissions
        folder_permissions = self.permissions.all()
        
        if not folder_permissions.exists():
            return
        
        item = folder_item.content_object
        
        # Apply permissions based on item type
        if hasattr(item, 'predictor_id'):
            # Handle predictor permissions
            for permission in folder_permissions:
                try:
                    PredictorPermission.objects.get_or_create(
                        predictor=item,
                        user=permission.user
                    )
                except Exception as e:
                    # Log error but don't fail the entire operation
                    print(f"Warning: Could not create predictor permission: {e}")
        
        elif hasattr(item, 'dataset_id'):
            # Handle dataset permissions
            for permission in folder_permissions:
                try:
                    DatasetPermission.objects.get_or_create(
                        dataset=item,
                        user=permission.user
                    )
                except Exception as e:
                    # Log error but don't fail the entire operation
                    print(f"Warning: Could not create dataset permission: {e}")
    
    def remove_permission_inheritance_from_item(self, folder_item):
        """
        Remove folder-inherited permissions from an item being removed.
        
        Args:
            folder_item: FolderItem instance that is being removed
        """
        from predictors.models import PredictorPermission
        from dataset.models import DatasetPermission
        
        # Get all users with folder permissions
        folder_permissions = self.permissions.all()
        
        if not folder_permissions.exists():
            return
        
        item = folder_item.content_object
        
        # Remove permissions based on item type
        if hasattr(item, 'predictor_id'):
            # Handle predictor permissions
            for permission in folder_permissions:
                PredictorPermission.objects.filter(
                    predictor=item,
                    user=permission.user
                ).delete()
        
        elif hasattr(item, 'dataset_id'):
            # Handle dataset permissions
            for permission in folder_permissions:
                DatasetPermission.objects.filter(
                    dataset=item,
                    user=permission.user
                ).delete()
    
    def sync_all_item_permissions(self):
        """
        Synchronize permissions for all items in the folder.
        This ensures all folder items have the correct inherited permissions.
        """
        try:
            for folder_item in self.folder_items.all():
                self.apply_permission_inheritance_to_item(folder_item)
        except Exception as e:
            # Log error but don't fail the folder permission grant
            print(f"Warning: Could not sync all item permissions: {e}")
            # Continue with folder permission creation even if item sync fails


class FolderItem(models.Model):
    """Junction model for items within folders using Django ContentType framework."""
    
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='folder_items')
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='added_folder_items')
    
    class Meta:
        unique_together = ('folder', 'content_type', 'object_id')  # Prevent duplicate items in same folder
        indexes = [
            models.Index(fields=['folder', 'content_type']),
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['added_at']),
        ]
    
    def __str__(self):
        return f"{self.content_object} in {self.folder.name}"


class FolderPermission(models.Model):
    """Permission model for folder sharing functionality."""
    
    PERMISSION_CHOICES = [
        ('view', 'View'),
    ]
    
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='permissions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='folder_permissions')
    permission_type = models.CharField(
        max_length=20, 
        choices=PERMISSION_CHOICES, 
        default='view',
        help_text="Type of permission granted"
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='granted_folder_permissions',
        help_text="User who granted this permission"
    )
    
    class Meta:
        unique_together = ('folder', 'user', 'permission_type')  # Prevent duplicate permissions
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['folder']),
            models.Index(fields=['granted_at']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.permission_type} access to {self.folder.name}"


class PinnedFolder(models.Model):
    """Tracks which folders a user has pinned for quick access."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pinned_folders")
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name="pinned_by")
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "folders_pinnedfolder"
        unique_together = ("user", "folder")  # prevent duplicate pins
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["folder"]),
        ]
        verbose_name = "Pinned Folder"
        verbose_name_plural = "Pinned Folders"

    def __str__(self):
        return f"{self.user.username} pinned {self.folder.name}"