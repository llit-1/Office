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