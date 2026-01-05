"""
Middleware for folder access validation and permission enforcement.
"""

import re
from django.http import JsonResponse
from django.urls import resolve
from django.contrib.auth.models import AnonymousUser
from rest_framework import status
from .models import Folder, FolderPermission


class FolderAccessValidationMiddleware:
    """
    Middleware to validate folder access permissions for API requests.
    
    This middleware intercepts requests to folder-related endpoints and validates
    that the user has appropriate permissions to access the requested folder.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
        # Compile regex patterns for folder endpoints
        self.folder_detail_pattern = re.compile(r'^/api/folders/(\d+)/?')
        self.folder_items_pattern = re.compile(r'^/api/folders/(\d+)/items/?')
        self.folder_permissions_pattern = re.compile(r'^/api/folders/(\d+)/permissions/?')
        
        # Methods that require folder access validation
        self.protected_methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        
        # Endpoints that should be excluded from validation
        self.excluded_patterns = [
            re.compile(r'^/api/folders/public/?'),  # Public folder endpoints
            re.compile(r'^/api/folders/permissions/?'),  # Permission management endpoints
            re.compile(r'^/api/folders/?$'),  # Folder list/create endpoints
        ]
    
    def __call__(self, request):
        # Process the request before the view
        response = self.process_request(request)
        if response:
            return response
        
        # Continue with the normal request processing
        response = self.get_response(request)
        
        return response
    
    def process_request(self, request):
        """
        Process incoming requests to validate folder access.
        
        Returns:
            JsonResponse: If access should be denied
            None: If request should continue normally
        """
        # Only validate API requests
        if not request.path.startswith('/api/folders/'):
            return None
        
        # Only validate protected methods
        if request.method not in self.protected_methods:
            return None
        
        # Skip validation for excluded patterns
        for pattern in self.excluded_patterns:
            if pattern.match(request.path):
                return None
        
        # Extract folder ID from URL
        folder_id = self._extract_folder_id(request.path)
        if not folder_id:
            return None
        
        # Validate folder access
        return self._validate_folder_access(request, folder_id)
    
    def _extract_folder_id(self, path):
        """
        Extract folder ID from the request path.
        
        Args:
            path (str): The request path
            
        Returns:
            int: Folder ID if found, None otherwise
        """
        # Try different patterns to extract folder ID
        patterns = [
            self.folder_detail_pattern,
            self.folder_items_pattern,
            self.folder_permissions_pattern,
        ]
        
        for pattern in patterns:
            match = pattern.match(path)
            if match:
                try:
                    return int(match.group(1))
                except (ValueError, IndexError):
                    continue
        
        return None
    
    def _validate_folder_access(self, request, folder_id):
        """
        Validate that the user has access to the specified folder.
        
        Args:
            request: The HTTP request object
            folder_id (int): The folder ID to validate access for
            
        Returns:
            JsonResponse: If access should be denied
            None: If access is allowed
        """
        try:
            folder = Folder.objects.get(folder_id=folder_id)
        except Folder.DoesNotExist:
            return JsonResponse(
                {'error': 'Folder not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if user has access to the folder
        user = request.user
        
        # Anonymous users can only access public folders with public content
        if isinstance(user, AnonymousUser) or not user.is_authenticated:
            if folder.should_hide_from_public():
                return JsonResponse(
                    {'error': 'Folder not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            return None
        
        # Authenticated users: check ownership, permissions, or public access
        if self._user_has_folder_access(user, folder):
            return None
        
        # Access denied
        return JsonResponse(
            {'error': 'You do not have permission to access this folder'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    def _user_has_folder_access(self, user, folder):
        """
        Check if a user has access to a folder.
        
        Args:
            user: The user object
            folder: The folder object
            
        Returns:
            bool: True if user has access, False otherwise
        """
        # Owner always has access
        if folder.owner == user:
            return True
        
        # Check explicit folder permissions
        if FolderPermission.objects.filter(folder=folder, user=user).exists():
            return True
        
        # Check if folder is public and has public content
        if not folder.is_private and not folder.should_hide_from_public():
            return True
        
        return False


class FolderPermissionInheritanceMiddleware:
    """
    Middleware to handle permission inheritance when items are added to folders.
    
    This middleware ensures that when items are added to folders, users with
    folder permissions automatically get access to the new items.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
        # Pattern to match folder item addition endpoints
        self.add_item_pattern = re.compile(r'^/api/folders/(\d+)/items/?$')
    
    def __call__(self, request):
        # Process the request before the view
        folder_id = self._should_apply_inheritance(request)
        
        # Continue with the normal request processing
        response = self.get_response(request)
        
        # Process the response after the view (if item was successfully added)
        if folder_id and response.status_code == 200:
            self._apply_inheritance_to_new_item(request, folder_id)
        
        return response
    
    def _should_apply_inheritance(self, request):
        """
        Check if this request should trigger permission inheritance.
        
        Args:
            request: The HTTP request object
            
        Returns:
            int: Folder ID if inheritance should be applied, None otherwise
        """
        # Only apply to POST requests (adding items)
        if request.method != 'POST':
            return None
        
        # Check if this is a folder item addition endpoint
        match = self.add_item_pattern.match(request.path)
        if match:
            try:
                return int(match.group(1))
            except (ValueError, IndexError):
                pass
        
        return None
    
    def _apply_inheritance_to_new_item(self, request, folder_id):
        """
        Apply permission inheritance to newly added folder items.
        
        Args:
            request: The HTTP request object
            folder_id (int): The folder ID where item was added
        """
        try:
            folder = Folder.objects.get(folder_id=folder_id)
            
            # Get all users with folder permissions
            folder_permissions = FolderPermission.objects.filter(folder=folder)
            
            if not folder_permissions.exists():
                return
            
            # Get the item details from request data
            item_type = request.data.get('item_type')
            item_id = request.data.get('item_id')
            
            if not item_type or not item_id:
                return
            
            # Apply permissions to the new item for all folder users
            self._grant_item_permissions(folder_permissions, item_type, item_id)
            
        except (Folder.DoesNotExist, Exception):
            # Silently fail - don't break the main request
            pass
    
    def _grant_item_permissions(self, folder_permissions, item_type, item_id):
        """
        Grant permissions to an item for all users with folder access.
        
        Args:
            folder_permissions: QuerySet of FolderPermission objects
            item_type (str): Type of item ('predictor' or 'dataset')
            item_id (int): ID of the item
        """
        from predictors.models import Predictor, PredictorPermission
        from dataset.models import Dataset, DatasetPermission
        
        try:
            if item_type == 'predictor':
                item = Predictor.objects.get(predictor_id=item_id)
                for permission in folder_permissions:
                    PredictorPermission.objects.get_or_create(
                        predictor=item,
                        user=permission.user
                    )
            
            elif item_type == 'dataset':
                item = Dataset.objects.get(dataset_id=item_id)
                for permission in folder_permissions:
                    DatasetPermission.objects.get_or_create(
                        dataset=item,
                        user=permission.user
                    )
        
        except (Predictor.DoesNotExist, Dataset.DoesNotExist, Exception):
            # Silently fail - don't break the main request
            pass