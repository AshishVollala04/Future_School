package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One bus trip (morning pickup or afternoon drop). Holds ONLY the latest position while the
 * trip is live; it is cleared when the trip ends. No location history is kept. School-scoped.
 */
@Entity
@Table(name = "bus_trips", indexes = {
    @Index(name = "idx_bus_trip_route_status", columnList = "route_id, status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusTrip extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "route_id", nullable = false, length = 64)
    private String routeId;

    /** PICKUP (to school) or DROP (to home). */
    @Column(name = "direction", nullable = false, length = 16)
    private String direction;

    /** LIVE or ENDED. */
    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "started_at", nullable = false)
    private long startedAt;

    @Column(name = "ended_at")
    private Long endedAt;

    @Column(name = "last_lat")
    private Double lastLat;

    @Column(name = "last_lng")
    private Double lastLng;

    @Column(name = "last_accuracy")
    private Double lastAccuracy;

    @Column(name = "last_at")
    private Long lastAt;
}
