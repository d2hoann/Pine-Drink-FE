export interface BranchCreateRequest {
  name: string;
  address: string;
  phone?: string;
  email?: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  supportsPickup?: boolean;
  supportsDelivery?: boolean;
  averagePreparationMinutes?: number;
}

export interface BranchUpdateRequest extends BranchCreateRequest {
  status?: 'ACTIVE' | 'INACTIVE';
}
