export interface OfficeRole {
  id: number;
  name: string;
  description: string;
  role: string;
  officeGroup: string[];
}

export interface OfficeGroup {
  id: number;
  name: string;
  officeRole: OfficeRole[];
  officeUser: string[];
}

export interface OfficeBid {
  id: number;
  officeUserId?: number;
  officeUser?: number;
  dateTime?: string;
  status?: number;
  comment?: string | null;
  OfficeUser?: number;
  OfficeUserId?: number;
  DateTime?: string;
  Status?: number;
  Comment?: string | null;
}

export interface OfficeUser {
  id: number;
  login: string;

  name: string | null;
  surname: string | null;
  patronymic: string | null;
  position: string | null;

  actual: number;

  factoryPersonId: number | null;
  personalitiesGuid: Guid | null;

  factoryPerson: FactoryPerson | null;
  personality: Personality | null;

  officeGroup: OfficeGroup[];
  locations: Location[];
}

export type Guid = string;

export interface LocationType {
  guid: Guid;
  name: string;
}

export interface Location {
  guid: Guid;
  name: string;
  rkCode: number | null;
  aggregatorsCode: number | null;
  actual: number;

  locationTypeGuid: Guid | null;
  locationType: LocationType | null;
}

// ====== FactoryPerson ======
export interface FactoryPerson {
  id: number;

  surname: string;
  name: string;
  patronymic: string | null;

  birthdate: string; // DateTime -> ISO string (date)
  passport: string;
  passportDate: string | null;

  factoryCitizenship: number;
  factoryEntity: number;
  factoryDocumentType: number;

  factoryDepartment?: number | null;
  factoryWorkshop?: number | null;
  factoryJobTitle?: number | null;

  factoryCitizenshipType?: number | null;

  phone: string | null;
  cardNumber: string | null;

  factoryBanks: number | null;

  hostelChekin: string | null; // date
  hostelCheckOut: string | null; // date

  hiringDate: string; // date
  dismissedDate: string | null; // date

  photo: string | null;
  passCardNumber: string | null;

  skudGroupId: number | null;
  fake: boolean | null;
}

export interface FactoryBanks {
  id: number;
  name: string;
}

export interface FactoryCitizenship {
  id: number;
  name: string;
  citizenshipTypeId?: number | null;
}

export interface FactoryEntity {
  id: number;
  name: string;
}

export interface FactoryDocumentType {
  id: number;
  name: string;
}

// extend FactoryPerson with optional navigation properties returned by API
export interface FactoryPersonWithNav extends FactoryPerson {
  bank?: FactoryBanks | null;
  citizenship?: FactoryCitizenship | null;
  entity?: FactoryEntity | null;
  documentType?: FactoryDocumentType | null;
  factoryDepartmentName?: string | null;
  factoryWorkshopName?: string | null;
  factoryJobTitleName?: string | null;
}

export interface Personality {
  guid: Guid;
  name: string;
  birthdate: string;
  phone: string | null;
  password: string | null;
  phoneCode: string | null;
  lastPhoneCall: string | null;
  phoneCallAttempts: number | null;
  inn: string | null;
  snils: string | null;
  lmkid: number | null;
  personalityCitizenshipId: number | null;
}
