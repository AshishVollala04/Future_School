package com.futureschool.backend.entity;

import jakarta.persistence.*;
import lombok.*;

/** A school bus route with seat capacity and stops. School-scoped. */
@Entity
@Table(name = "bus_routes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BusRoute extends TenantScopedEntity {

    @Id
    @Column(name = "id", length = 96)
    private String id;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Column(name = "vehicle_no", nullable = false, length = 32)
    private String vehicleNo;

    @Column(name = "capacity", nullable = false)
    private Integer capacity;

    @Column(name = "stops_json", nullable = false, length = 4000)
    private String stopsJson;

    @Column(name = "fee_per_instalment", nullable = false)
    private Long feePerInstalment;
}
