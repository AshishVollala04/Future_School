package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.ChangeRequest;
import com.futureschool.backend.entity.MarkCorrection;
import com.futureschool.backend.governance.GovernanceService;
import com.futureschool.backend.repository.ChangeRequestRepository;
import com.futureschool.backend.repository.MarkCorrectionRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

/**
 * Development seed matching the frontend prototype: four Admin requests in different states
 * (two waiting for the Principal, one approved to execute, one draft) and one verified
 * correction waiting for the Principal. Call inside TenantContext.runAs(GVS) after the fee seed.
 */
@Component
public class GovernanceSeed {

    private final ChangeRequestRepository requests;
    private final MarkCorrectionRepository corrections;
    private final ObjectMapper json;

    public GovernanceSeed(ChangeRequestRepository requests, MarkCorrectionRepository corrections, ObjectMapper json) {
        this.requests = requests;
        this.corrections = corrections;
        this.json = json;
    }

    private String w(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String daysAgo(int d, String time) {
        return LocalDate.now().minusDays(d) + "T" + time + ":00+05:30";
    }

    private void cr(String id, String title, Map<String, Object> payload, String status, int daysAgo) {
        String hash = GovernanceService.hash(payload);
        List<Map<String, Object>> history = new ArrayList<>();
        if (!"DRAFT".equals(status)) history.add(Map.of("at", daysAgo(daysAgo, "11:00"), "by", "ACC-L-0002", "action", "SUBMITTED"));
        if ("APPROVED".equals(status)) history.add(Map.of("at", daysAgo(daysAgo - 1, "12:00"), "by", "ACC-L-0001", "action", "APPROVED"));
        requests.save(ChangeRequest.builder().id(id).kind(payload.get("kind").toString()).title(title).payloadJson(w(payload)).payloadHash(hash)
                .approvedHash("APPROVED".equals(status) ? hash : null).status(status).preparedBy("ACC-L-0002").preparedByName("S. Sundaram")
                .historyJson(w(history)).build());
    }

    public void seedGvs() {
        if (requests.count() > 0) return;
        Map<String, Object> concession = new LinkedHashMap<>();
        concession.put("kind", "FEE_CONCESSION");
        concession.put("studentId", "GVS-2028-0117");
        concession.put("chargeIds", List.of("GVS-2028-0117-SF-3", "GVS-2028-0117-SF-4"));
        concession.put("amountPerCharge", 2000);
        concession.put("concessionKind", "FINANCIAL_SUPPORT");
        concession.put("justification", "Father lost his job in August; application and documents verified by the office.");
        cr("CR-GVS-1", "Financial support concession: Kavya Reddy (9-A)", concession, "PENDING_APPROVAL", 2);

        Map<String, Object> refund = new LinkedHashMap<>();
        refund.put("kind", "REFUND");
        refund.put("paymentId", "PAY-GVS-1006");
        refund.put("amount", 1500);
        refund.put("reason", "Activity fee was also paid in cash at the office on the same day.");
        cr("CR-GVS-2", "Refund ₹1,500: activity fee paid twice (GVS/2026-27/1006)", refund, "PENDING_APPROVAL", 1);

        Map<String, Object> exam = new LinkedHashMap<>();
        exam.put("kind", "EXAM_SCHEDULE");
        exam.put("examId", "EX-GVS-SA1");
        exam.put("newStartsOn", "2026-11-25");
        exam.put("reason", "Local body election holiday on 23 Nov.");
        cr("CR-GVS-3", "Move SA-1 start to 25 Nov", exam, "APPROVED", 3);

        Map<String, Object> structure = new LinkedHashMap<>();
        structure.put("kind", "FEE_STRUCTURE");
        structure.put("grade", 9);
        structure.put("instalment", 4);
        structure.put("newSchoolFee", 11500);
        structure.put("reason", "Lab consumables cost increase.");
        cr("CR-GVS-4", "Class 9 fee: instalment 4 revision", structure, "DRAFT", 0);

        List<Map<String, Object>> log = List.of(
                Map.of("at", daysAgo(2, "15:00"), "by", "STF-T-0007", "action", "RAISED"),
                Map.of("at", daysAgo(1, "10:00"), "by", "STF-T-0001", "action", "VERIFIED", "note", "Checked the script. Correct."));
        corrections.save(MarkCorrection.builder().id("MC-GVS-1").resultId("RES-GVS-AARAV-FA1-v2").studentId("GVS-2027-0001").classId("GVS-10-A")
                .examName("FA-1").subject("Social Studies").field("internal").fromValue("16").toValue("17")
                .reason("Totalling error on page 2 of the answer script; one mark was not added.").raisedBy("STF-T-0007").status("VERIFIED")
                .logJson(w(log)).build());
    }
}
