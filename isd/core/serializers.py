# core/serializers.py
from rest_framework import serializers

class BaseSerializer(serializers.ModelSerializer):
    """A reusable base serializer with shared config."""
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        abstract = True
