"""
Predictor CRUD operations unit tests.
Tests for predictor creation, reading, updating, and deletion with proper permissions.
"""

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken
from dataset.models import Dataset
from predictors.models import Predictor, PredictorPermission


class PredictorCRUDTests(APITestCase):
    """Test suite for predictor CRUD operations."""
    
    def setUp(self):
        """Set up test users, dataset, and auth tokens."""
        self.owner = User.objects.create_user(username="owner", password="password123")
        self.other_user = User.objects.create_user(username="other", password="password123")
        self.dataset = Dataset.objects.create(dataset_name="Dataset A", owner=self.owner)

        # URLs
        self.url = "/api/predictors/"

        # Tokens
        self.owner_token = str(AccessToken.for_user(self.owner))
        self.other_token = str(AccessToken.for_user(self.other_user))

    def test_create_predictor(self):
        """Owner can create a predictor with default values."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        data = {
            "name": "Predictor 1", 
            "description": "Test predictor description",
            "dataset_id": self.dataset.dataset_id
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        predictor = Predictor.objects.get(name="Predictor 1")
        self.assertEqual(predictor.owner, self.owner)
        self.assertEqual(predictor.dataset, self.dataset)
        # Verify default values
        self.assertFalse(predictor.is_private)
        self.assertEqual(predictor.time_unit, 'day')
        self.assertEqual(predictor.regularization, 'l2')
    
    def test_create_predictor_with_advanced_config(self):
        """Owner can create a predictor with advanced configuration."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        data = {
            "name": "Advanced Predictor",
            "description": "Predictor with custom settings",
            "dataset_id": self.dataset.dataset_id,
            "is_private": True,
            "time_unit": "month",
            "num_time_points": 12,
            "regularization": "l1",
            "cox_feature_selection": True,
            "run_cross_validation": False
        }
        response = self.client.post(self.url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        predictor = Predictor.objects.get(name="Advanced Predictor")
        self.assertTrue(predictor.is_private)
        self.assertEqual(predictor.time_unit, 'month')
        self.assertEqual(predictor.num_time_points, 12)
        self.assertEqual(predictor.regularization, 'l1')
        self.assertTrue(predictor.cox_feature_selection)
        self.assertFalse(predictor.run_cross_validation)


    def test_edit_predictor(self):
        """Owner can update their predictor."""
        predictor = Predictor.objects.create(
            name="Initial", 
            description="Initial description", 
            dataset=self.dataset, 
            owner=self.owner
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        response = self.client.patch(
            f"{self.url}{predictor.predictor_id}/", {"description": "Updated description", "is_private": True}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        predictor.refresh_from_db()
        self.assertEqual(predictor.description, "Updated description")
        self.assertTrue(predictor.is_private)

    def test_edit_predictor_advanced_fields(self):
        """Owner can update advanced configuration fields."""
        predictor = Predictor.objects.create(
            name="Config Test",
            description="Testing config updates",
            dataset=self.dataset,
            owner=self.owner
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        response = self.client.patch(
            f"{self.url}{predictor.predictor_id}/",
            {
                "time_unit": "week",
                "regularization": "l1",
                "standardize_features": False,
                "tune_parameters": False
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        predictor.refresh_from_db()
        self.assertEqual(predictor.time_unit, "week")
        self.assertEqual(predictor.regularization, "l1")
        self.assertFalse(predictor.standardize_features)
        self.assertFalse(predictor.tune_parameters)

    def test_delete_predictor(self):
        """Owner can delete their predictor."""
        predictor = Predictor.objects.create(
            name="To Delete", 
            description="This will be deleted", 
            dataset=self.dataset, 
            owner=self.owner
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        response = self.client.delete(f"{self.url}{predictor.predictor_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Predictor.objects.filter(predictor_id=predictor.predictor_id).exists())

    def test_retrieve_predictor_with_nested_data(self):
        """Retrieving a predictor includes nested owner and dataset info."""
        predictor = Predictor.objects.create(
            name="Nested Test",
            description="Testing nested serialization",
            dataset=self.dataset,
            owner=self.owner
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        response = self.client.get(f"{self.url}{predictor.predictor_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("owner", response.data)
        self.assertEqual(response.data["owner"]["username"], "owner")
        self.assertEqual(response.data["dataset"]["dataset_name"], "Dataset A")

class PredictorPermissionTests(APITestCase):
    """Test suite for predictor permission system."""
    
    def setUp(self):
        """Set up test users, dataset, and auth tokens."""
        self.owner = User.objects.create_user(username="owner", password="password123")
        self.other_user = User.objects.create_user(username="other", password="password123")
        self.dataset = Dataset.objects.create(dataset_name="Dataset A", owner=self.owner)

        # URLs
        self.url = "/api/predictors/"

        # Tokens
        self.owner_token = str(AccessToken.for_user(self.owner))
        self.other_token = str(AccessToken.for_user(self.other_user))

    def test_non_owner_cannot_update(self):
        """Non-owner cannot update a predictor."""
        predictor = Predictor.objects.create(
            name="Private Predictor", 
            description="Owner only", 
            dataset=self.dataset, 
            owner=self.owner,
            is_private=True
            )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.other_token}")
        response = self.client.patch(
            f"{self.url}{predictor.predictor_id}/", {"description": "Hacked"}
        )
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_non_owner_cannot_delete(self):
        """Non-owner cannot delete a predictor."""
        predictor = Predictor.objects.create(
            name="Protected", 
            description="Cannot delete", 
            dataset=self.dataset, 
            owner=self.owner
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.other_token}")
        response = self.client.delete(f"{self.url}{predictor.predictor_id}/")
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_non_owner_can_view_public_predictor(self):
        """Non-owner can view a public predictor (is_private=False)."""
        predictor = Predictor.objects.create(
            name="Public Predictor",
            description="Everyone can see",
            dataset=self.dataset,
            owner=self.owner,
            is_private=False
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.other_token}")
        response = self.client.get(f"{self.url}{predictor.predictor_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_owner_can_view_if_granted_permission(self):
        """Non-owner can view a predictor if granted explicit permission."""
        predictor = Predictor.objects.create(
            name="Shared Private Predictor", 
            description="Shared with specific user", 
            dataset=self.dataset, 
            owner=self.owner,
            is_private=True
        )
        PredictorPermission.objects.create(predictor=predictor, user=self.other_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.other_token}")
        response = self.client.get(f"{self.url}{predictor.predictor_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_owner_cannot_view_if_restricted(self):
        """Non-owner cannot retrieve a private predictor without permission."""
        predictor = Predictor.objects.create(
            name="Strictly Private", 
            description="No access granted", 
            dataset=self.dataset, 
            owner=self.owner,
            is_private=True
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.other_token}")
        response = self.client.get(f"{self.url}{predictor.predictor_id}/")
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_permission_prevents_duplicate(self):
        """Duplicate permissions for same user-predictor pair are prevented."""
        predictor = Predictor.objects.create(
            name="Test Predictor",
            description="For permission test",
            dataset=self.dataset,
            owner=self.owner
        )
        PredictorPermission.objects.create(predictor=predictor, user=self.other_user)
        
        # Attempt to create duplicate permission
        with self.assertRaises(Exception):  # Django will raise IntegrityError
            PredictorPermission.objects.create(predictor=predictor, user=self.other_user)

    def test_owner_always_has_access(self):
        """Owner can always access their own predictor regardless of privacy settings."""
        predictor = Predictor.objects.create(
            name="Owner's Private",
            description="Owner access test",
            dataset=self.dataset,
            owner=self.owner,
            is_private=True
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.owner_token}")
        response = self.client.get(f"{self.url}{predictor.predictor_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
