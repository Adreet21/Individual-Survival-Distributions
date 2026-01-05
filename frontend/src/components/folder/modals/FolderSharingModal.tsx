/**
 * ----------------------------------------------------------------------------------
 * FolderSharingModal
 * ----------------------------------------------------------------------------------
 * - Modal for managing folder sharing and permissions
 * - Allows folder owners to search for users and grant/revoke access
 * - Shows current permissions and provides management interface
 * - Supports user search with debounced input
 * - Handles permission granting and revocation with optimistic updates
 */

import { useState, useEffect, useCallback } from "react";
import {
  getFolderPermissions,
  grantFolderPermission,
  revokeFolderPermission,
  type Folder,
  type FolderPermission,
  type User,
} from "../../../lib/folders";
import { searchUsers } from "../../../lib/users";

export interface FolderSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  folder: Folder | null;
  onPermissionsUpdated?: () => void;
}

interface SearchResult extends User {
  isLoading?: boolean;
  hasAccess?: boolean;
}

export default function FolderSharingModal({
  isOpen,
  onClose,
  folder,
  onPermissionsUpdated,
}: FolderSharingModalProps) {
  const [permissions, setPermissions] = useState<FolderPermission[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load permissions when modal opens
  useEffect(() => {
    if (isOpen && folder) {
      loadPermissions();
    } else {
      // Reset state when modal closes
      setPermissions([]);
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, folder]);

  // Debounced user search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsSearching(true);
        setError(null);
        const users = await searchUsers(searchQuery.trim(), 10);
        
        // Mark users who already have access
        const usersWithAccess = users.map(user => ({
          ...user,
          hasAccess: permissions.some(p => p.user.id === user.id)
        }));
        
        setSearchResults(usersWithAccess);
      } catch (err: any) {
        console.error("User search error:", err);
        let errorMessage = "Failed to search users";
        
        if (err.status === 404) {
          errorMessage = "User search service is not available";
        } else if (err.status === 403) {
          errorMessage = "You don't have permission to search users";
        } else if (err.status === 401) {
          errorMessage = "Please log in to search for users";
        } else if (err.status >= 500) {
          errorMessage = "Server error - please try again later";
        } else if (err.message) {
          errorMessage = `Search failed: ${err.message}`;
        }
        
        setError(errorMessage);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, permissions]);

  const loadPermissions = async () => {
    if (!folder) return;
    
    try {
      setIsLoadingPermissions(true);
      setError(null);
      const folderPermissions = await getFolderPermissions(folder.folder_id);
      setPermissions(folderPermissions);
    } catch (err: any) {
      setError("Failed to load folder permissions");
    } finally {
      setIsLoadingPermissions(false);
    }
  };

  const handleGrantAccess = async (user: User) => {
    if (!folder) return;

    try {
      setError(null);
      setSuccessMessage(null);
      
      // Optimistic update
      setSearchResults(prev => 
        prev.map(u => u.id === user.id ? { ...u, isLoading: true } : u)
      );

      await grantFolderPermission(folder.folder_id, {
        user_id: user.id,
        permission_type: 'view'
      });

      // Update local state
      const newPermission: FolderPermission = {
        folder: folder.folder_id,
        user: user,
        permission_type: 'view',
        granted_at: new Date().toISOString(),
        granted_by: { id: 0, username: 'You', email: '' } // Placeholder
      };
      
      setPermissions(prev => [...prev, newPermission]);
      setSearchResults(prev => 
        prev.map(u => u.id === user.id ? { ...u, hasAccess: true, isLoading: false } : u)
      );
      
      setSuccessMessage(`Access granted to ${user.username}`);
      onPermissionsUpdated?.();
      
    } catch (err: any) {
      setError(`Failed to grant access to ${user.username}`);
      setSearchResults(prev => 
        prev.map(u => u.id === user.id ? { ...u, isLoading: false } : u)
      );
    }
  };

  const handleRevokeAccess = async (permission: FolderPermission) => {
    if (!folder) return;

    try {
      setError(null);
      setSuccessMessage(null);
      
      await revokeFolderPermission(folder.folder_id, permission.user.id);
      
      // Update local state
      setPermissions(prev => prev.filter(p => p.user.id !== permission.user.id));
      setSearchResults(prev => 
        prev.map(u => u.id === permission.user.id ? { ...u, hasAccess: false } : u)
      );
      
      setSuccessMessage(`Access revoked from ${permission.user.username}`);
      onPermissionsUpdated?.();
      
    } catch (err: any) {
      setError(`Failed to revoke access from ${permission.user.username}`);
    }
  };

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || successMessage) {
      const timeoutId = setTimeout(clearMessages, 5000);
      return () => clearTimeout(timeoutId);
    }
  }, [error, successMessage, clearMessages]);

  if (!isOpen || !folder) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold">Share Folder</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage access to "{folder.name}"
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Messages */}
          {(error || successMessage) && (
            <div className="p-4 border-b">
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-red-700">{error}</div>
                    <button
                      onClick={clearMessages}
                      className="text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {successMessage && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-green-700">{successMessage}</div>
                    <button
                      onClick={clearMessages}
                      className="text-green-400 hover:text-green-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* User Search */}
            <div>
              <label htmlFor="userSearch" className="block text-sm font-medium text-gray-700 mb-2">
                Add People
              </label>
              <div className="relative">
                <input
                  id="userSearch"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or email..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {isSearching && (
                  <div className="absolute right-3 top-2.5">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-3 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{user.username}</div>
                          {user.email && (
                            <div className="text-xs text-gray-500">{user.email}</div>
                          )}
                        </div>
                      </div>
                      <div>
                        {user.hasAccess ? (
                          <span className="text-xs text-green-600 font-medium">
                            Has Access
                          </span>
                        ) : (
                          <button
                            onClick={() => handleGrantAccess(user)}
                            disabled={user.isLoading}
                            className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {user.isLoading ? "Adding..." : "Add"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <div className="mt-3 text-sm text-gray-500 text-center py-4">
                  No users found matching "{searchQuery}"
                </div>
              )}
            </div>

            {/* Current Permissions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  People with Access
                </h3>
                {isLoadingPermissions && (
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                )}
              </div>

              {permissions.length === 0 && !isLoadingPermissions ? (
                <div className="text-sm text-gray-500 text-center py-8 border border-gray-200 rounded-md">
                  No one else has access to this folder
                </div>
              ) : (
                <div className="space-y-2">
                  {permissions.map((permission) => (
                    <div
                      key={permission.user.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                          {permission.user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{permission.user.username}</div>
                          {permission.user.email && (
                            <div className="text-xs text-gray-500">{permission.user.email}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 capitalize">
                          {permission.permission_type}
                        </span>
                        <button
                          onClick={() => handleRevokeAccess(permission)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sharing Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-1">About Folder Sharing</div>
                <ul className="text-xs space-y-1 text-blue-700">
                  <li>• People with access can view all items in this folder</li>
                  <li>• They will also gain access to individual items within the folder</li>
                  <li>• Only you can add or remove items from this folder</li>
                  <li>• Folder privacy settings still apply to public visibility</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
