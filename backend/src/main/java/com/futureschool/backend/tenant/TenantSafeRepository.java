package com.futureschool.backend.tenant;

import com.futureschool.backend.entity.TenantScopedEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.jpa.repository.support.JpaEntityInformation;
import org.springframework.data.jpa.repository.support.SimpleJpaRepository;
import org.springframework.lang.NonNull;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Base class for every Spring Data repository.
 *
 * Hibernate's @TenantId filters QUERIES, but loading by primary key (EntityManager.find,
 * merge) is not filtered: a GVS session could load, or overwrite, an SJM row whose id it
 * guessed. For school-scoped entities this class routes every by-id operation through a
 * query (which IS school-filtered) and refuses to merge into a row of another school.
 * Global entities (accounts, schools, memberships) keep the default behaviour.
 */
public class TenantSafeRepository<T, ID> extends SimpleJpaRepository<T, ID> {

    private final JpaEntityInformation<T, ?> info;
    private final EntityManager em;
    private final boolean scoped;

    public TenantSafeRepository(JpaEntityInformation<T, ?> info, EntityManager em) {
        super(info, em);
        this.info = info;
        this.em = em;
        this.scoped = TenantScopedEntity.class.isAssignableFrom(info.getJavaType());
    }

    private String byIdQuery(String op) {
        return "select e from " + info.getEntityName() + " e where e." + info.getRequiredIdAttribute().getName() + " " + op;
    }

    @Override
    @NonNull
    public Optional<T> findById(@NonNull ID id) {
        if (!scoped) return super.findById(id);
        List<T> rows = em.createQuery(byIdQuery("= :id"), info.getJavaType()).setParameter("id", id).getResultList();
        return rows.stream().findFirst();
    }

    @Override
    public boolean existsById(@NonNull ID id) {
        return scoped ? findById(id).isPresent() : super.existsById(id);
    }

    @Override
    @NonNull
    public List<T> findAllById(@NonNull Iterable<ID> ids) {
        if (!scoped) return super.findAllById(ids);
        List<ID> list = new ArrayList<>();
        ids.forEach(list::add);
        if (list.isEmpty()) return List.of();
        return em.createQuery(byIdQuery("in :ids"), info.getJavaType()).setParameter("ids", list).getResultList();
    }

    @Override
    @NonNull
    @SuppressWarnings("deprecation")
    public T getReferenceById(@NonNull ID id) {
        if (!scoped) return super.getReferenceById(id);
        return findById(id).orElseThrow(() -> new EntityNotFoundException("Not found in this school"));
    }

    @Override
    @NonNull
    @SuppressWarnings("deprecation")
    public T getById(@NonNull ID id) {
        return getReferenceById(id);
    }

    @Override
    @NonNull
    @SuppressWarnings("deprecation")
    public T getOne(@NonNull ID id) {
        return getReferenceById(id);
    }

    @Override
    @Transactional
    @NonNull
    public <S extends T> S save(@NonNull S entity) {
        if (!scoped) return super.save(entity);
        TenantContext.require();
        @SuppressWarnings("unchecked")
        ID id = (ID) info.getId(entity);
        if (id == null) {
            em.persist(entity);
            return entity;
        }
        if (em.contains(entity)) return entity; // already managed in this session (so already in this school)
        if (existsById(id)) return em.merge(entity);
        // Not in this school: insert as new. If the id belongs to another school the primary key
        // rejects it; we never merge into (overwrite) another school's row.
        em.persist(entity);
        return entity;
    }

    @Override
    @Transactional
    public void deleteById(@NonNull ID id) {
        if (!scoped) {
            super.deleteById(id);
            return;
        }
        findById(id).ifPresent(super::delete);
    }

    @Override
    @Transactional
    public void delete(@NonNull T entity) {
        if (scoped) {
            @SuppressWarnings("unchecked")
            ID id = (ID) info.getId(entity);
            if (id == null || !existsById(id)) return; // not in this school: nothing to delete
        }
        super.delete(entity);
    }
}
