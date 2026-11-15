package com.futureschool.backend.school;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;

/** School profile, live dashboards, bulk student onboarding, and academic class setup. */
@RestController
@Tag(name = "School operations", description = "Live school profile, overview metrics, work queue, and onboarding tools")
public class SchoolController {

    private final SchoolOperationsService ops;

    public SchoolController(SchoolOperationsService ops) {
        this.ops = ops;
    }

    private ResponseEntity<?> run(Authentication auth, Function<SchoolPrincipal, Object> fn) {
        try {
            return ResponseEntity.ok(fn.apply(AccessPolicy.principal(auth)));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }

    @GetMapping("/api/schools/current")
    @Operation(summary = "Active school profile for the current session")
    public ResponseEntity<?> currentProfile(Authentication auth) {
        return run(auth, p -> ops.currentProfile());
    }

    @PutMapping("/api/schools/current")
    @Operation(summary = "Update school profile or late fee policy")
    public ResponseEntity<?> updateProfile(Authentication auth, @RequestBody Map<String, Object> body) {
        return run(auth, p -> ops.updateProfile(p, body));
    }

    @GetMapping("/api/staff/overview")
    @Operation(summary = "Live DB-computed Principal and Admin school overview")
    public ResponseEntity<?> overview(Authentication auth) {
        return run(auth, ops::staffOverview);
    }

    @GetMapping("/api/office/work-queue")
    @Operation(summary = "Live Admin work queue counts filtered by permission")
    public ResponseEntity<?> workQueue(Authentication auth) {
        return run(auth, ops::adminWorkQueue);
    }

    @PostMapping("/api/admin/students/import")
    @Operation(summary = "Bulk import students, classes, parent accounts, and Term 1-4 fees from CSV (ADMISSIONS)")
    public ResponseEntity<?> importCsv(Authentication auth, @RequestBody Map<String, Object> body) {
        String csv = body.get("csv") instanceof String s ? s : "";
        long annualFee = body.get("defaultAnnualFee") instanceof Number n ? n.longValue() : 0L;
        return run(auth, p -> ops.importStudentsCsv(p, csv, annualFee));
    }

    @GetMapping("/api/admin/students/import-template")
    @Operation(summary = "Downloadable CSV column header and sample row for student onboarding")
    public ResponseEntity<?> importTemplate() {
        String headers = "Admission No,Student Name,Date of Birth,Gender,Class,Section,Roll No,Parent Name,Parent Mobile,Parent Email,Aadhaar No,APAAR ID,Social Category,Religion,Mother Tongue,Medium of Instruction,Address,District,Mandal,Pincode,Annual Fee";
        String sample = "ADM-2026-101,Aarav Sharma,2012-05-14,Male,10,A,01,Rajesh Sharma,9876543210,rajesh@example.com,123456789012,APAAR12345678,General,Hindu,Telugu,English,Plot 12 Kompally,Medchal-Malkajgiri,Quthbullapur,500014,48000";
        return ResponseEntity.ok(Map.of("headers", headers, "sampleCsv", headers + "\n" + sample));
    }

    @GetMapping("/api/admin/academics/setup")
    @Operation(summary = "Active classes with subject-teacher mappings and teacher directory")
    public ResponseEntity<?> academicsSetup(Authentication auth) {
        return run(auth, ops::academicsSetup);
    }

    @PostMapping("/api/admin/academics/subject-teachers")
    @Operation(summary = "Assign a teacher to a subject for a class (ACADEMIC_OPS)")
    public ResponseEntity<?> assignSubjectTeacher(Authentication auth, @RequestBody Map<String, String> body) {
        return run(auth, p -> ops.assignSubjectTeacher(p, body.get("classId"), body.get("subject"), body.get("staffId")));
    }
}
