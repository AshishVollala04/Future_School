/**
 * Internal platform console only: directory of all schools, subscriptions, onboarding.
 * Never mounted for school users. A school session has no way to list or switch schools.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SchoolTenant, TenantStatus } from '../types/tenant';
import { INITIAL_TENANTS } from '../mock/tenants';
import { storage, storageKeys } from '../services/storage';

const KEY = storageKeys.auth('platformTenantDirectory');

interface PlatformTenantContextType {
  allTenants: SchoolTenant[];
  updateTenantStatus: (tenantId: string, status: TenantStatus) => void;
  registerNewTenant: (tenant: Omit<SchoolTenant, 'id' | 'status' | 'onboardedAt'>) => SchoolTenant;
}

const Ctx = createContext<PlatformTenantContextType | undefined>(undefined);

export const PlatformTenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [allTenants, setAllTenants] = useState<SchoolTenant[]>(() => storage.get(KEY, INITIAL_TENANTS));

  useEffect(() => storage.set(KEY, allTenants), [allTenants]);

  const updateTenantStatus = (tenantId: string, status: TenantStatus) =>
    setAllTenants(prev =>
      prev.map(t =>
        t.id === tenantId
          ? { ...t, status, verifiedAt: status === 'ACTIVE' && !t.verifiedAt ? new Date().toISOString().split('T')[0] : t.verifiedAt }
          : t
      )
    );

  const registerNewTenant = (data: Omit<SchoolTenant, 'id' | 'status' | 'onboardedAt'>): SchoolTenant => {
    const t: SchoolTenant = {
      ...data,
      id: `SCH-${Date.now().toString().slice(-4)}`,
      status: 'PENDING_VERIFICATION',
      onboardedAt: new Date().toISOString().split('T')[0]
    };
    setAllTenants(prev => [t, ...prev]);
    return t;
  };

  return <Ctx.Provider value={{ allTenants, updateTenantStatus, registerNewTenant }}>{children}</Ctx.Provider>;
};

export const usePlatformTenants = (): PlatformTenantContextType => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlatformTenants must be used within PlatformTenantProvider');
  return c;
};
