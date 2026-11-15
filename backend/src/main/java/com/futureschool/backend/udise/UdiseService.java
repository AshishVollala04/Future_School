package com.futureschool.backend.udise;

import com.futureschool.backend.entity.School;
import com.futureschool.backend.entity.SchoolClass;
import com.futureschool.backend.entity.Student;
import com.futureschool.backend.entity.UserRole;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.SchoolClassRepository;
import com.futureschool.backend.repository.SchoolRepository;
import com.futureschool.backend.security.SchoolPrincipal;
import com.futureschool.backend.teaching.Teaching;
import com.futureschool.backend.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Function;

/**
 * UDISE+ student data validation and CSV export.
 * Checks required UDISE+ fields across active students in the signed-in school,
 * highlights rows with missing fields, and exports UTF-8 BOM CSV for Excel/UDISE+.
 */
@Service
public class UdiseService {

    private record FieldSpec(String key, String label, Function<Student, String> getter, String regex, String formatHint) {
        FieldSpec(String key, String label, Function<Student, String> getter) {
            this(key, label, getter, null, null);
        }
    }

    private static final List<FieldSpec> REQUIRED_FIELDS = List.of(
            new FieldSpec("admissionNumber", "Admission number", Student::getAdmissionNumber),
            new FieldSpec("name", "Student name", Student::getName),
            new FieldSpec("dob", "Date of birth", Student::getDob),
            new FieldSpec("gender", "Gender", Student::getGender),
            new FieldSpec("className", "Class", Student::getClassName),
            new FieldSpec("section", "Section", Student::getSection),
            new FieldSpec("aadhaarNumber", "Aadhaar number", s -> digits(s.getAadhaarNumber()), "^[0-9]{12}$", "Aadhaar number (12 digits)"),
            new FieldSpec("apaarId", "APAAR ID", Student::getApaarId),
            new FieldSpec("casteCategory", "Caste category", Student::getCasteCategory),
            new FieldSpec("religion", "Religion", Student::getReligion),
            new FieldSpec("motherTongue", "Mother tongue", Student::getMotherTongue),
            new FieldSpec("fatherName", "Father's name", Student::getFatherName),
            new FieldSpec("motherName", "Mother's name", Student::getMotherName),
            new FieldSpec("parentMobile", "Parent mobile", Student::getParentMobile),
            new FieldSpec("address", "Address", Student::getAddress),
            new FieldSpec("district", "District", Student::getDistrict),
            new FieldSpec("mandal", "Mandal", Student::getMandal),
            new FieldSpec("pincode", "PIN code", s -> digits(s.getPincode()), "^[0-9]{6}$", "PIN code (6 digits)"),
            new FieldSpec("mediumOfInstruction", "Medium of instruction", Student::getMediumOfInstruction)
    );

    private static final List<String> CSV_HEADERS = List.of(
            "Admission No", "Student Name", "Date of Birth", "Gender", "Class", "Section", "Roll No",
            "Medium of Instruction", "Second Language", "Aadhaar No", "APAAR ID", "Social Category",
            "Sub Caste", "Religion", "Mother Tongue", "Blood Group", "Father Name", "Father Mobile",
            "Father Occupation", "Mother Name", "Mother Mobile", "Mother Occupation",
            "Guardian Name", "Parent Mobile", "Address", "District", "Mandal", "Pincode",
            "Previous School", "TC Number", "Status", "Missing UDISE Fields"
    );

    private final Teaching t;
    private final SchoolClassRepository classes;
    private final SchoolRepository schools;

    public UdiseService(Teaching t, SchoolClassRepository classes, SchoolRepository schools) {
        this.t = t;
        this.classes = classes;
        this.schools = schools;
    }

    public record UdiseClassOption(String id, String label) {}

    public record UdiseIssueRow(
            String studentId,
            String admissionNumber,
            String name,
            String className,
            String section,
            List<String> missingFields
    ) {}

    public record UdiseValidationReport(
            String schoolId,
            String schoolName,
            int totalStudents,
            int readyCount,
            int incompleteCount,
            Map<String, Integer> missingByField,
            List<UdiseClassOption> classes,
            List<UdiseIssueRow> issues
    ) {}

    public record CsvExport(String filename, byte[] bytes, int rowCount, int skippedIncomplete) {}

    private static void requireAccess(SchoolPrincipal p) {
        if (p.role() != UserRole.PRINCIPAL) {
            GovernanceService.requirePermission(p, "REPORTS");
        }
    }

    private static String digits(String raw) {
        return raw == null ? null : raw.replaceAll("[\\s-]+", "");
    }

    private static boolean isBlank(String v) {
        return v == null || v.isBlank();
    }

    private static boolean isActive(Student s) {
        String st = s.getStatus();
        return st == null || st.isBlank() || "Active".equalsIgnoreCase(st) || "ACTIVE".equalsIgnoreCase(st);
    }

    static List<String> validateStudent(Student s) {
        List<String> missing = new ArrayList<>();
        for (FieldSpec spec : REQUIRED_FIELDS) {
            String val = spec.getter().apply(s);
            if (isBlank(val)) {
                missing.add(spec.label());
            } else if (spec.regex() != null && !val.trim().matches(spec.regex())) {
                missing.add(spec.formatHint());
            }
        }
        return missing;
    }

    private List<Student> loadFilteredStudents(String classId) {
        String filter = (classId == null || classId.isBlank() || "ALL".equalsIgnoreCase(classId)) ? null : classId.trim();
        return t.students().findAll().stream()
                .filter(UdiseService::isActive)
                .filter(s -> filter == null || filter.equals(s.getClassId()))
                .sorted(Comparator
                        .comparing((Student s) -> Objects.toString(s.getClassName(), ""))
                        .thenComparing(s -> Objects.toString(s.getSection(), ""))
                        .thenComparing(s -> Objects.toString(s.getRoll(), ""))
                        .thenComparing(s -> Objects.toString(s.getName(), "")))
                .toList();
    }

    @Transactional(readOnly = true)
    public UdiseValidationReport validate(SchoolPrincipal p, String classId) {
        requireAccess(p);
        String schoolId = TenantContext.require();
        String schoolName = schools.findById(schoolId).map(School::getName).orElse(schoolId);
        List<SchoolClass> classList = classes.findByActiveTrueOrderByGradeNumberAscSectionAsc();
        List<UdiseClassOption> classOptions = classList.stream()
                .map(c -> new UdiseClassOption(c.getId(), c.getName() + "-" + c.getSection()))
                .toList();

        List<Student> roster = loadFilteredStudents(classId);
        Map<String, Integer> fieldCounts = new LinkedHashMap<>();
        List<UdiseIssueRow> issues = new ArrayList<>();
        int ready = 0;

        for (Student s : roster) {
            List<String> missing = validateStudent(s);
            if (missing.isEmpty()) {
                ready++;
            } else {
                for (String label : missing) {
                    fieldCounts.merge(label, 1, Integer::sum);
                }
                issues.add(new UdiseIssueRow(
                        s.getId(),
                        s.getAdmissionNumber(),
                        s.getName(),
                        s.getClassName(),
                        s.getSection(),
                        missing
                ));
            }
        }

        return new UdiseValidationReport(
                schoolId,
                schoolName,
                roster.size(),
                ready,
                issues.size(),
                fieldCounts,
                classOptions,
                issues
        );
    }

    @Transactional
    public CsvExport exportCsv(SchoolPrincipal p, String classId, boolean onlyValid) {
        requireAccess(p);
        String schoolId = TenantContext.require();
        List<Student> roster = loadFilteredStudents(classId);

        StringBuilder sb = new StringBuilder();
        sb.append('\uFEFF'); // UTF-8 BOM for Excel
        appendRow(sb, CSV_HEADERS);

        int exported = 0;
        int skipped = 0;
        for (Student s : roster) {
            List<String> missing = validateStudent(s);
            if (onlyValid && !missing.isEmpty()) {
                skipped++;
                continue;
            }
            exported++;
            appendRow(sb, List.of(
                    nz(s.getAdmissionNumber()),
                    nz(s.getName()),
                    nz(s.getDob()),
                    nz(s.getGender()),
                    nz(s.getClassName()),
                    nz(s.getSection()),
                    s.getRoll() == null ? "" : String.valueOf(s.getRoll()),
                    nz(s.getMediumOfInstruction()),
                    nz(s.getSecondLanguage()),
                    nz(digits(s.getAadhaarNumber())),
                    nz(s.getApaarId()),
                    nz(s.getCasteCategory()),
                    nz(s.getSubCaste()),
                    nz(s.getReligion()),
                    nz(s.getMotherTongue()),
                    nz(s.getBloodGroup()),
                    nz(s.getFatherName()),
                    nz(s.getFatherMobile()),
                    nz(s.getFatherOccupation()),
                    nz(s.getMotherName()),
                    nz(s.getMotherMobile()),
                    nz(s.getMotherOccupation()),
                    nz(s.getParentName()),
                    nz(s.getParentMobile()),
                    nz(s.getAddress()),
                    nz(s.getDistrict()),
                    nz(s.getMandal()),
                    nz(s.getPincode()),
                    nz(s.getPreviousSchool()),
                    nz(s.getTcNumber()),
                    nz(s.getStatus()),
                    String.join("; ", missing)
            ));
        }

        String target = (classId == null || classId.isBlank() || "ALL".equalsIgnoreCase(classId)) ? "ALL_CLASSES" : classId.trim();
        t.record(p, "UDISE_EXPORT", target,
                "Exported " + exported + " UDISE+ student rows (skipped=" + skipped + ", onlyValid=" + onlyValid + ").",
                null);

        String filename = "udise-students-" + schoolId.toLowerCase(Locale.ROOT) + ".csv";
        return new CsvExport(filename, sb.toString().getBytes(StandardCharsets.UTF_8), exported, skipped);
    }

    private static String nz(String v) {
        return v == null ? "" : v.trim();
    }

    private static void appendRow(StringBuilder sb, List<String> cells) {
        for (int i = 0; i < cells.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(csvCell(cells.get(i)));
        }
        sb.append("\r\n");
    }

    /** RFC-4180 CSV escaping plus formula-injection guard for spreadsheet tools. */
    static String csvCell(String raw) {
        String s = raw == null ? "" : raw;
        if (!s.isEmpty()) {
            char first = s.charAt(0);
            if (first == '=' || first == '+' || first == '-' || first == '@' || first == '\t' || first == '\r') {
                s = "'" + s;
            }
        }
        boolean needsQuotes = s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r");
        if (!needsQuotes) return s;
        return "\"" + s.replace("\"", "\"\"") + "\"";
    }
}
