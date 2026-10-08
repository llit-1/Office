export type StockLocationOption = {
  guid: string;
  name: string;
  actual: boolean;
};

export type StockHolderOption = {
  id: number;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  actual: boolean;
};

export type StockCategoryOption = {
  id: number;
  name: string;
  parent: number | null;
  actual: boolean;
};

export type StockLookups = {
  locations: StockLocationOption[];
  holders: StockHolderOption[];
  categories: StockCategoryOption[];
};

export type StockHolderForm = {
  surname: string;
  name: string;
  patronymic: string;
  jobTitle: string;
  department: string;
};

export type StockSearchRequest = {
  holderId: number | null;
  categoryId: number | null;
  locationGuids: string[];
  writtenOff: boolean;
};

export type StockSearchItem = {
  code: string;
  category: string | null;
  subCategory: string | null;
  name: string | null;
  holderName: string | null;
  locationName: string | null;
  inStorage: boolean;
};

export type StockSearchGroup = {
  key: string;
  category: string | null;
  subCategory: string | null;
  name: string | null;
  holderName: string | null;
  locationName: string | null;
  items: StockSearchItem[];
};

export type StockObject = {
  code: string;
  name: string;
  categoryPath: string[];
  holderName: string | null;
  holderDetails: string | null;
  locationName: string | null;
  active: boolean;
};

export type StockHistoryEntry = {
  actionId: number;
  actionName: string;
  dateTime: string | null;
  user: string | null;
  locationName: string | null;
  holderName: string | null;
  comment: string | null;
};

export type StockObjectCard = {
  object: StockObject;
  history: StockHistoryEntry[];
  canWriteOff: boolean;
};

export type StockTransferRequest = {
  locationGuid: string | null;
  holderId: number | null;
  comment: string;
  items: Array<{ code: string; locationGuid: string | null; holderId: number | null; comment: string | null }>;
};
