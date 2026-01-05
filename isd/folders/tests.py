from django.test import TestCase
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from .models import Folder, FolderItem
from predictors.models import Predictor
from dataset.models import Dataset


class FolderAutoHideLogicTestCase(TestCase):
    """Test cases for folder auto-hide privacy logic."""
    
    def setUp(self):
        """Set up test data."""
        # Create test users
        self.user1 = User.objects.create_user(username='testuser1', password='testpass')
        self.user2 = User.objects.create_user(username='testuser2', password='testpass')
        
        # Create test dataset
        self.public_dataset = Dataset.objects.create(
            dataset_name='Public Dataset',
            owner=self.user1,
            is_public=True
        )
        
        self.private_dataset = Dataset.objects.create(
            dataset_name='Private Dataset',
            owner=self.user1,
            is_public=False
        )
        
        # Create test predictors
        self.public_predictor = Predictor.objects.create(
            name='Public Predictor',
            description='Test predictor',
            dataset=self.public_dataset,
            owner=self.user1,
            is_private=False
        )
        
        self.private_predictor = Predictor.objects.create(
            name='Private Predictor',
            description='Test predictor',
            dataset=self.private_dataset,
            owner=self.user1,
            is_private=True
        )
    
    def test_public_folder_with_public_items_visible(self):
        """Test that public folders with public items are visible."""
        folder = Folder.objects.create(
            name='Test Folder',
            owner=self.user1,
            is_private=False
        )
        
        # Add public items
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Dataset),
            object_id=self.public_dataset.dataset_id,
            added_by=self.user1
        )
        
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Predictor),
            object_id=self.public_predictor.predictor_id,
            added_by=self.user1
        )
        
        # Folder should not be hidden
        self.assertFalse(folder.should_hide_from_public())
        self.assertEqual(folder.get_public_item_count_efficient(), 2)
        
        # Should appear in public visible queryset
        self.assertIn(folder, Folder.objects.public_visible())
    
    def test_public_folder_with_only_private_items_hidden(self):
        """Test that public folders with only private items are hidden."""
        folder = Folder.objects.create(
            name='Test Folder',
            owner=self.user1,
            is_private=False
        )
        
        # Add only private items
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Dataset),
            object_id=self.private_dataset.dataset_id,
            added_by=self.user1
        )
        
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Predictor),
            object_id=self.private_predictor.predictor_id,
            added_by=self.user1
        )
        
        # Folder should be hidden
        self.assertTrue(folder.should_hide_from_public())
        self.assertEqual(folder.get_public_item_count_efficient(), 0)
        
        # Should not appear in public visible queryset
        self.assertNotIn(folder, Folder.objects.public_visible())
    
    def test_private_folder_always_hidden(self):
        """Test that private folders are always hidden from public."""
        folder = Folder.objects.create(
            name='Test Folder',
            owner=self.user1,
            is_private=True
        )
        
        # Add public items
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Dataset),
            object_id=self.public_dataset.dataset_id,
            added_by=self.user1
        )
        
        # Even with public items, private folder should be hidden
        self.assertTrue(folder.should_hide_from_public())
        
        # Should not appear in public visible queryset
        self.assertNotIn(folder, Folder.objects.public_visible())
    
    def test_empty_folder_hidden(self):
        """Test that empty folders are hidden from public."""
        folder = Folder.objects.create(
            name='Empty Folder',
            owner=self.user1,
            is_private=False
        )
        
        # Empty folder should be hidden
        self.assertTrue(folder.should_hide_from_public())
        self.assertEqual(folder.get_public_item_count_efficient(), 0)
        
        # Should not appear in public visible queryset
        self.assertNotIn(folder, Folder.objects.public_visible())
    
    def test_folder_visibility_to_users(self):
        """Test folder visibility to different types of users."""
        folder = Folder.objects.create(
            name='Test Folder',
            owner=self.user1,
            is_private=False
        )
        
        # Add only private items
        FolderItem.objects.create(
            folder=folder,
            content_type=ContentType.objects.get_for_model(Dataset),
            object_id=self.private_dataset.dataset_id,
            added_by=self.user1
        )
        
        # Owner should always see their folder
        self.assertTrue(folder.is_visible_to_user(self.user1))
        
        # Anonymous user should not see folder with only private items
        self.assertFalse(folder.is_visible_to_user(None))
        
        # Other authenticated user should not see folder with only private items
        self.assertFalse(folder.is_visible_to_user(self.user2))
