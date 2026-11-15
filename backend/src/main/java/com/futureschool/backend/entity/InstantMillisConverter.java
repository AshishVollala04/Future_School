package com.futureschool.backend.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.time.Instant;

/**
 * Stores security-relevant instants (OTP / ticket / session expiry) as epoch milliseconds.
 * Plain numbers cannot be shifted by a database or JVM time-zone setting.
 */
@Converter
public class InstantMillisConverter implements AttributeConverter<Instant, Long> {
    @Override
    public Long convertToDatabaseColumn(Instant v) {
        return v == null ? null : v.toEpochMilli();
    }

    @Override
    public Instant convertToEntityAttribute(Long v) {
        return v == null ? null : Instant.ofEpochMilli(v);
    }
}
