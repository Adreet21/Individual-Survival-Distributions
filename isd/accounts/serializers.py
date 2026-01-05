from django.contrib.auth.models import User
from rest_framework import serializers

class UserSerializer(serializers.ModelSerializer):
    """Serializer for Django User model"""
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "password", "date_joined", "is_active"]
        extra_kwargs = {
            'password': {'write_only': True},
            'id': {'read_only': True},
            'date_joined': {'read_only': True},
            'is_active': {'read_only': True},
        }
    
    def create(self, validated_data):
        # Create user with hashed password
        user = User.objects.create_user(**validated_data)
        return user
    
    def update(self, instance, validated_data):    
        # Handle password update separately
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance