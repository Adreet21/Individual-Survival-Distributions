from rest_framework import permissions
from .models import PredictorPermission

# ----------------------------
# Custom Permissions
# ----------------------------
class IsPredictorOwner(permissions.BasePermission):
    """Only predictor owners / superusers can update/delete"""
    def has_object_permission(self, request, view, obj):
        if obj.owner == request.user or request.user.is_superuser:
            return True
        # Users assigned as 'owner' in permissions
        return PredictorPermission.objects.filter(
            predictor=obj, user=request.user, role='owner'
        ).exists()


class CanAccessPredictor(permissions.BasePermission):
    """Allow view if owner / superuser, has permission, or predictor is public"""
    def has_object_permission(self, request, view, obj):
        # Superusers have access to all predictors
        if request.user.is_superuser:
            return True
        
        # Owner always has access
        if obj.owner == request.user:
            return True
        # Users can access public predictors
        if not obj.is_private:
            return True
        if PredictorPermission.objects.filter(predictor=obj, user=request.user).exists():
            return True
        return False