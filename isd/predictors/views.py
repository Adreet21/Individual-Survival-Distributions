from django.db.models import Q
from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from .models import Predictor, PredictorPermission, PinnedPredictor
from .serializers import PredictorSerializer, PredictorPermissionSerializer, PinnedPredictorSerializer
from .ml_client import MLAPIClient
import pandas as pd
import os
import requests
import re
import json
from django.conf import settings
from django.utils import timezone
from dataset.models import Dataset
from dataset.views import CanAccessDataset
from .permissions import CanAccessPredictor, IsPredictorOwner




# ----------------------------
# Predictor ViewSet
# ----------------------------
class PredictorViewSet(viewsets.ModelViewSet):
    """API viewset for Predictor model with proper access control."""

    serializer_class = PredictorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Returns predictors the user owns, has been granted access to, or are public.
        Supports folder filtering via query parameters.
        - Owned predictors: user is the owner
        - Shared predictors: user has PredictorPermission
        - Public predictors: is_private=False
        """
        user = self.request.user

        if user.is_superuser:
            return Predictor.objects.all().prefetch_related("permissions", "pinned_by").order_by("name")

        queryset = (
            Predictor.objects.filter(Q(owner=user) | Q(permissions__user=user))
            .distinct()
            .prefetch_related("permissions", "pinned_by")
            .order_by("name")
        )
        
        # Support folder filtering
        folder_id = self.request.query_params.get('folder_id')
        print(folder_id)
        if folder_id is not None:
            if folder_id == 'null' or folder_id == '':
                # Filter for items not in any folder
                from folders.models import FolderItem
                from django.contrib.contenttypes.models import ContentType
                
                predictor_ct = ContentType.objects.get_for_model(Predictor)
                items_in_folders = FolderItem.objects.filter(
                    content_type=predictor_ct
                ).values_list('object_id', flat=True)
                
                queryset = queryset.exclude(predictor_id__in=items_in_folders)
            else:
                # Filter for items in specific folder
                try:
                    folder_id = int(folder_id)
                    from folders.models import FolderItem
                    from django.contrib.contenttypes.models import ContentType
                    
                    predictor_ct = ContentType.objects.get_for_model(Predictor)
                    items_in_folder = FolderItem.objects.filter(
                        folder_id=folder_id,
                        content_type=predictor_ct
                    ).values_list('object_id', flat=True)
                    
                    queryset = queryset.filter(predictor_id__in=items_in_folder)
                except (ValueError, TypeError):
                    # Invalid folder_id, return empty queryset
                    queryset = queryset.none()
        
        return queryset

    def get_object(self):
        """
        Override to run permission checks first, so unauthorized users get 403 instead of 404.
        (Basically sends 403 to let us know object exists, user just doesn't have access)
        """
        # Get the object from all predictors, not just the filtered queryset
        queryset = Predictor.objects.all()
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        filter_kwargs = {self.lookup_field: self.kwargs[lookup_url_kwarg]}
        
        try:
            obj = queryset.get(**filter_kwargs)
        except Predictor.DoesNotExist:
            from django.http import Http404
            raise Http404("No Predictor matches the given query.")
        
        self.check_object_permissions(self.request, obj)
        return obj

    def get_permissions(self):
        """
        Assign permissions based on the action being performed:
        - update/partial_update/destroy: must be the owner
        - retrieve: owner or shared
        - list/create: any authenticated user
        """
        if self.action in ["update", "partial_update", "destroy"]:
            return [IsPredictorOwner()]
        elif self.action == "retrieve":
            return [CanAccessPredictor()]
        return super().get_permissions()


    def perform_create(self, serializer):
        """Assign the logged-in user as the owner and handle folders + permissions."""
        predictor = serializer.save(owner=self.request.user)

        # -------------------------
        # Handle folder (multi-model)
        # -------------------------
        folder = serializer.validated_data.get('folder')  # This is a Folder instance or None
        if folder:
            from folders.models import FolderItem
            from django.contrib.contenttypes.models import ContentType

            FolderItem.objects.create(
                content_type=ContentType.objects.get_for_model(Predictor),
                object_id=predictor.predictor_id,
                folder=folder,
                added_by=self.request.user
            )
            print(f"Predictor {predictor.predictor_id} added to folder {folder.folder_id}")

        # -------------------------
        # Automatically create 'owner' permission
        # -------------------------
        perm = PredictorPermission.objects.create(
            predictor=predictor,
            user=self.request.user,
            role='owner'
        )
        print("Owner permission added:", perm)

        # -------------------------
        # Add extra permissions from request
        # -------------------------
        try:
            permissions_data = self.request.data.get("permissions", [])
            for perm_data in permissions_data:
                username = perm_data.get("username")
                role = perm_data.get("role")
                if not username or role not in ["owner", "viewer"]:
                    print("Skipping invalid permission:", perm_data)
                    continue
                try:
                    user = User.objects.get(username=username)
                except User.DoesNotExist:
                    print("User not found:", username)
                    continue
                try:
                    p, created = PredictorPermission.objects.update_or_create(
                        predictor=predictor,
                        user=user,
                        defaults={"role": role}
                    )
                    print(f"Added/updated permission for {username}: {p}, created={created}")
                except Exception as e:
                    print("Failed to add permission:", perm_data, e)
        except Exception as e:
            print("perform_create failed:", e)


    def retrieve(self, request, *args, **kwargs):
        """
        Custom retrieve method to add dataset features to the response.
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data

        try:
            if instance.dataset and instance.dataset.file_path:
                full_file_path = os.path.join(settings.MEDIA_ROOT, instance.dataset.file_path)
                
                # Check if the file actually exists before trying to open it
                if os.path.exists(full_file_path):
                    # Open the file using its full path
                    with open(full_file_path, 'rb') as f:
                        df = pd.read_csv(f, nrows=0)
                    data['features'] = df.columns.tolist()
                else:
                    print(f"File not found at path: {full_file_path}")
                    data['features'] = []
            else:
                data['features'] = []
        except Exception as e:
            print(f"Could not read features for predictor {instance.predictor_id}: {e}")
            data['features'] = []
        
        return Response(data)

    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        """
        Pin a predictor for quick access.
        Only allowed if the user can access the predictor.
        """
        predictor = self.get_object()
        if not CanAccessPredictor().has_object_permission(request, self, predictor):
            raise PermissionDenied("You do not have permission to pin this predictor.")
        PinnedPredictor.objects.get_or_create(user=request.user, predictor=predictor)
        return Response({"status": "pinned"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def unpin(self, request, pk=None):
        """
        Unpin a predictor.
        Only allowed if the user can access the predictor.
        """
        predictor = self.get_object()
        if not CanAccessPredictor().has_object_permission(request, self, predictor):
            raise PermissionDenied("You do not have permission to unpin this predictor.")
        PinnedPredictor.objects.filter(user=request.user, predictor=predictor).delete()
        return Response({"status": "unpinned"}, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'], url_path='train')
    def train(self, request, pk=None):
        """
        Triggers the training job on the separate ML API.
        This acts as a proxy, sending the dataset and parameters
        to the ML service.
        """
        try:
            predictor = self.get_object()
            dataset = predictor.dataset
            
            if not dataset or not dataset.file_path:
                return Response(
                    {"error": "Predictor has no associated dataset file."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # mark training
            predictor.ml_training_status = 'training'
            predictor.save(update_fields=['ml_training_status'])

            full_file_path = os.path.join(settings.MEDIA_ROOT, dataset.file_path)
            if not os.path.exists(full_file_path):
                predictor.ml_training_status = 'failed'
                predictor.save(update_fields=['ml_training_status'])
                return Response(
                    {"error": f"Dataset file not found at path: {full_file_path}"},
                    status=status.HTTP_404_NOT_FOUND
                )

            # --- Prepare data for the ML API ---
            with open(full_file_path, 'rb') as f:
                df = pd.read_csv(f, nrows=0) # Read only header
            
            all_cols = df.columns.tolist()
            if len(all_cols) < 3:
                raise Exception("Dataset must have at least 3 columns (time, event, features).")

            time_col = all_cols[0]
            event_col = all_cols[1]
            
            # Get features and parameters from the request payload
            # This matches your `PredictorDetailPage` frontend
            payload = request.data
            features = payload.get('features', all_cols[2:]) # Default to all features if not provided
            parameters = payload.get('settings', {})

            # Get ML API URL from environment variables
            ml_api_url = os.environ.get("ML_API_URL", "http://localhost:5000")
            train_url = f"{ml_api_url}/train" # This matches your test_api.py

            # Prepare the payload for the ML API
            params_for_ml = {
                'features': json.dumps(features),
                'time_col': time_col,
                'event_col': event_col,
                'parameters': json.dumps(parameters) # Send the new parameters
            }

            with open(full_file_path, 'rb') as f_bin:
                files = {'dataset': (dataset.original_filename, f_bin, 'text/csv')}
                
                # Make the server-to-server request
                ml_response = requests.post(train_url, data=params_for_ml, files=files, timeout=600)

            if ml_response.ok:
                ml_data = ml_response.json()

                predictor.model_id = ml_data.get('model_id')
                predictor.ml_trained_at = timezone.now()
                predictor.ml_training_status = 'trained'
                predictor.ml_model_metrics = ml_data.get('metrics')
                predictor.ml_selected_features = features
                predictor.save(update_fields=[
                    'model_id',
                    'ml_trained_at',
                    'ml_training_status',
                    'ml_model_metrics',
                    'ml_selected_features',
                ])

                return Response(ml_data, status=status.HTTP_200_OK)
            else:
                # The ML API returned an error
                predictor.ml_training_status = 'failed'
                predictor.save(update_fields=['ml_training_status'])
                return Response(
                    {"error": "ML API training failed", "details": ml_response.text},
                    status=ml_response.status_code
                )
        
        except Exception as e:
            predictor.ml_training_status = 'failed'
            predictor.save(update_fields=['ml_training_status'])
            return Response(
                {"error": "Failed to call training API", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='survival-curves')
    def survival_curves(self, request, pk=None):
        """
        Returns the survival curves JSON file for a trained predictor.
        The file is located at media/models/<model_id>/survival_curves.json
        """
        try:
            predictor = self.get_object()
            
            if not predictor.model_id:
                return Response(
                    {"error": "This predictor has not been trained yet."},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Construct the path to the survival curves file
            survival_curves_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                predictor.model_id,
                'survival_curves.json'
            )
            
            if not os.path.exists(survival_curves_path):
                return Response(
                    {"error": f"Survival curves file not found for model {predictor.model_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Read and return the JSON file
            with open(survival_curves_path, 'r') as f:
                survival_curves_data = json.load(f)
            
            return Response(survival_curves_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"error": "Failed to load survival curves", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='predictions-summary')
    def predictions_summary(self, request, pk=None):
        """
        Returns the full predictions summary CSV data as JSON.
        The file is located at media/models/<model_id>/full_predictions_summary.csv
        """
        try:
            predictor = self.get_object()
            
            if not predictor.model_id:
                return Response(
                    {"error": "This predictor has not been trained yet."},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Construct the path to the predictions summary file
            predictions_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                predictor.model_id,
                'full_predictions_summary.csv'
            )
            
            if not os.path.exists(predictions_path):
                return Response(
                    {"error": f"Predictions summary file not found for model {predictor.model_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Read CSV and convert to JSON
            import math
            df = pd.read_csv(predictions_path)
            
            # Convert DataFrame to list of dictionaries
            predictions_data = df.to_dict('records')
            
            # Clean up each record to ensure JSON compliance
            cleaned_predictions = []
            for record in predictions_data:
                cleaned_record = {}
                for key, value in record.items():
                    # Check if value is a float and handle special cases
                    if isinstance(value, float):
                        if math.isnan(value) or math.isinf(value):
                            cleaned_record[key] = None
                        else:
                            cleaned_record[key] = value
                    else:
                        cleaned_record[key] = value
                cleaned_predictions.append(cleaned_record)
            
            return Response({
                "predictions": cleaned_predictions,
                "total": len(cleaned_predictions)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"error": "Failed to load predictions summary", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'], url_path='full-predictions')
    def full_predictions(self, request, pk=None):
        """
        Returns the full predictions JSON file for D-calibration histogram.
        The file is located at media/models/<model_id>/full_predictions.json
        """
        try:
            predictor = self.get_object()
            
            if not predictor.model_id:
                return Response(
                    {"error": "This predictor has not been trained yet."},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Construct the path to the full predictions file
            full_predictions_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                predictor.model_id,
                'full_predictions.json'
            )
            
            if not os.path.exists(full_predictions_path):
                return Response(
                    {"error": f"Full predictions file not found for model {predictor.model_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Read and return the JSON file
            with open(full_predictions_path, 'r') as f:
                full_predictions_data = json.load(f)
            
            return Response(full_predictions_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"error": "Failed to load full predictions", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    @action(detail=True, methods=['get'], url_path='metadata')
    def metadata(self, request, pk=None):
        """Return metadata for the predictor."""
        try:
            predictor = self.get_object()

            if not predictor.model_id:
                return Response(
                    {"error": "This predictor has not been trained yet."},
                    status=status.HTTP_404_NOT_FOUND
                )
            # Construct the path to the model config json file
            model_config_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                predictor.model_id,
                'model_config.json'
            )
            
            if not os.path.exists(model_config_path):
                return Response(
                    {"error": f"Model config file not found for model {predictor.model_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Read and return the JSON file
            with open(model_config_path, 'r') as f:
                model_config_data = json.load(f)
            
            return Response(model_config_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": "Failed to load metadata", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    @action(detail=True, methods=['get'], url_path='mtlr_file')
    def retrieve_mtlr_file(self, request, pk=None):
        """Return metadata for the predictor."""
        try:
            predictor = self.get_object()

            if not predictor.model_id:
                return Response(
                    {"error": "This predictor has not been trained yet."},
                    status=status.HTTP_404_NOT_FOUND
                )
            # Construct the path to the model config json file
            mtlr_model_path = os.path.join(
                settings.MEDIA_ROOT,
                'models',
                predictor.model_id,
                f'mtlr_model_{predictor.model_id}.mtlr'
            )
            
            if not os.path.exists(mtlr_model_path):
                return Response(
                    {"error": f"MTLR model file not found for model {predictor.model_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Read and return the text file
            with open(mtlr_model_path, 'r') as f:
                mtlr_model_data = f.read()
            
            return Response(mtlr_model_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": "Failed to load model data", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# ----------------------------
# PredictorPermission ViewSet
# ----------------------------
class PredictorPermissionViewSet(viewsets.ModelViewSet):
    """API viewset for PredictorPermission model with proper access control."""

    serializer_class = PredictorPermissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Only show permissions for predictors the current user owns.
        This ensures a user cannot see or modify permissions for predictors they don't own.
        """
        return PredictorPermission.objects.filter(predictor__owner=self.request.user)

    def perform_create(self, serializer):
        """
        Assign the logged-in user as the owner and optionally
        add extra permissions from the request data.
        Expects request.data to include 'permissions' key:
        [
            {"username": "alice", "role": "owner"},
            {"username": "bob", "role": "viewer"}
        ]
        """
        # Save predictor with the creator as owner
        serializer.save()

    def perform_destroy(self, instance):
        """
        Ensure only the predictor owner can revoke access.
        Raises PermissionDenied if the request user is not the owner.
        """
        if instance.predictor.owner != self.request.user:
            raise PermissionDenied("Only the predictor owner can revoke access.")
        instance.delete()

# ----------------------------
# PinnedPredictor ViewSet
# ----------------------------
class PinnedPredictorViewSet(viewsets.ModelViewSet):
    """
    API viewset for managing pinned predictors.
    - GET: list pinned predictors
    - POST: pin a predictor
    - DELETE: unpin a predictor
    """
    serializer_class = PinnedPredictorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Return predictors pinned by the current user.
        """
        return PinnedPredictor.objects.filter(user=self.request.user).order_by("-pinned_at")

    def perform_create(self, serializer):
        """Automatically assign the current user when pinning"""
        serializer.save(user=self.request.user)

        
# ----------------------------
# Public Predictor Views
# ----------------------------
@api_view(['GET'])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
def list_public_predictors(request):
    """
    List all public predictors without authentication.
    Returns only predictors where is_private=False.
    """
    try:
        # Get all public predictors (where is_private=False)
        public_predictors = Predictor.objects.filter(is_private=False).order_by('name')
        
        # Serialize the data
        serializer = PredictorSerializer(public_predictors, many=True)
        
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {
                'error': 'Failed to fetch public predictors',
                'message': str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def resolve_username(request):
    username = request.query_params.get("username")
    if not username:
        return Response({"detail": "username required"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(username=username).first()
    if not user:
        return Response({"detail": "User not found"}, status=404)
    return Response({"id": user.id})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def predictor_cv_predictions(request, predictor_id):
    """
    Fetch CV predictions for a trained predictor from local storage.
    Uses cv_predictions.json which contains cross-validation predictions.
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)
    except Predictor.DoesNotExist:
        return Response({"error": "Predictor not found"}, status=status.HTTP_404_NOT_FOUND)

    if not CanAccessPredictor().has_object_permission(request, None, predictor):
        raise PermissionDenied("You do not have permission to access this predictor.")

    if not predictor.model_id:
        return Response(
            {"error": "Predictor has not been trained yet"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Build path to local CV predictions file
    cv_predictions_path = os.path.join(
        settings.MEDIA_ROOT, 
        'models', 
        predictor.model_id, 
        'cv_predictions.json'
    )
    
    # Check if file exists
    if not os.path.exists(cv_predictions_path):
        return Response(
            {
                "error": "CV predictions not available for this predictor.",
                "details": "The CV predictions file was not found in local storage."
            },
            status=status.HTTP_404_NOT_FOUND,
        )
    
    # Read and return the CV predictions
    try:
        with open(cv_predictions_path, 'r') as f:
            cv_data = json.load(f)
        return Response(cv_data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {
                "error": "Failed to read CV predictions",
                "details": str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def predictor_full_predictions(request, predictor_id):
    """
    Fetch full dataset predictions for a trained predictor from local storage.
    Uses full_predictions.json which contains predictions for all samples in the dataset.
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)
    except Predictor.DoesNotExist:
        return Response({"error": "Predictor not found"}, status=status.HTTP_404_NOT_FOUND)

    if not CanAccessPredictor().has_object_permission(request, None, predictor):
        raise PermissionDenied("You do not have permission to access this predictor.")

    if not predictor.model_id:
        return Response(
            {"error": "Predictor has not been trained yet"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Build path to local full predictions file
    full_predictions_path = os.path.join(
        settings.MEDIA_ROOT, 
        'models', 
        predictor.model_id, 
        'full_predictions.json'
    )
    
    # Check if file exists
    if not os.path.exists(full_predictions_path):
        return Response(
            {
                "error": "Full predictions not available for this predictor.",
                "details": "The full predictions file was not found in local storage."
            },
            status=status.HTTP_404_NOT_FOUND,
        )
    
    # Read and return the full predictions
    try:
        with open(full_predictions_path, 'r') as f:
            predictions_data = json.load(f)
        return Response(predictions_data, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {
                "error": "Failed to read full predictions",
                "details": str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def ml_predict(request, predictor_id):
    """
    Predict outcomes for an unlabeled dataset using a trained predictor.
    Validates that the dataset has the exact same features as the predictor.
    Sends full batch of feature rows to the ML API /predict endpoint.
    """
    try:
        # ------------------------------------
        # 1. Fetch predictor & dataset objects
        # ------------------------------------
        predictor = Predictor.objects.get(predictor_id=predictor_id)
        
        payload = request.data
        dataset_id = payload.get("dataset_id")

        if dataset_id is None:
            return Response({"error": "dataset_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        dataset = Dataset.objects.get(dataset_id=dataset_id)

        # Check permissions for dataset and predictor
        if not CanAccessDataset().has_object_permission(request, None, dataset):
            return Response({"error": "Permission denied for dataset"}, status=status.HTTP_403_FORBIDDEN)
        
        if not CanAccessPredictor().has_object_permission(request, None, predictor):
            return Response({"error": "Permission denied for predictor"}, status=status.HTTP_403_FORBIDDEN)


        # ----------------------------------------
        # 2. Determine expected predictor features
        # ----------------------------------------

        predictor_features = predictor.ml_selected_features
        
        # ---------------------------------------------------
        # 3. Load target dataset header and validate features
        # ---------------------------------------------------
        
        if not dataset.file_path:
             return Response({"error": "Target dataset has no file."}, status=status.HTTP_400_BAD_REQUEST)
             
        target_file_path = os.path.join(settings.MEDIA_ROOT, dataset.file_path)
        if not os.path.exists(target_file_path):
             return Response({"error": "Target dataset file missing."}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            with open(target_file_path, 'rb') as f:
                target_header_df = pd.read_csv(f, nrows=0)
            all_target_columns = target_header_df.columns.tolist()
            
            # Filter out time and censored columns if they exist (for labeled datasets)
            # Use regex to match any column containing 'time' or 'censored' (case-insensitive)
            target_features = [col for col in all_target_columns if not re.search(r'time|censored', col, re.IGNORECASE)]
        except Exception as e:
            return Response({"error": f"Failed to read target dataset header: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Compare features (excluding time and censored columns)
        if set(predictor_features) != set(target_features):
             missing = list(set(predictor_features) - set(target_features))
             extra = list(set(target_features) - set(predictor_features))
             return Response({
                 "error": "Feature mismatch", 
                 "details": f"Missing: {missing}, Extra: {extra}"
             }, status=status.HTTP_400_BAD_REQUEST)

        # -----------------------------------
        # 4. Load full dataset for prediction
        # -----------------------------------
        with open(target_file_path, 'rb') as f:
            full_df = pd.read_csv(f)

        # Drop time/censored columns if they exist (for labeled datasets)
        # Use regex to match any column containing 'time' or 'censored' (case-insensitive)
        columns_to_drop = [col for col in full_df.columns if re.search(r'time|censored', col, re.IGNORECASE)]
        if columns_to_drop:
            full_df = full_df.drop(columns=columns_to_drop)

        # Convert dataset rows → list of dict records
        records = full_df.to_dict(orient="records")
        

        # -----------------------------------
        # 5. Build final payload for ML API
        # -----------------------------------
        ml_payload = {
            'model_id': predictor.model_id,
            'features': records, # For batch prediction
        }


        # Optional: labeled parameter for labeled datasets
        if "labeled" in request.data:
            ml_payload["labeled"] = request.data["labeled"]

        # Optional: custom time points
        if "time_points" in request.data:
            ml_payload["time_points"] = request.data["time_points"]

        # -----------------------------------
        # 6. Call ML API
        # -----------------------------------
        ml_api_url = os.environ.get("ML_API_URL", "http://localhost:5000")
        predict_url = f"{ml_api_url}/predict"

        ml_response = requests.post(predict_url, json=ml_payload, timeout=600)

        if ml_response.ok:
            return Response(ml_response.json(), status=status.HTTP_200_OK)
        else:
            return Response(
                {"error": "ML API prediction failed", 
                "details": ml_response.text},
                status=ml_response.status_code
            )

    except Dataset.DoesNotExist:
        return Response({"error": "Dataset not found"}, status=status.HTTP_404_NOT_FOUND)
    except Predictor.DoesNotExist:
        return Response({"error": "Predictor not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ========================================
# NEW: ML API Integration Views
# ========================================

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def ml_health_check(request):
    """
    Check if ML API is available
    GET /api/predictors/ml/health/
    """
    client = MLAPIClient()
    result = client.health_check()
    
    if result['status'] == 'healthy':
        return Response(result, status=status.HTTP_200_OK)
    else:
        return Response(result, status=status.HTTP_503_SERVICE_UNAVAILABLE)




@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def ml_retrain_model(request):
    """
    Retrain an existing model with different features/parameters
    POST /api/predictors/ml/retrain/
    
    Request:
        - model_id: str (required)
        - selected_features: JSON array (optional)
        - parameters: JSON object (optional)
        - return_cv_predictions: boolean (optional)
    
    Response:
        - model_id: str (new model ID)
        - retrained_from: str (original model ID)
        - metrics: dict
        - retrain_summary: dict
    """
    model_id = request.data.get('model_id')
    if not model_id:
        return Response(
            {'error': 'model_id is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    selected_features = request.data.get('selected_features', None)
    parameters = request.data.get('parameters', None)
    
    client = MLAPIClient()
    result = client.retrain_model(
        model_id=model_id,
        selected_features=selected_features,
        parameters=parameters,
        return_cv_predictions=True
    )
    
    if result['success']:
        return Response(result['data'], status=status.HTTP_200_OK)
    else:
        return Response(
            {'error': result['error']},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def ml_retrain_model_async(request):
    """
    Triggers ASYNCHRONOUS retraining job on the ML API with progress tracking.
    Returns immediately with task_id, then retraining continues in background.

    Request body:
    {
        "predictor_id": 123,  // REQUIRED - the predictor to retrain
        "model_id": "model_xyz",  // REQUIRED - existing model to retrain from
        "selected_features": [...],  // Optional feature list
        "parameters": {       // Optional training parameters
            "n_epochs": 100,
            "dropout": 0.2,
            "neurons": [64, 64],
            "n_exp": 10
        }
    }

    Response:
    {
        "message": "Retraining started",
        "predictor_id": 123,
        "task_id": "abc-123-def-456"
    }

    Use GET /api/predictors/{predictor_id}/training-status/ to poll for progress.
    """
    try:
        from .models import Predictor
        from .training_tasks import train_model_task

        predictor_id = request.data.get('predictor_id')
        model_id = request.data.get('model_id')

        if not predictor_id:
            return Response(
                {"error": "predictor_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not model_id:
            return Response(
                {"error": "model_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify predictor exists and user has access
        try:
            predictor = Predictor.objects.get(predictor_id=predictor_id)
            if predictor.owner != request.user and not request.user.is_superuser:
                return Response(
                    {"error": "Access denied"},
                    status=status.HTTP_403_FORBIDDEN
                )
        except Predictor.DoesNotExist:
            return Response(
                {"error": f"Predictor {predictor_id} not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get dataset path from predictor
        dataset = predictor.dataset
        if not dataset or not dataset.file_path:
            return Response(
                {"error": "Dataset has no associated file."},
                status=status.HTTP_400_BAD_REQUEST
            )

        full_file_path = os.path.join(settings.MEDIA_ROOT, dataset.file_path)
        if not os.path.exists(full_file_path):
            return Response(
                {"error": f"Dataset file not found at path: {full_file_path}"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get parameters
        parameters = request.data.get('parameters', {})
        selected_features = request.data.get('selected_features', None)

        # Add selected features to parameters if provided
        if selected_features:
            parameters['selected_features'] = selected_features

        # Mark predictor as training
        predictor.ml_training_status = 'training'
        predictor.save()

        # Dispatch Celery task
        task = train_model_task.delay(predictor_id, full_file_path, parameters)

        # Store task ID in predictor for tracking
        predictor.ml_training_progress = {"task_id": task.id, "status": "queued"}
        predictor.save()

        return Response({
            "message": "Retraining started",
            "predictor_id": predictor_id,
            "task_id": task.id,
            "status": "training"
        }, status=status.HTTP_202_ACCEPTED)

    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to start async retraining: {str(e)}")
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )





@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def ml_list_models(request):
    """
    List all trained models from ML API
    GET /api/predictors/ml/models/
    
    Response:
        - count: int
        - models: list of model info
    """
    client = MLAPIClient()
    result = client.list_models()
    
    if result['success']:
        return Response(result['data'], status=status.HTTP_200_OK)
    else:
        return Response(
            {'error': result['error']},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def train_predictor_model(request, predictor_id):
    """
    Train an ML model for a specific predictor using its dataset
    POST /api/predictors/{predictor_id}/train/
    
    Request body (optional):
        - selected_features: Array of feature names to use
        - parameters: Model training parameters (dropout, neurons, etc.)
    
    Response:
        - Updated predictor with model_id and metrics
    """
    try:
        # Get the predictor
        predictor = Predictor.objects.get(predictor_id=predictor_id)
        
        # Check permissions
        if not CanAccessPredictor().has_object_permission(request, None, predictor):
            raise PermissionDenied("You don't have permission to train this predictor")
        
        # Check if predictor has a dataset
        if not predictor.dataset or not predictor.dataset.file_path:
            return Response(
                {'error': 'Predictor must have a dataset to train'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update status to training
        predictor.ml_training_status = 'training'
        predictor.save()
        
        # Get dataset file
        dataset_path = os.path.join(settings.MEDIA_ROOT, predictor.dataset.file_path)
        
        if not os.path.exists(dataset_path):
            predictor.ml_training_status = 'failed'
            predictor.save()
            return Response(
                {'error': 'Dataset file not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get training parameters from request
        selected_features = request.data.get('selected_features', None)
        parameters = request.data.get('parameters', None)
        
        # Open and upload dataset to ML API
        with open(dataset_path, 'rb') as f:
            from django.core.files.uploadedfile import InMemoryUploadedFile
            import io
            
            # Read file content
            file_content = f.read()
            dataset_file = InMemoryUploadedFile(
                file=io.BytesIO(file_content),
                field_name='dataset',
                name=os.path.basename(dataset_path),
                content_type='text/csv',
                size=len(file_content),
                charset=None
            )
            
            # Train model using ML API
            client = MLAPIClient()
            result = client.train_model(
                dataset_file=dataset_file,
                selected_features=selected_features,
                parameters=parameters,
                return_cv_predictions=True
            )
        
        if result['success']:
            data = result['data']
            
            # Update predictor with ML model info
            predictor.model_id = data.get('model_id')
            predictor.ml_trained_at = timezone.now()
            predictor.ml_training_status = 'trained'
            predictor.ml_model_metrics = data.get('metrics', {})
            predictor.ml_selected_features = selected_features
            predictor.save()
            
            # Return updated predictor
            serializer = PredictorSerializer(predictor)
            return Response({
                'status': 'success',
                'message': 'Model trained successfully',
                'predictor': serializer.data,
                'training_result': data
            }, status=status.HTTP_200_OK)
        else:
            # Training failed
            predictor.ml_training_status = 'failed'
            predictor.save()
            
            return Response(
                {'error': result['error']},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    except Predictor.DoesNotExist:
        return Response(
            {'error': 'Predictor not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        # Update status to failed
        try:
            predictor.ml_training_status = 'failed'
            predictor.save()
        except:
            pass
        
        return Response(
            {'error': f'Training failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def predict_with_predictor(request, predictor_id):
    """
    Make a prediction using a trained predictor
    POST /api/predictors/{predictor_id}/predict/
    
    Request body:
        - features: Dict of feature_name -> value
    
    Response:
        - predictions: Survival predictions from ML model
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)
        
        # Check permissions
        if not CanAccessPredictor().has_object_permission(request, None, predictor):
            raise PermissionDenied("You don't have permission to use this predictor")
        
        # Check if model is trained
        if not predictor.model_id:
            return Response(
                {'error': 'This predictor has not been trained yet'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if predictor.ml_training_status != 'trained':
            return Response(
                {'error': f'Model is not ready (status: {predictor.ml_training_status})'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get features from request
        features = request.data.get('features')
        if not features or not isinstance(features, dict):
            return Response(
                {'error': 'features must be a dictionary of feature_name -> value'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Make prediction using ML API
        client = MLAPIClient()
        result = client.predict(
            model_id=predictor.model_id,
            features=features
        )
        
        if result['success']:
            return Response(result['data'], status=status.HTTP_200_OK)
        else:
            return Response(
                {'error': result['error']},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    except Predictor.DoesNotExist:
        return Response(
            {'error': 'Predictor not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': f'Prediction failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_training_status(request, predictor_id):
    """
    Get the current training status and progress for a predictor.
    GET /api/predictors/{predictor_id}/training-status/

    Returns:
        {
            'status': 'training' | 'trained' | 'failed' | 'not_trained',
            'progress': {
                'current_epoch': 45,
                'total_epochs': 100,
                'current_experiment': 3,
                'total_experiments': 10,
                'status': 'training',
                'message': 'Training model...',
                'estimated_progress': 45
            },
            'error': 'error message if failed',
            'model_id': 'mtlr_20231103_abc123',
            'metrics': {...}
        }
    """
    try:
        predictor = Predictor.objects.get(predictor_id=predictor_id)

        # Check if user has access to this predictor
        if predictor.is_private:
            if predictor.owner != request.user and not PredictorPermission.objects.filter(
                predictor=predictor, user=request.user
            ).exists():
                return Response(
                    {'error': 'Access denied'},
                    status=status.HTTP_403_FORBIDDEN
                )

        return Response({
            'status': predictor.ml_training_status,
            'progress': predictor.ml_training_progress,
            'error': predictor.ml_training_error,
            'model_id': predictor.model_id,
            'metrics': predictor.ml_model_metrics,
            'trained_at': predictor.ml_trained_at,
        }, status=status.HTTP_200_OK)

    except Predictor.DoesNotExist:
        return Response(
            {'error': 'Predictor not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to get training status: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def get_comparable_predictors(request, predictor_id):
    """
    Get all predictors that can be compared with the given predictor.
    Returns predictors that:
    - Are on the same dataset
    - The user has access to (owned, shared, or public)
    - Have CV statistics available (trained models)
    """
    try:
        # Get the base predictor
        base_predictor = Predictor.objects.get(pk=predictor_id)

        # Check if user has access to the base predictor
        if not (base_predictor.owner == request.user or
                request.user.is_superuser or
                not base_predictor.is_private or
                PredictorPermission.objects.filter(predictor=base_predictor, user=request.user).exists()):
            return Response(
                {'error': 'You do not have permission to access this predictor'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get all predictors on the same dataset that the user has access to
        user = request.user
        dataset_id = base_predictor.dataset_id

        if user.is_superuser:
            comparable_predictors = Predictor.objects.filter(
                dataset_id=dataset_id
            ).exclude(predictor_id=predictor_id)
        else:
            comparable_predictors = Predictor.objects.filter(
                Q(dataset_id=dataset_id) &
                (Q(owner=user) | Q(permissions__user=user) | Q(is_private=False))
            ).exclude(predictor_id=predictor_id).distinct()

        # Build response with basic info and CV stats availability
        results = []
        for pred in comparable_predictors:
            pred_data = {
                'predictor_id': pred.predictor_id,
                'name': pred.name,
                'owner': pred.owner.username,
                'is_private': pred.is_private,
                'model_id': pred.model_id,
                'has_cv_stats': False,
                'created_at': pred.created_at,
                'updated_at': pred.updated_at,
            }

            # Check if CV statistics are available (prioritize ml_model_metrics)
            if pred.ml_model_metrics:
                pred_data['has_cv_stats'] = True
            elif pred.model_id:
                # Fallback: check if CV predictions file exists
                cv_file = os.path.join(settings.MEDIA_ROOT, 'models', pred.model_id, 'cv_predictions.json')
                if os.path.exists(cv_file):
                    pred_data['has_cv_stats'] = True

            results.append(pred_data)

        return Response({
            'base_predictor': {
                'predictor_id': base_predictor.predictor_id,
                'name': base_predictor.name,
                'dataset_id': base_predictor.dataset_id,
                'dataset_name': base_predictor.dataset.dataset_name,
            },
            'comparable_predictors': results
        })

    except Predictor.DoesNotExist:
        return Response(
            {'error': 'Predictor not found'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to fetch comparable predictors: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def compare_predictors_cv_stats(request):
    """
    Compare CV statistics for multiple predictors.
    Request body: { "predictor_ids": [1, 2, 3] }
    Returns CV statistics for each predictor.
    """
    try:
        predictor_ids = request.data.get('predictor_ids', [])

        if not predictor_ids or len(predictor_ids) < 2:
            return Response(
                {'error': 'At least 2 predictor IDs are required for comparison'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        results = []

        for pred_id in predictor_ids:
            try:
                predictor = Predictor.objects.get(pk=pred_id)

                # Check access permission
                if not (predictor.owner == user or
                        user.is_superuser or
                        not predictor.is_private or
                        PredictorPermission.objects.filter(predictor=predictor, user=user).exists()):
                    results.append({
                        'predictor_id': pred_id,
                        'name': 'Access Denied',
                        'error': 'You do not have permission to access this predictor'
                    })
                    continue

                pred_result = {
                    'predictor_id': predictor.predictor_id,
                    'name': predictor.name,
                    'owner': predictor.owner.username,
                    'model_id': predictor.model_id,
                    'cv_stats': None,
                    'ml_model_metrics': None,
                    'created_at': predictor.created_at.isoformat() if predictor.created_at else None,
                    'updated_at': predictor.updated_at.isoformat() if predictor.updated_at else None,
                    'error': None
                }

                # Use ml_model_metrics from the predictor model (new approach)
                if predictor.ml_model_metrics:
                    pred_result['ml_model_metrics'] = predictor.ml_model_metrics
                elif predictor.model_id:
                    # Fallback: try to load CV statistics from file
                    cv_file = os.path.join(settings.MEDIA_ROOT, 'models', predictor.model_id, 'cv_predictions.json')
                    if os.path.exists(cv_file):
                        with open(cv_file, 'r') as f:
                            cv_data = json.load(f)
                            pred_result['cv_stats'] = cv_data
                    else:
                        pred_result['error'] = 'No CV statistics available'
                else:
                    pred_result['error'] = 'Predictor has not been trained'

                results.append(pred_result)

            except Predictor.DoesNotExist:
                results.append({
                    'predictor_id': pred_id,
                    'name': 'Not Found',
                    'error': f'Predictor {pred_id} does not exist'
                })

        return Response({'comparisons': results})

    except Exception as e:
        return Response(
            {'error': f'Comparison failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
