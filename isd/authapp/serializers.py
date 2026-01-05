from django.contrib.auth.models import User, Group
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone

class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for registering new user.
    Handles validation for email uniqueness, password confirmation, and password strength.
    """
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True) 
    password = serializers.CharField(write_only=True, required=True)
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'first_name', 'last_name', 'password', 'password2')

    def validate_email(self, value):
        # Check that the email is unique across users
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate(self, attrs):
        # Check if passwords match
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Passwords do not match."})

        # Validate password strength
        validate_password(attrs["password"])
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password2')  # Remove the extra confirmation field
        user = User.objects.create_user(**validated_data, date_joined=timezone.now())
        return user