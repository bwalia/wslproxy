// Authentication types

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface TokenData {
  accessToken: string;
  expiryDate: string;
}

export interface InstanceData {
  instance_hash: string;
  serial_number: string;
}
