export interface KnowledgeSection {
  id: string;
  title: string;
  description: string;
  hasCover: boolean;
  lastIndexedAtUtc: string | null;
  indexStatus: string;
}

export interface KnowledgeAdminSection extends KnowledgeSection {
  rootPath: string;
  isActive: boolean;
  availableToAll: boolean;
  sortOrder: number;
  indexError: string | null;
  roleIds: number[];
}

export interface KnowledgeEntry {
  id: string;
  name: string;
  relativePath: string;
  extension: string;
  isDirectory: boolean;
  size: number;
  lastWriteTimeUtc: string;
  hasIcon: boolean;
  matchCount: number | null;
}

export interface KnowledgeBrowse {
  section: KnowledgeSection;
  currentPath: string;
  entries: KnowledgeEntry[];
}

export interface KnowledgeSearchResult {
  nameMatches: KnowledgeEntry[];
  contentMatches: KnowledgeEntry[];
}

export interface KnowledgePersonalEntry {
  id: string;
  sectionId: string;
  sectionTitle: string;
  name: string;
  relativePath: string;
  extension: string;
  size: number;
  lastWriteTimeUtc: string;
  activityAtUtc: string;
}

export interface KnowledgeRole {
  id: number;
  name: string;
  role: string;
}

export interface KnowledgeSectionPayload {
  title: string;
  description: string;
  rootPath: string;
  isActive: boolean;
  availableToAll: boolean;
  sortOrder: number;
  roleIds: number[];
  cover?: File | null;
}
