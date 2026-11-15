package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * A private link a bus driver opens to share the bus's location during a trip.
 * Only the SHA-256 of the token is stored. Looked up across schools (the driver is not signed in),
 * so this is not a school-filtered entity; it names its school explicitly.
 */
@Entity
@Table(name = "bus_tracker_links", indexes = {
    @Index(name = "uk_bus_link_token", columnList = "token_hash", unique = true)
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusTrackerLink {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "school_id", nullable = false, length = 64)
    private String schoolId;

    @Column(name = "route_id", nullable = false, length = 64)
    private String routeId;

    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Column(name = "created_by", nullable = false, length = 64)
    private String createdBy;

    @Column(name = "created_at", nullable = false, length = 40)
    private String createdAt;

    @Column(name = "revoked", nullable = false)
    private boolean revoked;
}
