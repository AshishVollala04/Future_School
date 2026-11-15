package com.futureschool.backend.tenant;

/**
 * The school the current request is acting for.
 *
 * Set ONLY from a verified access token (see JwtAuthenticationFilter) or explicitly by
 * trusted server code (seeding, scheduled jobs). Never from a request header, query
 * parameter or body. Cleared at the end of every request.
 */
public final class TenantContext {

    /** Sentinel used when no school is in context: matches no rows, and inserts are refused. */
    public static final String NONE = "__no_school__";

    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static void set(String schoolId) {
        if (schoolId == null || schoolId.isBlank() || NONE.equals(schoolId)) {
            throw new IllegalArgumentException("A real school id is required");
        }
        CURRENT.set(schoolId);
    }

    public static String get() {
        return CURRENT.get();
    }

    /** The current school, or an exception if none is set. Use before any write. */
    public static String require() {
        String id = CURRENT.get();
        if (id == null) {
            throw new IllegalStateException("No school in context; refusing to read or write school data");
        }
        return id;
    }

    public static void clear() {
        CURRENT.remove();
    }

    /** Run a block as a given school (seeding, jobs, tests), restoring the previous value after. */
    public static <T> T callAs(String schoolId, java.util.function.Supplier<T> body) {
        String previous = CURRENT.get();
        set(schoolId);
        try {
            return body.get();
        } finally {
            if (previous == null) CURRENT.remove();
            else CURRENT.set(previous);
        }
    }

    public static void runAs(String schoolId, Runnable body) {
        callAs(schoolId, () -> {
            body.run();
            return null;
        });
    }
}
