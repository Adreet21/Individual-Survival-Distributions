from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken
from .models import Predictor, PinnedPredictor, PredictorPermission
from dataset.models import Dataset
from folders.models import Folder, FolderItem
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from dataset.models import DatasetStatistics

# ----------------------------
# Helper to authenticate user via JWT
# ----------------------------
def authenticate(client, user):
    token = AccessToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

# ----------------------------
# Predictor Model Tests
# ----------------------------
class PredictorModelTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="owner", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.user)
        self.predictor = Predictor.objects.create(
            name="Test Predictor",
            description="Test description",
            dataset=self.dataset,
            owner=self.user,
            is_private=True,
        )

    def test_predictor_str(self):
        self.assertEqual(str(self.predictor), "Test Predictor")

    def test_predictor_owner(self):
        self.assertEqual(self.predictor.owner, self.user)

# ----------------------------
# PredictorPermission Model Tests
# ----------------------------
class PredictorPermissionModelTest(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass")
        self.other_user = User.objects.create_user(username="other", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.owner)
        self.predictor = Predictor.objects.create(
            name="Test Predictor",
            description="Test description",
            dataset=self.dataset,
            owner=self.owner,
        )
        self.permission = PredictorPermission.objects.create(
            predictor=self.predictor, user=self.other_user
        )

    def test_permission_str(self):
        self.assertEqual(
            str(self.permission),
            f"{self.other_user.username} - {self.predictor.name}"
        )

# ----------------------------
# PinnedPredictor Model Tests
# ----------------------------
class PinnedPredictorModelTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.user)
        self.predictor = Predictor.objects.create(
            name="Pinned Predictor",
            description="Desc",
            dataset=self.dataset,
            owner=self.user,
        )
        self.pin = PinnedPredictor.objects.create(user=self.user, predictor=self.predictor)

    def test_pin_str(self):
        self.assertEqual(str(self.pin), f"{self.user.username} pinned {self.predictor.name}")

# ----------------------------
# Predictor ViewSet Tests
# ----------------------------
class PredictorViewSetTest(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass")
        self.other = User.objects.create_user(username="other", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.owner)
        self.predictor = Predictor.objects.create(
            name="Private Predictor",
            description="desc",
            dataset=self.dataset,
            owner=self.owner,
            is_private=True,
        )
        self.permission = PredictorPermission.objects.create(
            predictor=self.predictor, user=self.other
        )

    def test_owner_can_retrieve(self):
        authenticate(self.client, self.owner)
        url = reverse("predictors-detail", args=[self.predictor.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_shared_user_can_retrieve(self):
        authenticate(self.client, self.other)
        url = reverse("predictors-detail", args=[self.predictor.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_shared_user_cannot_retrieve(self):
        stranger = User.objects.create_user(username="stranger", password="pass")
        authenticate(self.client, stranger)
        url = reverse("predictors-detail", args=[self.predictor.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_update(self):
        authenticate(self.client, self.owner)
        url = reverse("predictors-detail", args=[self.predictor.pk])
        response = self.client.patch(url, {"name": "Updated Name"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.predictor.refresh_from_db()
        self.assertEqual(self.predictor.name, "Updated Name")

    def test_non_owner_cannot_update(self):
        authenticate(self.client, self.other)
        url = reverse("predictors-detail", args=[self.predictor.pk])
        response = self.client.patch(url, {"name": "Hacked Name"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_predictor_detail_excludes_dataset_statistics(self):
        authenticate(self.client, self.owner)
        payload = b"time,censored,feature_a\n5,1,0.2\n8,0,1.2\n12,1,2.4\n"
        dataset_file = SimpleUploadedFile(
            "predictor_stats.csv",
            payload,
            content_type="text/csv"
        )

        dataset_response = self.client.post(
            '/api/datasets/',
            {
                'dataset_name': 'Stats Dataset',
                'time_unit': 'day',
                'is_public': False,
                'file': dataset_file,
            },
            format='multipart'
        )
        self.assertEqual(dataset_response.status_code, status.HTTP_201_CREATED)
        dataset_id = dataset_response.data['dataset_id']
        dataset = Dataset.objects.get(dataset_id=dataset_id)

        self.assertTrue(
            DatasetStatistics.objects.filter(dataset=dataset).exists(),
            "Dataset statistics should be stored after dataset creation."
        )

        predictor = Predictor.objects.create(
            name="Stats Predictor",
            description="desc",
            dataset=dataset,
            owner=self.owner,
            is_private=True,
        )

        url = reverse("predictors-detail", args=[predictor.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("dataset_stats", response.data)

# ----------------------------
# PredictorPermission ViewSet Tests
# ----------------------------
class PredictorPermissionViewSetTest(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="pass")
        self.user = User.objects.create_user(username="user", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.owner)
        self.predictor = Predictor.objects.create(
            name="Private Predictor", description="desc", dataset=self.dataset, owner=self.owner
        )

    def test_only_owner_can_create_permission(self):
        url = reverse("predictor-permission-list") 

        # Non-owner cannot create permission
        authenticate(self.client, self.user)
        response = self.client.post(url, {"predictor": self.predictor.pk, "user": self.user.pk})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Owner can create permission
        authenticate(self.client, self.owner)
        response = self.client.post(url, {"predictor": self.predictor.pk, "user": self.user.pk})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

# ----------------------------
# PinnedPredictor ViewSet Tests
# ----------------------------
class PinnedPredictorViewSetTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user", password="pass")
        self.dataset = Dataset.objects.create(dataset_name="Dataset 1", owner=self.user)
        self.predictor = Predictor.objects.create(
            name="Pred", description="desc", dataset=self.dataset, owner=self.user
        )
        authenticate(self.client, self.user)

    def test_user_can_pin_predictor(self):
        url = reverse("predictors-pin", args=[self.predictor.pk]) 
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(PinnedPredictor.objects.filter(user=self.user, predictor=self.predictor).exists())

    def test_user_can_unpin_predictor(self):
        PinnedPredictor.objects.create(user=self.user, predictor=self.predictor)
        url = reverse("predictors-unpin", args=[self.predictor.pk]) 
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(PinnedPredictor.objects.filter(user=self.user, predictor=self.predictor).exists())

    def test_list_pinned_predictors(self):
        PinnedPredictor.objects.create(user=self.user, predictor=self.predictor)
        url = reverse("pinned-predictor-list")  # Corrected URL
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "Pred")

    def test_unpinned_predictors_not_returned(self):
        url = reverse("pinned-predictor-list") 
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)


# ----------------------------
# Predictor Folder Integration Tests
# ----------------------------
class PredictorFolderIntegrationTestCase(APITestCase):
    """Test folder integration with predictor API."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='testpass123'
        )
        
        # Create a test dataset
        self.dataset = Dataset.objects.create(
            dataset_name='Test Dataset',
            owner=self.user,
            time_unit='month'
        )
        
        # Create a test folder
        self.folder = Folder.objects.create(
            name='Test Folder',
            owner=self.user,
            is_private=False
        )
    
    def test_create_predictor_with_folder_assignment(self):
        """Test creating a predictor and assigning it to a folder."""
        authenticate(self.client, self.user)
        
        data = {
            'name': 'Test Predictor',
            'description': 'Test description',
            'dataset_id': self.dataset.dataset_id,
            'folder_id': self.folder.folder_id,
            'is_private': False
        }
        
        response = self.client.post('/api/predictors/', data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Check that predictor was created
        predictor = Predictor.objects.get(name='Test Predictor')
        self.assertEqual(predictor.owner, self.user)
        
        # Check that predictor was added to folder
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        folder_item = FolderItem.objects.filter(
            folder=self.folder,
            content_type=predictor_ct,
            object_id=predictor.predictor_id
        ).first()
        
        self.assertIsNotNone(folder_item)
        self.assertEqual(folder_item.added_by, self.user)
    
    def test_create_predictor_with_invalid_folder(self):
        """Test creating a predictor with invalid folder_id."""
        authenticate(self.client, self.user)
        
        data = {
            'name': 'Test Predictor',
            'description': 'Test description',
            'dataset_id': self.dataset.dataset_id,
            'folder_id': 99999,  # Non-existent folder
            'is_private': False
        }
        
        response = self.client.post('/api/predictors/', data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('folder_id', response.data)
    
    def test_create_predictor_with_other_users_folder(self):
        """Test creating a predictor with another user's folder."""
        other_folder = Folder.objects.create(
            name='Other Folder',
            owner=self.other_user,
            is_private=False
        )
        
        authenticate(self.client, self.user)
        
        data = {
            'name': 'Test Predictor',
            'description': 'Test description',
            'dataset_id': self.dataset.dataset_id,
            'folder_id': other_folder.folder_id,
            'is_private': False
        }
        
        response = self.client.post('/api/predictors/', data)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('folder_id', response.data)
    
    def test_list_predictors_with_folder_filtering(self):
        """Test listing predictors with folder filtering."""
        authenticate(self.client, self.user)
        
        # Create predictors - one in folder, one not
        predictor1 = Predictor.objects.create(
            name='Predictor 1',
            description='Description 1',
            dataset=self.dataset,
            owner=self.user
        )
        
        predictor2 = Predictor.objects.create(
            name='Predictor 2',
            description='Description 2',
            dataset=self.dataset,
            owner=self.user
        )
        
        # Add predictor1 to folder
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        FolderItem.objects.create(
            folder=self.folder,
            content_type=predictor_ct,
            object_id=predictor1.predictor_id,
            added_by=self.user
        )
        
        # Test filtering by folder
        response = self.client.get(f'/api/predictors/?folder_id={self.folder.folder_id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['predictor_id'], predictor1.predictor_id)
        
        # Test filtering for items not in any folder
        response = self.client.get('/api/predictors/?folder_id=null')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['predictor_id'], predictor2.predictor_id)
    
    def test_predictor_serializer_includes_folder_info(self):
        """Test that predictor serializer includes folder information."""
        authenticate(self.client, self.user)
        
        # Create predictor
        predictor = Predictor.objects.create(
            name='Test Predictor',
            description='Test description',
            dataset=self.dataset,
            owner=self.user
        )
        
        # Add to folder
        predictor_ct = ContentType.objects.get_for_model(Predictor)
        FolderItem.objects.create(
            folder=self.folder,
            content_type=predictor_ct,
            object_id=predictor.predictor_id,
            added_by=self.user
        )
        
        # Retrieve predictor
        response = self.client.get(f'/api/predictors/{predictor.predictor_id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check folder information is included
        self.assertIn('folder', response.data)
        self.assertIsNotNone(response.data['folder'])
        self.assertEqual(response.data['folder']['folder_id'], self.folder.folder_id)
        self.assertEqual(response.data['folder']['name'], self.folder.name)
