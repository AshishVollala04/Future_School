package com.futureschool.backend.udise;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/** UDISE+ student validation report and CSV download (Admin REPORTS / Principal). */
@RestController
@Tag(name = "UDISE+ export", description = "Student data readiness checks and UDISE+ CSV export")
public class UdiseController {

    private final UdiseService udise;

    public UdiseController(UdiseService udise) {
        this.udise = udise;
    }

    private ResponseEntity<?> run(Authentication auth, Function<SchoolPrincipal, ResponseEntity<?>> fn) {
        try {
            return fn.apply(AccessPolicy.principal(auth));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }

    @GetMapping("/api/admin/udise/validation")
    @Operation(summary = "Validate active students against required UDISE+ fields")
    public ResponseEntity<?> validation(
            Authentication auth,
            @RequestParam(name = "classId", required = false) String classId
    ) {
        return run(auth, p -> ResponseEntity.ok(udise.validate(p, classId)));
    }

    @GetMapping("/api/admin/udise/export.csv")
    @Operation(summary = "Download active students as a UDISE+ CSV (UTF-8 BOM)")
    public ResponseEntity<?> exportCsv(
            Authentication auth,
            @RequestParam(name = "classId", required = false) String classId,
            @RequestParam(name = "onlyValid", defaultValue = "false") boolean onlyValid
    ) {
        return run(auth, p -> {
            UdiseService.CsvExport csv = udise.exportCsv(p, classId, onlyValid);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + csv.filename() + "\"")
                    .header("X-Udise-Row-Count", String.valueOf(csv.rowCount()))
                    .header("X-Udise-Skipped-Count", String.valueOf(csv.skippedIncomplete()))
                    .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                    .body(csv.bytes());
        });
    }
}
