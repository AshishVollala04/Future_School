package com.futureschool.backend.entity;

/**
 * Something that has a 4-digit sign-in PIN (BCrypt hash only) with a wrong-try counter.
 * Teachers: the school membership (a teacher teaches in one school).
 * Parents: the account (a parent can have children in several schools).
 */
public interface PinHolder {
    String getId();

    String getPinHash();

    int getPinFailedAttempts();

    void setPinFailedAttempts(int n);
}
