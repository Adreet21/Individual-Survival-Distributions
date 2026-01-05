from django.contrib.auth.models import User
from .serializers import UserSerializer
from rest_framework import viewsets, permissions, status
from django.contrib.auth.password_validation import validate_password
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Q
from drf_spectacular.utils import extend_schema

class UserViewSet(viewsets.ModelViewSet):
    """
    Handles user profile CRUD operations with self-access permissions.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only return the authenticated user
        return User.objects.filter(id=self.request.user.id)
    
    @action(detail=False, methods=["get", "patch"], url_path='me')
    def me(self, request):
        """
        Adds path /api/accounts/users/me/ for the authenticated user to view or update their profile.
        GET: return the authenticated user's profile
        PUT/PATCH: update the authenticated user's profile
        """
        if request.method == "GET":
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)
        
        elif request.method == "PATCH":
            serializer = self.get_serializer(request.user, data=request.data, partial=(request.method == "PATCH"))
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)
    
    @action(detail=False, methods=["post"], url_path='change-password')
    def change_password(self, request):
        """
        Adds path /api/accounts/users/change-password/ for changing the user's password.
        Example request data:
        {
            "old_password": "oldpass123",
            "new_password": "NewStrongPass123!",
            "confirm_password": "NewStrongPass123!"
        }
        """
        user = request.user
        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")
        confirm_password = request.data.get("confirm_password")

        # Validate old password
        if not user.check_password(old_password):
            return Response({"old_password": "Incorrect password."}, status=status.HTTP_400_BAD_REQUEST)

        # Check new passwords match
        if new_password != confirm_password:
            return Response({"confirm_password": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        # Validate password strength
        try:
            validate_password(new_password, user)
        except Exception as e:
            return Response({"new_password": list(e)}, status=status.HTTP_400_BAD_REQUEST)

        # Update password
        user.set_password(new_password)
        user.save()

        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


@extend_schema(
    summary="Search users",
    description="Search for users by username or email. Returns basic user information for sharing purposes.",
    parameters=[
        {
            'name': 'q',
            'in': 'query',
            'description': 'Search query (username or email)',
            'required': True,
            'schema': {'type': 'string', 'minLength': 2}
        },
        {
            'name': 'limit',
            'in': 'query', 
            'description': 'Maximum number of results to return',
            'required': False,
            'schema': {'type': 'integer', 'default': 10, 'maximum': 50}
        }
    ],
    responses={200: UserSerializer(many=True)},
    tags=["Users"]
)
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def search_users(request):
    """
    Search for users by username or email.
    Used for sharing functionality - allows finding users to grant permissions to.
    """
    query = request.GET.get('q', '').strip()
    limit = min(int(request.GET.get('limit', 10)), 50)  # Cap at 50 results
    
    if len(query) < 2:
        return Response(
            {"error": "Search query must be at least 2 characters long"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Search by username or email, exclude current user
    users = User.objects.filter(
        Q(username__icontains=query) | Q(email__icontains=query)
    ).exclude(
        id=request.user.id
    ).filter(
        is_active=True
    )[:limit]
    
    serializer = UserSerializer(users, many=True)
    return Response(serializer.data)