from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from .models import Prediction
from .serializers import PredictionSerializer


# ----------------------------
# Prediction ViewSet
# ----------------------------
class PredictionViewSet(viewsets.ModelViewSet):
    """
    API viewset for managing saved predictions.
    Users can save, list, view, and delete their prediction results.
    """
    serializer_class = PredictionSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return only predictions owned by the current user."""
        user = self.request.user
        queryset = Prediction.objects.filter(user=user).select_related(
            'predictor', 'dataset', 'user'
        )
        
        # Support search by name, predictor name, or dataset name
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(predictor__name__icontains=search) |
                Q(dataset__dataset_name__icontains=search)
            )
        
        return queryset
    
    def perform_create(self, serializer):
        """Save prediction with the current user as owner."""
        serializer.save(user=self.request.user)
    
    def perform_destroy(self, instance):
        """Only allow users to delete their own predictions."""
        if instance.user != self.request.user:
            raise PermissionDenied("You can only delete your own predictions")
        instance.delete()
