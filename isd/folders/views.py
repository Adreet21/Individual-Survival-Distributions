from django.db import IntegrityError
from django.contrib.contenttypes.models import ContentType

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import Folder, FolderItem, FolderPermission, PinnedFolder
from .serializers import (
    FolderSerializer,
    FolderPermissionSerializer,
    FolderItemSerializer,
    AddItemToFolderSerializer,
    RemoveItemFromFolderSerializer,
    PinnedFolderSerializer
)

from predictors.models import Predictor
from dataset.models import Dataset

# ----------------------------
# Custom Permissions
# ----------------------------
class IsFolderOwner(permissions.BasePermission):
    """Only folder owners can update/delete"""
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user


class CanAccessFolder(permissions.BasePermission):
    """Allow view if owner, has permission, or folder is public"""
    def has_object_permission(self, request, view, obj):
        # Owner always has access
        if obj.owner == request.user:
            return True
        # Users can access public folders
        if not obj.is_private:
            return True
        # Other users can access only if a FolderPermission exists
        return FolderPermission.objects.filter(folder=obj, user=request.user).exists()


# ----------------------------
# Folder ViewSet
# ----------------------------
@extend_schema_view(
    list=extend_schema(
        summary="List folders",
        description="Retrieve a list of folders the user owns, has been granted access to, or are public.",
        tags=["Folders"]
    ),
    create=extend_schema(
        summary="Create a new folder",
        description="Create a new folder. The authenticated user becomes the owner.",
        tags=["Folders"]
    ),
    retrieve=extend_schema(
        summary="Get folder details",
        description="Retrieve detailed information about a specific folder including its contents.",
        tags=["Folders"]
    ),
    update=extend_schema(
        summary="Update folder",
        description="Update all fields of a folder. Only the owner can update.",
        tags=["Folders"]
    ),
    partial_update=extend_schema(
        summary="Partially update folder",
        description="Update specific fields of a folder. Only the owner can update.",
        tags=["Folders"]
    ),
    destroy=extend_schema(
        summary="Delete folder",
        description="Delete a folder. Only the owner can delete. Items in the folder are preserved.",
        tags=["Folders"]
    ),
)
class FolderViewSet(viewsets.ModelViewSet):
    """
    API viewset for Folder model with proper access control.
    
    Provides CRUD operations for folders with ownership and permission validation.
    """
    
    serializer_class = FolderSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """
        Returns folders accessible to the user using the custom manager.
        Applies auto-hide logic for public folders.
        Supports 'owned_only' query parameter to return only owned folders.
        """
        user = self.request.user
        owned_only = self.request.query_params.get('owned_only', '').lower() == 'true'
        
        if owned_only:
            # Return only folders owned by the user
            return (
                Folder.objects.filter(owner=user)
                .prefetch_related('folder_items', 'permissions')
                .order_by('name')
            )
        else:
            # Return all accessible folders (owned + shared + public)
            return (
                Folder.objects.accessible_to_user(user)
                .prefetch_related('folder_items', 'permissions')
                .order_by('name')
            )
    
    def get_object(self):
        """
        Override to run permission checks first, so unauthorized users get 403 instead of 404.
        """
        # Get the object from all folders, not just the filtered queryset
        queryset = Folder.objects.all()
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        filter_kwargs = {self.lookup_field: self.kwargs[lookup_url_kwarg]}
        
        try:
            obj = queryset.get(**filter_kwargs)
        except Folder.DoesNotExist:
            from django.http import Http404
            raise Http404("No Folder matches the given query.")
        
        self.check_object_permissions(self.request, obj)
        return obj
    
    def get_permissions(self):
        """
        Assign permissions based on the action being performed:
        - update/partial_update/destroy: must be the owner
        - retrieve: owner, shared user, or public folder
        - list/create: any authenticated user
        """
        if self.action in ["update", "partial_update", "destroy"]:
            return [IsFolderOwner()]
        elif self.action == "retrieve":
            return [CanAccessFolder()]
        return super().get_permissions()
    
    def perform_create(self, serializer):
        """Assign the logged-in user as the owner."""
        serializer.save(owner=self.request.user)
    
    @extend_schema(
        summary="Add item to folder",
        description="Add a predictor or dataset to the folder. Only folder owners can add items.",
        request=AddItemToFolderSerializer,
        responses={200: {"description": "Item added successfully"}},
        tags=["Folders"]
    )
    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        """
        Add an item (predictor or dataset) to the folder.
        Only folder owners can add items.
        """
        folder = self.get_object()
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can add items.")
        
        serializer = AddItemToFolderSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        
        item = serializer.validated_data['item']
        item_type = serializer.validated_data['item_type']
        
        # Get the content type for the item
        if item_type == 'predictor':
            content_type = ContentType.objects.get_for_model(Predictor)
            object_id = item.predictor_id
        else:  # dataset
            content_type = ContentType.objects.get_for_model(Dataset)
            object_id = item.dataset_id
        
        # Check if item is already in the folder
        existing_item = FolderItem.objects.filter(
            folder=folder,
            content_type=content_type,
            object_id=object_id
        ).first()
        
        if existing_item:
            # Item is already in folder - return success (idempotent operation)
            return Response(
                {
                    "message": "Item is already in folder",
                    "item": FolderItemSerializer(existing_item).data
                },
                status=status.HTTP_200_OK
            )
        
        # Create the folder item
        try:
            folder_item = FolderItem.objects.create(
                folder=folder,
                content_type=content_type,
                object_id=object_id,
                added_by=request.user
            )
        except IntegrityError:
            # Handle race condition - item was added between check and create
            existing_item = FolderItem.objects.filter(
                folder=folder,
                content_type=content_type,
                object_id=object_id
            ).first()
            if existing_item:
                return Response(
                    {
                        "message": "Item is already in folder",
                        "item": FolderItemSerializer(existing_item).data
                    },
                    status=status.HTTP_200_OK
                )
            else:
                # Re-raise if it's a different integrity error
                raise
        
        # Apply permission inheritance to the new item
        folder.apply_permission_inheritance_to_item(folder_item)
        
        return Response(
            {
                "message": "Item added to folder successfully",
                "item": FolderItemSerializer(folder_item).data
            },
            status=status.HTTP_200_OK
        )
    
    @extend_schema(
        summary="Remove item from folder",
        description="Remove a predictor or dataset from the folder. Only folder owners can remove items.",
        request=RemoveItemFromFolderSerializer,
        responses={200: {"description": "Item removed successfully"}},
        tags=["Folders"]
    )
    @action(detail=True, methods=["delete"], url_path="items/remove")
    def remove_item(self, request, pk=None):
        """
        Remove an item (predictor or dataset) from the folder.
        Only folder owners can remove items.
        """
        folder = self.get_object()
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can remove items.")
        
        serializer = RemoveItemFromFolderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        item_type = serializer.validated_data['item_type']
        item_id = serializer.validated_data['item_id']
        
        # Get the content type and object_id
        if item_type == 'predictor':
            content_type = ContentType.objects.get_for_model(Predictor)
            object_id = item_id
        else:  # dataset
            content_type = ContentType.objects.get_for_model(Dataset)
            object_id = item_id
        
        # Find and remove the folder item
        try:
            folder_item = FolderItem.objects.get(
                folder=folder,
                content_type=content_type,
                object_id=object_id
            )
            
            # Remove permission inheritance before deleting
            folder.remove_permission_inheritance_from_item(folder_item)
            
            folder_item.delete()
            
            return Response(
                {"message": "Item removed from folder successfully"},
                status=status.HTTP_200_OK
            )
        except FolderItem.DoesNotExist:
            return Response(
                {"error": "Item not found in this folder"},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @extend_schema(
        summary="List folder items",
        description="List all items in the folder that the user has access to.",
        responses={200: FolderItemSerializer(many=True)},
        tags=["Folders"]
    )
    @action(detail=True, methods=["get"], url_path="items")
    def list_items(self, request, pk=None):
        """
        List all items in the folder that the user has access to.
        Uses the folder's visibility method for efficient filtering.
        """
        folder = self.get_object()
        
        # Use the folder's method to get visible items for this user
        visible_items = folder.get_visible_items_for_user(request.user)
        
        serializer = FolderItemSerializer(visible_items, many=True)
        return Response(serializer.data)
    
    @extend_schema(
        summary="List folder permissions",
        description="List all users who have access to this folder. Only folder owners can view permissions.",
        responses={200: FolderPermissionSerializer(many=True)},
        tags=["Folders"]
    )
    @action(detail=True, methods=["get"], url_path="permissions")
    def list_permissions(self, request, pk=None):
        """
        List all permissions for this folder.
        Only folder owners can view permissions.
        """
        folder = self.get_object()
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can view permissions.")
        
        permissions = folder.permissions.all()
        serializer = FolderPermissionSerializer(permissions, many=True)
        return Response(serializer.data)
    
    @extend_schema(
        summary="Grant folder access",
        description="Grant a user access to this folder and apply permission inheritance.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'user_id': {'type': 'integer'},
                    'permission_type': {'type': 'string', 'default': 'view'}
                },
                'required': ['user_id']
            }
        },
        responses={200: {"description": "Permission granted successfully"}},
        tags=["Folders"]
    )
    @action(detail=True, methods=["post"], url_path="permissions/grant")
    def grant_permission(self, request, pk=None):
        """
        Grant a user access to this folder.
        Applies permission inheritance to all folder items.
        """
        folder = self.get_object()
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can grant permissions.")
        
        user_id = request.data.get('user_id')
        permission_type = request.data.get('permission_type', 'view')
        
        if not user_id:
            return Response(
                {"error": "user_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from django.contrib.auth.models import User
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Create or get folder permission
        permission, created = FolderPermission.objects.get_or_create(
            folder=folder,
            user=user,
            permission_type=permission_type,
            defaults={'granted_by': request.user}
        )
        
        if created:
            # Apply permission inheritance to folder items
            folder.sync_all_item_permissions()
            
            return Response({
                'message': 'Permission granted successfully',
                'permission': FolderPermissionSerializer(permission).data
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'message': 'User already has access to this folder',
                'permission': FolderPermissionSerializer(permission).data
            }, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Revoke folder access",
        description="Revoke a user's access to this folder and remove permission inheritance.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'user_id': {'type': 'integer'}
                },
                'required': ['user_id']
            }
        },
        responses={200: {"description": "Permission revoked successfully"}},
        tags=["Folders"]
    )
    @action(detail=True, methods=["post"], url_path="permissions/revoke")
    def revoke_permission(self, request, pk=None):
        """
        Revoke a user's access to this folder.
        Removes permission inheritance from all folder items.
        """
        folder = self.get_object()
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can revoke permissions.")
        
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response(
                {"error": "user_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            from django.contrib.auth.models import User
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Find and delete folder permission
        permissions = FolderPermission.objects.filter(
            folder=folder,
            user=user
        )
        
        if permissions.exists():
            # Remove permission inheritance from folder items
            from predictors.models import PredictorPermission
            from dataset.models import DatasetPermission
            
            for folder_item in folder.folder_items.all():
                item = folder_item.content_object
                
                if hasattr(item, 'predictor_id'):
                    PredictorPermission.objects.filter(
                        predictor=item,
                        user=user
                    ).delete()
                elif hasattr(item, 'dataset_id'):
                    DatasetPermission.objects.filter(
                        dataset=item,
                        user=user
                    ).delete()
            
            permissions.delete()
            
            return Response({
                'message': 'Permission revoked successfully'
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'message': 'User does not have access to this folder'
            }, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        summary="Duplicate folder",
        description="Create a copy of an existing folder with all its items. Only folder owners can duplicate.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string', 'description': 'Name for the duplicated folder'},
                    'description': {'type': 'string', 'description': 'Optional description for the duplicated folder'},
                    'is_private': {'type': 'boolean', 'description': 'Privacy setting for the duplicated folder'}
                },
                'required': ['name']
            }
        },
        responses={200: {"description": "Folder duplicated successfully"}},
        tags=["Folders"]
    )
    @action(detail=True, methods=["post"], url_path="duplicate")
    def duplicate_folder(self, request, pk=None):
        """
        Create a copy of an existing folder with all its items.
        Only folder owners can duplicate their folders.
        """
        source_folder = self.get_object()
        
        # Check if user is the folder owner
        if source_folder.owner != request.user:
            raise PermissionDenied("Only folder owners can duplicate folders.")
        
        new_name = request.data.get('name')
        new_description = request.data.get('description', source_folder.description)
        new_is_private = request.data.get('is_private', source_folder.is_private)
        
        if not new_name:
            return Response(
                {"error": "name is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if folder name already exists for this user
        if Folder.objects.filter(owner=request.user, name=new_name).exists():
            return Response(
                {"error": "You already have a folder with this name"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Create the new folder
            new_folder = Folder.objects.create(
                name=new_name,
                description=new_description,
                owner=request.user,
                is_private=new_is_private
            )
            
            # Copy all items from source folder to new folder
            items_copied = 0
            items_skipped = 0
            
            for folder_item in source_folder.folder_items.all():
                # Check if user still has access to the item
                item = folder_item.content_object
                has_access = False
                
                if hasattr(item, 'owner') and item.owner == request.user:
                    has_access = True
                elif hasattr(item, 'is_private') and not item.is_private:
                    has_access = True
                elif hasattr(item, 'is_public') and item.is_public:
                    has_access = True
                elif hasattr(item, 'permissions') and item.permissions.filter(user=request.user).exists():
                    has_access = True
                
                if has_access:
                    # Check if item is already in the new folder (shouldn't happen, but safety check)
                    existing_item = FolderItem.objects.filter(
                        folder=new_folder,
                        content_type=folder_item.content_type,
                        object_id=folder_item.object_id
                    ).first()
                    
                    if not existing_item:
                        # Create the folder item in the new folder
                        new_folder_item = FolderItem.objects.create(
                            folder=new_folder,
                            content_type=folder_item.content_type,
                            object_id=folder_item.object_id,
                            added_by=request.user
                        )
                        
                        # Apply permission inheritance to the new item
                        new_folder.apply_permission_inheritance_to_item(new_folder_item)
                        items_copied += 1
                    else:
                        items_skipped += 1
                else:
                    items_skipped += 1
            
            # Serialize the new folder
            serializer = FolderSerializer(new_folder)
            
            return Response({
                'message': 'Folder duplicated successfully',
                'folder': serializer.data,
                'items_copied': items_copied,
                'items_skipped': items_skipped,
                'total_items': source_folder.item_count
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"error": f"Failed to duplicate folder: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ----------------------------
# Folder Permission ViewSet
# ----------------------------
@extend_schema_view(
    list=extend_schema(
        summary="List folder permissions",
        description="List all users who have access to folders owned by the authenticated user.",
        tags=["Folder Permissions"]
    ),
    create=extend_schema(
        summary="Grant folder access",
        description="Grant a user access to a specific folder (only the owner can do this).",
        tags=["Folder Permissions"]
    ),
    destroy=extend_schema(
        summary="Revoke folder access",
        description="Revoke a user's access to a folder (only the owner can do this).",
        tags=["Folder Permissions"]
    ),
)
class FolderPermissionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing folder permissions.
    Allows folder owners to grant or revoke access to their folders.
    """
    
    serializer_class = FolderPermissionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """
        Only return permissions for folders owned by the current user.
        Prevents non-owners from viewing or modifying other users' folder permissions.
        """
        return FolderPermission.objects.filter(folder__owner=self.request.user)
    
    def perform_create(self, serializer):
        """
        Only the folder owner can grant access to others.
        Raises PermissionDenied if the request user is not the owner.
        """
        folder = serializer.validated_data["folder"]
        if folder.owner != self.request.user:
            raise PermissionDenied("Only the folder owner can grant access.")
        
        # Grant folder permission
        permission = serializer.save(granted_by=self.request.user)
        
        # Apply permission inheritance to folder items
        self._apply_permission_inheritance(folder, permission.user)
    
    def perform_destroy(self, instance):
        """
        Only the folder owner can revoke access.
        Raises PermissionDenied if the request user is not the owner.
        """
        if instance.folder.owner != self.request.user:
            raise PermissionDenied("Only the folder owner can revoke access.")
        
        # Remove permission inheritance from folder items
        self._remove_permission_inheritance(instance.folder, instance.user)
        
        instance.delete()
    
    def _apply_permission_inheritance(self, folder, user):
        """
        Apply permission inheritance to all items in the folder.
        Grants access to predictors and datasets within the folder.
        """
        from predictors.models import PredictorPermission
        from dataset.models import DatasetPermission
        
        for folder_item in folder.folder_items.all():
            item = folder_item.content_object
            
            # Handle predictor permissions
            if hasattr(item, 'predictor_id'):
                PredictorPermission.objects.get_or_create(
                    predictor=item,
                    user=user
                )
            
            # Handle dataset permissions
            elif hasattr(item, 'dataset_id'):
                DatasetPermission.objects.get_or_create(
                    dataset=item,
                    user=user
                )
    
    def _remove_permission_inheritance(self, folder, user):
        """
        Remove permission inheritance from all items in the folder.
        Revokes access to predictors and datasets within the folder.
        """
        from predictors.models import PredictorPermission
        from dataset.models import DatasetPermission
        
        for folder_item in folder.folder_items.all():
            item = folder_item.content_object
            
            # Handle predictor permissions
            if hasattr(item, 'predictor_id'):
                PredictorPermission.objects.filter(
                    predictor=item,
                    user=user
                ).delete()
            
            # Handle dataset permissions
            elif hasattr(item, 'dataset_id'):
                DatasetPermission.objects.filter(
                    dataset=item,
                    user=user
                ).delete()
    
    @extend_schema(
        summary="Bulk grant folder access",
        description="Grant multiple users access to a specific folder and apply permission inheritance.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'folder_id': {'type': 'integer'},
                    'user_ids': {'type': 'array', 'items': {'type': 'integer'}},
                    'permission_type': {'type': 'string', 'default': 'view'}
                },
                'required': ['folder_id', 'user_ids']
            }
        },
        responses={200: {"description": "Permissions granted successfully"}},
        tags=["Folder Permissions"]
    )
    @action(detail=False, methods=["post"], url_path="bulk-grant")
    def bulk_grant_access(self, request):
        """
        Grant access to multiple users for a specific folder.
        Applies permission inheritance to all folder items.
        """
        folder_id = request.data.get('folder_id')
        user_ids = request.data.get('user_ids', [])
        permission_type = request.data.get('permission_type', 'view')
        
        if not folder_id:
            return Response(
                {"error": "folder_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not user_ids or not isinstance(user_ids, list):
            return Response(
                {"error": "user_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            folder = Folder.objects.get(folder_id=folder_id)
        except Folder.DoesNotExist:
            return Response(
                {"error": "Folder not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can grant access.")
        
        # Validate users exist
        from django.contrib.auth.models import User
        users = User.objects.filter(id__in=user_ids)
        if users.count() != len(user_ids):
            return Response(
                {"error": "One or more users not found"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        granted_permissions = []
        errors = []
        
        for user in users:
            try:
                # Create or get folder permission
                permission, created = FolderPermission.objects.get_or_create(
                    folder=folder,
                    user=user,
                    permission_type=permission_type,
                    defaults={'granted_by': request.user}
                )
                
                if created:
                    # Apply permission inheritance to folder items
                    self._apply_permission_inheritance(folder, user)
                    granted_permissions.append({
                        'user_id': user.id,
                        'username': user.username,
                        'permission_type': permission_type,
                        'status': 'granted'
                    })
                else:
                    granted_permissions.append({
                        'user_id': user.id,
                        'username': user.username,
                        'permission_type': permission_type,
                        'status': 'already_exists'
                    })
                    
            except Exception as e:
                errors.append({
                    'user_id': user.id,
                    'username': user.username,
                    'error': str(e)
                })
        
        return Response({
            'message': f'Bulk permission grant completed',
            'granted_permissions': granted_permissions,
            'errors': errors,
            'total_processed': len(users),
            'successful': len(granted_permissions),
            'failed': len(errors)
        }, status=status.HTTP_200_OK)
    
    @extend_schema(
        summary="Bulk revoke folder access",
        description="Revoke access from multiple users for a specific folder and remove permission inheritance.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'folder_id': {'type': 'integer'},
                    'user_ids': {'type': 'array', 'items': {'type': 'integer'}}
                },
                'required': ['folder_id', 'user_ids']
            }
        },
        responses={200: {"description": "Permissions revoked successfully"}},
        tags=["Folder Permissions"]
    )
    @action(detail=False, methods=["post"], url_path="bulk-revoke")
    def bulk_revoke_access(self, request):
        """
        Revoke access from multiple users for a specific folder.
        Removes permission inheritance from all folder items.
        """
        folder_id = request.data.get('folder_id')
        user_ids = request.data.get('user_ids', [])
        
        if not folder_id:
            return Response(
                {"error": "folder_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not user_ids or not isinstance(user_ids, list):
            return Response(
                {"error": "user_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            folder = Folder.objects.get(folder_id=folder_id)
        except Folder.DoesNotExist:
            return Response(
                {"error": "Folder not found"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user is the folder owner
        if folder.owner != request.user:
            raise PermissionDenied("Only folder owners can revoke access.")
        
        revoked_permissions = []
        errors = []
        
        for user_id in user_ids:
            try:
                from django.contrib.auth.models import User
                user = User.objects.get(id=user_id)
                
                # Find and delete folder permission
                permissions = FolderPermission.objects.filter(
                    folder=folder,
                    user=user
                )
                
                if permissions.exists():
                    # Remove permission inheritance from folder items
                    self._remove_permission_inheritance(folder, user)
                    
                    permissions.delete()
                    revoked_permissions.append({
                        'user_id': user.id,
                        'username': user.username,
                        'status': 'revoked'
                    })
                else:
                    revoked_permissions.append({
                        'user_id': user.id,
                        'username': user.username,
                        'status': 'not_found'
                    })
                    
            except User.DoesNotExist:
                errors.append({
                    'user_id': user_id,
                    'error': 'User not found'
                })
            except Exception as e:
                errors.append({
                    'user_id': user_id,
                    'error': str(e)
                })
        
        return Response({
            'message': f'Bulk permission revoke completed',
            'revoked_permissions': revoked_permissions,
            'errors': errors,
            'total_processed': len(user_ids),
            'successful': len(revoked_permissions),
            'failed': len(errors)
        }, status=status.HTTP_200_OK)
    

    
    @extend_schema(
        summary="Bulk move items between folders",
        description="Move multiple items from one folder to another. Only folder owners can move items.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'source_folder_id': {'type': 'integer', 'description': 'ID of the source folder'},
                    'target_folder_id': {'type': 'integer', 'description': 'ID of the target folder (null to move to main collection)'},
                    'items': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'item_type': {'type': 'string', 'enum': ['predictor', 'dataset']},
                                'item_id': {'type': 'integer'}
                            },
                            'required': ['item_type', 'item_id']
                        }
                    }
                },
                'required': ['items']
            }
        },
        responses={200: {"description": "Items moved successfully"}},
        tags=["Folders"]
    )
    @action(detail=False, methods=["post"], url_path="bulk-move-items")
    def bulk_move_items(self, request):
        """
        Move multiple items between folders or to main collection.
        Only folder owners can move items from their folders.
        """
        source_folder_id = request.data.get('source_folder_id')
        target_folder_id = request.data.get('target_folder_id')
        items = request.data.get('items', [])
        
        if not items or not isinstance(items, list):
            return Response(
                {"error": "items must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate source folder if provided
        source_folder = None
        if source_folder_id:
            try:
                source_folder = Folder.objects.get(folder_id=source_folder_id)
                if source_folder.owner != request.user:
                    raise PermissionDenied("Only folder owners can move items from their folders.")
            except Folder.DoesNotExist:
                return Response(
                    {"error": "Source folder not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Validate target folder if provided
        target_folder = None
        if target_folder_id:
            try:
                target_folder = Folder.objects.get(folder_id=target_folder_id)
                if target_folder.owner != request.user:
                    raise PermissionDenied("Only folder owners can add items to their folders.")
            except Folder.DoesNotExist:
                return Response(
                    {"error": "Target folder not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        moved_items = []
        errors = []
        
        for item_data in items:
            item_type = item_data.get('item_type')
            item_id = item_data.get('item_id')
            
            if not item_type or not item_id:
                errors.append({
                    'item': item_data,
                    'error': 'item_type and item_id are required'
                })
                continue
            
            try:
                # Get the content type and validate item exists
                if item_type == 'predictor':
                    item = Predictor.objects.get(predictor_id=item_id)
                    content_type = ContentType.objects.get_for_model(Predictor)
                    object_id = item.predictor_id
                elif item_type == 'dataset':
                    item = Dataset.objects.get(dataset_id=item_id)
                    content_type = ContentType.objects.get_for_model(Dataset)
                    object_id = item.dataset_id
                else:
                    errors.append({
                        'item': item_data,
                        'error': 'Invalid item_type'
                    })
                    continue
                
                # Check if user has access to the item
                has_access = False
                if hasattr(item, 'owner') and item.owner == request.user:
                    has_access = True
                elif hasattr(item, 'permissions') and item.permissions.filter(user=request.user).exists():
                    has_access = True
                
                if not has_access:
                    errors.append({
                        'item': item_data,
                        'error': 'You do not have access to this item'
                    })
                    continue
                
                # Remove from source folder if specified
                if source_folder:
                    source_folder_item = FolderItem.objects.filter(
                        folder=source_folder,
                        content_type=content_type,
                        object_id=object_id
                    ).first()
                    
                    if source_folder_item:
                        # Remove permission inheritance before deleting
                        source_folder.remove_permission_inheritance_from_item(source_folder_item)
                        source_folder_item.delete()
                
                # Add to target folder if specified
                if target_folder:
                    # Check if item is already in target folder
                    existing_item = FolderItem.objects.filter(
                        folder=target_folder,
                        content_type=content_type,
                        object_id=object_id
                    ).first()
                    
                    if not existing_item:
                        # Create the folder item in target folder
                        folder_item = FolderItem.objects.create(
                            folder=target_folder,
                            content_type=content_type,
                            object_id=object_id,
                            added_by=request.user
                        )
                        
                        # Apply permission inheritance to the new item
                        target_folder.apply_permission_inheritance_to_item(folder_item)
                
                moved_items.append({
                    'item_type': item_type,
                    'item_id': item_id,
                    'status': 'moved'
                })
                
            except (Predictor.DoesNotExist, Dataset.DoesNotExist):
                errors.append({
                    'item': item_data,
                    'error': f'{item_type.capitalize()} not found'
                })
            except Exception as e:
                errors.append({
                    'item': item_data,
                    'error': str(e)
                })
        
        return Response({
            'message': f'Bulk move completed',
            'moved_items': moved_items,
            'errors': errors,
            'total_processed': len(items),
            'successful': len(moved_items),
            'failed': len(errors)
        }, status=status.HTTP_200_OK)


# ----------------------------
# Public Folder Views
# ----------------------------
@extend_schema(
    summary="List public folders",
    description="Retrieve a list of all public folders with auto-hide logic applied. No authentication required.",
    tags=["Public Folders"]
)
@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def list_public_folders(request):
    """
    List all public folders without authentication.
    Uses efficient database-level filtering with auto-hide logic.
    """
    try:
        # Use the custom manager method for efficient filtering
        public_folders = Folder.objects.public_visible().order_by('name')
        
        # Serialize the data
        serializer = FolderSerializer(public_folders, many=True)
        
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {
                'error': 'Failed to fetch public folders',
                'message': str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@extend_schema(
    summary="Get public folder contents",
    description="Retrieve contents of a specific public folder. Only shows public items. No authentication required.",
    tags=["Public Folders"]
)
@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def get_public_folder_contents(request, folder_id):
    """
    Get contents of a specific public folder.
    Only returns items that are public (visible to anonymous users).
    """
    try:
        # Get the folder and check if it should be visible to public
        try:
            folder = Folder.objects.get(folder_id=folder_id)
        except Folder.DoesNotExist:
            return Response(
                {'error': 'Folder not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if folder should be hidden from public
        if folder.should_hide_from_public():
            return Response(
                {'error': 'Folder not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get visible items for anonymous user (None)
        visible_items = folder.get_visible_items_for_user(None)
        
        # Serialize the data
        serializer = FolderItemSerializer(visible_items, many=True)
        
        return Response({
            'folder': {
                'folder_id': folder.folder_id,
                'name': folder.name,
                'description': folder.description,
                'owner': folder.owner.username,
                'public_item_count': folder.get_public_item_count_efficient(),
                'created_at': folder.created_at,
            },
            'items': serializer.data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {
                'error': 'Failed to fetch folder contents',
                'message': str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# ----------------------------
# Pinned Folder ViewSet
# ----------------------------
class PinnedFolderViewSet(viewsets.ModelViewSet):
    """
    API viewset for managing pinned folders.
    - GET: list pinned folders
    - POST: pin a folder
    - DELETE: unpin a folder
    """
    serializer_class = PinnedFolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Return folders pinned by the current user.
        """
        return PinnedFolder.objects.filter(user=self.request.user).order_by("-pinned_at")

    def perform_create(self, serializer):
        """Automatically assign the current user when pinning"""
        serializer.save(user=self.request.user)
