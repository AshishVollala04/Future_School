package com.futureschool.backend.comms;

import com.futureschool.backend.auth.AuthFlowException;
import com.futureschool.backend.security.AccessPolicy;
import com.futureschool.backend.security.SchoolPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Notices, messages, consent, meetings and homework. Relationship checks are in CommsService. */
@RestController
@Tag(name = "Communication", description = "Notices, parent-teacher messages, consent, meetings, homework")
public class CommsController {

    private final CommsService comms;

    public CommsController(CommsService comms) {
        this.comms = comms;
    }

    private ResponseEntity<?> run(Authentication auth, Function<SchoolPrincipal, Object> body) {
        try {
            return ResponseEntity.ok(body.apply(AccessPolicy.principal(auth)));
        } catch (AuthFlowException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("success", false);
            err.put("error", e.getMessage());
            err.put("code", e.getCode());
            return ResponseEntity.status(e.getStatus()).body(err);
        }
    }

    private static String s(Map<String, Object> b, String k) {
        Object v = b == null ? null : b.get(k);
        return v == null ? null : v.toString();
    }

    // ---- parent (session child)
    @GetMapping("/api/parent/notices")
    public ResponseEntity<?> parentNotices(Authentication a) {
        return run(a, comms::noticesFor);
    }

    @GetMapping("/api/parent/messages/recipients")
    @Operation(summary = "Only the child's Class Teacher and Subject Teachers (no directory)")
    public ResponseEntity<?> recipients(Authentication a) {
        return run(a, comms::recipients);
    }

    @GetMapping("/api/parent/messages")
    public ResponseEntity<?> parentThreads(Authentication a) {
        return run(a, comms::parentThreads);
    }

    @PostMapping("/api/parent/messages")
    public ResponseEntity<?> start(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.startThread(p, s(b, "staffId"), s(b, "category"), s(b, "subject"), s(b, "body")));
    }

    @PostMapping("/api/parent/messages/{id}/reply")
    public ResponseEntity<?> parentReply(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.reply(p, id, s(b, "body")));
    }

    @GetMapping("/api/parent/consents")
    public ResponseEntity<?> consents(Authentication a) {
        return run(a, comms::consentsFor);
    }

    @PostMapping("/api/parent/consents/{id}")
    @Operation(summary = "Respond once (GIVEN / DECLINED). Final and attributable; staff cannot change it")
    public ResponseEntity<?> respond(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.respondConsent(p, id, s(b, "decision")));
    }

    @GetMapping("/api/parent/meetings")
    public ResponseEntity<?> meetings(Authentication a) {
        return run(a, comms::meetingsFor);
    }

    @GetMapping("/api/parent/homework")
    public ResponseEntity<?> parentHomework(Authentication a) {
        return run(a, comms::homeworkForChild);
    }

    // ---- staff
    @GetMapping("/api/staff/notices")
    public ResponseEntity<?> staffNotices(Authentication a) {
        return run(a, comms::noticesFor);
    }

    @PostMapping("/api/staff/notices")
    @Operation(summary = "Principal/Admin: any audience; Class Teacher: own class only; emergency = leadership only")
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> publish(Authentication a, @RequestBody Map<String, Object> b) {
        List<String> audience = b.get("audience") instanceof List<?> l ? (List<String>) l : List.of("ALL");
        return run(a, p -> comms.publishNotice(p, audience, s(b, "title"), s(b, "body"), s(b, "priority")));
    }

    @GetMapping("/api/staff/messages")
    @Operation(summary = "Teacher: conversations addressed to me")
    public ResponseEntity<?> inbox(Authentication a) {
        return run(a, comms::teacherThreads);
    }

    @PostMapping("/api/staff/messages/{id}/reply")
    public ResponseEntity<?> teacherReply(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.reply(p, id, s(b, "body")));
    }

    @GetMapping("/api/staff/homework")
    public ResponseEntity<?> myHomework(Authentication a) {
        return run(a, comms::myHomework);
    }

    @PostMapping("/api/staff/homework")
    @Operation(summary = "Subject Teacher posts homework for a class + subject they teach")
    public ResponseEntity<?> post(Authentication a, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.postHomework(p, s(b, "classSectionId"), s(b, "subject"), s(b, "title"), s(b, "instructions"), s(b, "dueOn"), s(b, "submissionType")));
    }

    @PostMapping("/api/staff/homework/{id}/status")
    public ResponseEntity<?> status(Authentication a, @PathVariable String id, @RequestBody Map<String, Object> b) {
        return run(a, p -> comms.setHomeworkStatus(p, id, s(b, "studentId"), s(b, "status")));
    }
}
