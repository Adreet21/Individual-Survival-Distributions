from rest_framework import permissions
from .models import DatasetPermission

# ----------------------------
# Custom Permissions
# ----------------------------

class IsDatasetOwner(permissions.BasePermission):
    """Only dataset owners / superuser can update/delete"""
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user or request.user.is_superuser


class CanAccessDataset(permissions.BasePermission):
    """Allow view if owner / superuser, has permission or dataset is public"""
    def has_object_permission(self, request, view, obj):
        # Superusers have access to all datasets
        if request.user.is_superuser:
            return True
        # Owner always has access
        if obj.owner == request.user:
            return True
        if obj.is_public:
            return True
        # Other users can access only if a DatasetPermission exists
        return DatasetPermission.objects.filter(dataset=obj, user=request.user).exists()
