from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers
from drf_spectacular.utils import extend_schema, OpenApiResponse

class HealthCheckSerializer(serializers.Serializer):
    """Serializer for health check response."""
    status = serializers.CharField()

class APIRootSerializer(serializers.Serializer):
    """Serializer for API root response."""
    auth = serializers.URLField()
    predictor = serializers.URLField()
    dataset = serializers.URLField()
    health = serializers.URLField()

class HealthCheckView(APIView):
    """Simple endpoint to verify API is alive."""
    
    @extend_schema(
        responses={200: OpenApiResponse(response=HealthCheckSerializer, description="Health check status")}
    )
    def get(self, request):
        return Response({"status": "ok"})

class APIRootView(APIView):
    """API entrypoint overview."""
    
    @extend_schema(
        responses={200: OpenApiResponse(response=APIRootSerializer, description="API endpoints overview")}
    )
    def get(self, request):
        return Response({
            "auth": "/api/auth/",
            "predictor": "/api/predictor/",
            "dataset": "/api/dataset/",
            "health": "/api/health/",
        })
