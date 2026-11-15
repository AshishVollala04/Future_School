package com.futureschool.backend.entity;

import com.futureschool.backend.tenant.TenantContext;
import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import lombok.Getter;
import org.hibernate.annotations.TenantId;

/**
 * Base for every row that belongs to one school.
 *
 * school_id is set by Hibernate from the current school on insert, is never updatable,
 * and is added as a filter to every query and load. Services never set it themselves
 * and never accept it from a client.
 */
@MappedSuperclass
@Getter
public abstract class TenantScopedEntity {

    @TenantId
    @Column(name = "school_id", nullable = false, updatable = false, length = 64)
    private String schoolId;

    @PrePersist
    void requireSchoolInContext() {
        // Refuse to write a row with no school (e.g. a background job that forgot to set one).
        TenantContext.require();
    }
}
