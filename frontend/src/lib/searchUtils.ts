/**
 * Search and filter utilities for Dashboard items
 *
 * Provides robust search functionality with:
 * - Case-insensitive matching
 * - Prioritization of matches at the start of titles
 * - Fuzzy matching for typos and partial matches
 * - Relevance-based sorting
 */

export interface SearchableItem {
  title: string;
  notes?: string;
  [key: string]: any;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchType: 'exact' | 'startsWith' | 'contains' | 'fuzzy';
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses a simple character-based distance metric
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * (number of single-character edits needed to transform one string into another)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check if query matches item and calculate relevance score
 */
function scoreMatch(item: SearchableItem, query: string): SearchResult<SearchableItem> | null {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTitle = item.title.toLowerCase().trim();
  const normalizedNotes = item.notes?.toLowerCase().trim() || '';

  // Exact match (highest priority)
  if (normalizedTitle === normalizedQuery) {
    return { item, score: 1000, matchType: 'exact' };
  }

  // Starts with query (second highest priority)
  if (normalizedTitle.startsWith(normalizedQuery)) {
    // Score based on how much of the title is matched
    const matchRatio = normalizedQuery.length / normalizedTitle.length;
    return { item, score: 900 + (matchRatio * 100), matchType: 'startsWith' };
  }

  // Word boundary match at the start of any word in the title
  const words = normalizedTitle.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(normalizedQuery)) {
      // Earlier words get higher scores
      const positionScore = (words.length - i) / words.length * 100;
      return { item, score: 800 + positionScore, matchType: 'startsWith' };
    }
  }

  // Contains match (medium priority)
  if (normalizedTitle.includes(normalizedQuery)) {
    // Score based on position (earlier = better) and length ratio
    const position = normalizedTitle.indexOf(normalizedQuery);
    const positionScore = (1 - position / normalizedTitle.length) * 50;
    const lengthScore = (normalizedQuery.length / normalizedTitle.length) * 50;
    return { item, score: 700 + positionScore + lengthScore, matchType: 'contains' };
  }

  // Match in notes/description (lower priority than title)
  if (normalizedNotes.includes(normalizedQuery)) {
    return { item, score: 600, matchType: 'contains' };
  }

  // Fuzzy match with reasonable similarity threshold
  const similarity = calculateSimilarity(normalizedQuery, normalizedTitle);
  const FUZZY_THRESHOLD = 0.6; // Adjust this to be more/less strict

  if (similarity >= FUZZY_THRESHOLD) {
    return { item, score: 500 + (similarity * 100), matchType: 'fuzzy' };
  }

  // Check fuzzy match on individual words
  for (const word of words) {
    const wordSimilarity = calculateSimilarity(normalizedQuery, word);
    if (wordSimilarity >= FUZZY_THRESHOLD) {
      return { item, score: 400 + (wordSimilarity * 100), matchType: 'fuzzy' };
    }
  }

  return null;
}

/**
 * Filter and sort items by search query with intelligent prioritization
 *
 * @param items - Array of items to search
 * @param query - Search query string
 * @returns Filtered and sorted array of items
 */
export function searchAndSort<T extends SearchableItem>(items: T[], query: string): T[] {
  // If no query, return original array
  if (!query.trim()) {
    return items;
  }

  // Score all items
  const results: SearchResult<T>[] = [];

  for (const item of items) {
    const result = scoreMatch(item, query);
    if (result) {
      results.push(result as SearchResult<T>);
    }
  }

  // Sort by score (highest first), then alphabetically by title for same scores
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Secondary sort: alphabetical by title
    return a.item.title.localeCompare(b.item.title, undefined, { sensitivity: 'base' });
  });

  // Return sorted items
  return results.map(r => r.item);
}

/**
 * Search folders with special handling for nested items
 *
 * Folders can match on:
 * - Folder name (highest priority)
 * - Folder description
 * - Items within the folder (lower priority)
 */
export function searchFolders<T extends { name: string; description?: string; items?: SearchableItem[] }>(
  folders: T[],
  query: string
): T[] {
  if (!query.trim()) {
    return folders;
  }

  const results: { folder: T; score: number }[] = [];

  for (const folder of folders) {
    let maxScore = 0;
    let matchFound = false;

    // Check folder name (highest priority)
    const nameResult = scoreMatch({ title: folder.name } as SearchableItem, query);
    if (nameResult) {
      maxScore = nameResult.score + 200; // Boost folder name matches
      matchFound = true;
    }

    // Check folder description
    if (folder.description) {
      const descResult = scoreMatch({ title: folder.description } as SearchableItem, query);
      if (descResult && descResult.score > maxScore - 200) {
        maxScore = Math.max(maxScore, descResult.score + 100); // Boost description matches but less than name
        matchFound = true;
      }
    }

    // Check items within folder (lower priority)
    if (folder.items && folder.items.length > 0) {
      for (const item of folder.items) {
        const itemResult = scoreMatch(item, query);
        if (itemResult) {
          // Items get lower priority than folder name/description
          maxScore = Math.max(maxScore, itemResult.score - 100);
          matchFound = true;
        }
      }
    }

    if (matchFound) {
      results.push({ folder, score: maxScore });
    }
  }

  // Sort by score (highest first), then alphabetically by name for same scores
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Secondary sort: alphabetical by folder name
    return a.folder.name.localeCompare(b.folder.name, undefined, { sensitivity: 'base' });
  });

  return results.map(r => r.folder);
}

/**
 * Highlight matching portions of text (for future use in UI)
 */
export function highlightMatch(text: string, query: string): { text: string; isMatch: boolean }[] {
  if (!query.trim()) {
    return [{ text, isMatch: false }];
  }

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  const index = normalizedText.indexOf(normalizedQuery);

  if (index === -1) {
    return [{ text, isMatch: false }];
  }

  const parts: { text: string; isMatch: boolean }[] = [];

  if (index > 0) {
    parts.push({ text: text.substring(0, index), isMatch: false });
  }

  parts.push({ text: text.substring(index, index + query.length), isMatch: true });

  if (index + query.length < text.length) {
    parts.push({ text: text.substring(index + query.length), isMatch: false });
  }

  return parts;
}
