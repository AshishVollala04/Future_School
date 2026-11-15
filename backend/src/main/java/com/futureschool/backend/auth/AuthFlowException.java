package com.futureschool.backend.auth;

/** A sign-in step failed. The message is safe to show to the person signing in. */
public class AuthFlowException extends RuntimeException {

    private final String code;
    private final Integer attemptsRemaining;
    private final int status;

    public AuthFlowException(String code, String message) {
        this(code, message, null, 401);
    }

    public AuthFlowException(String code, String message, Integer attemptsRemaining, int status) {
        super(message);
        this.code = code;
        this.attemptsRemaining = attemptsRemaining;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public Integer getAttemptsRemaining() {
        return attemptsRemaining;
    }

    public int getStatus() {
        return status;
    }
}
