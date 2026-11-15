package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** A school (tenant). Global table; not school-scoped. */
@Entity
@Table(name = "schools")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class School {

    /** Short code used as school_id everywhere, e.g. GVS. */
    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** Board profile key, e.g. TELANGANA_SSC. Rules come from the profile, never hardcoded. */
    @Column(name = "board", nullable = false, length = 64)
    @Builder.Default
    private String board = "TELANGANA_SSC";

    @Column(name = "status", nullable = false, length = 32)
    @Builder.Default
    private String status = "ACTIVE";

    /** Shown to parents on the fees screen. Late fees are never applied automatically. */
    @Column(name = "late_fee_policy", length = 300)
    private String lateFeePolicy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
