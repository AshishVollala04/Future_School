package com.futureschool.backend.tenant;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Tells Hibernate which school a session belongs to. Every entity extending
 * {@link com.futureschool.backend.entity.TenantScopedEntity} carries a {@code @TenantId}
 * school_id, so Hibernate adds {@code school_id = :current} to every query and entity load
 * and fills it on insert. With no school in context the sentinel matches nothing (fail closed).
 */
@Component
public class SchoolTenantResolver implements CurrentTenantIdentifierResolver<String>, HibernatePropertiesCustomizer {

    @Override
    public String resolveCurrentTenantIdentifier() {
        String id = TenantContext.get();
        return id != null ? id : TenantContext.NONE;
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }

    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, this);
    }
}
