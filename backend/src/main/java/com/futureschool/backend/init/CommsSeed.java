package com.futureschool.backend.init;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.futureschool.backend.entity.*;
import com.futureschool.backend.parent.ParentDataService;
import com.futureschool.backend.repository.*;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

/** Development seed: the prototype's notices, consent, meeting, message thread and homework. Idempotent. */
@Component
public class CommsSeed {

    private final ClassNoticeRepository notices;
    private final HomeworkTaskRepository homework;
    private final ConsentFormRepository consents;
    private final MessageThreadRepository threads;
    private final ParentMeetingRepository meetings;
    private final ObjectMapper json;

    public CommsSeed(ClassNoticeRepository notices, HomeworkTaskRepository homework, ConsentFormRepository consents, MessageThreadRepository threads,
                     ParentMeetingRepository meetings, ObjectMapper json) {
        this.notices = notices;
        this.homework = homework;
        this.consents = consents;
        this.threads = threads;
        this.meetings = meetings;
        this.json = json;
    }

    private static String day(int n) {
        return LocalDate.now(ParentDataService.SCHOOL_ZONE).plusDays(n).toString();
    }

    private String w(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void hw(String id, String classId, String subject, String staffId, String teacher, String title, String instructions, int assigned, int due,
                    String type, Map<String, String> status) {
        homework.save(HomeworkTask.builder().id(id).classId(classId).subject(subject).teacherStaffId(staffId).teacherName(teacher).title(title)
                .instructions(instructions).assignedOn(day(assigned)).dueOn(day(due)).submissionType(type).statusJson(w(status)).build());
    }

    public void seedGvs() {
        if (notices.count() > 0) return;
        String now = OffsetDateTime.now(ParentDataService.SCHOOL_ZONE).toString();
        notices.save(ClassNotice.builder().id("NT-GVS-1").audienceCsv("ALL").priority("EMERGENCY").publishedAt(now).publishedBy("ACC-L-0001")
                .title("Heavy rain alert: early dismissal today")
                .body("School will close at 12:30 PM today due to a heavy rain warning. Buses leave at 12:45 PM. Please arrange pickup.").build());
        notices.save(ClassNotice.builder().id("NT-GVS-2").audienceCsv("ALL").priority("IMPORTANT").publishedAt(day(-2) + "T09:00:00+05:30").publishedBy("ACC-L-0001")
                .title("SA-1 timetable published").body("Summative Assessment 1 begins on 23 Nov. Hall tickets are issued by class teachers after fee clearance.").build());
        notices.save(ClassNotice.builder().id("NT-GVS-3").audienceCsv("GVS-6-B").priority("NORMAL").publishedAt(day(-3) + "T15:00:00+05:30").publishedBy("STF-T-0008")
                .title("Class 6-B: science exhibition").body("Students may bring models on Friday.").build());

        consents.save(ConsentForm.builder().id("CN-GVS-1").classIdsCsv("GVS-10-A,GVS-10-B").dueOn(day(5)).title("Science museum visit (Birla Science Centre)")
                .details("Day trip by school bus, 9:00 AM to 3:30 PM. Lunch provided. No additional fee.").build());

        meetings.save(ParentMeeting.builder().id("MT-GVS-1").studentId("GVS-2027-0001").teacherName("Sarah Jenkins").purpose("SA-1 preparation")
                .at(day(1) + "T10:30:00+05:30").status("CONFIRMED").build());

        List<Map<String, Object>> msgs = List.of(
                Map.of("from", "PARENT", "author", "Rajesh Sharma", "body", "Aarav will be 30 minutes late on Monday due to a hospital appointment.", "at", day(-3) + "T08:10:00+05:30"),
                Map.of("from", "TEACHER", "author", "Sarah Jenkins", "body", "Noted, thank you. Please send the leave note through the app.", "at", day(-3) + "T09:02:00+05:30"));
        threads.save(MessageThread.builder().id("TH-GVS-1").studentId("GVS-2027-0001").teacherStaffId("STF-T-0001").teacherName("Sarah Jenkins")
                .teacherRole("Class Teacher").category("ATTENDANCE").subject("Late arrival on Monday").messagesJson(w(msgs)).lastAt(day(-3) + "T09:02:00+05:30").build());

        hw("HW-GVS-1", "GVS-10-A", "Mathematics", "STF-T-0002", "Raghavan Nair", "Exercise 5.2: Arithmetic progressions",
                "Solve questions 1-12 in the homework notebook. Show all steps.", -4, -1, "NOTEBOOK",
                Map.of("GVS-2027-0001", "PENDING", "GVS-2027-0002", "SUBMITTED", "GVS-2027-0003", "CHECKED"));
        hw("HW-GVS-2", "GVS-10-A", "Physical Science", "STF-T-0001", "Sarah Jenkins", "Chemical reactions: balance 10 equations",
                "Worksheet given in class. Submit to the class teacher.", -1, 2, "WORKSHEET", Map.of());
        hw("HW-GVS-3", "GVS-10-A", "English", "STF-T-0005", "P. Ramesh", "Letter writing: request to the Principal", "150-200 words.", -6, -3, "NOTEBOOK",
                Map.of("GVS-2027-0001", "CHECKED"));
        hw("HW-GVS-4", "GVS-6-B", "Science", "STF-T-0006", "M. Farhana", "Draw and label a plant cell", "Use the science notebook.", -2, 1, "NOTEBOOK", Map.of());
        hw("HW-GVS-5", "GVS-9-A", "Social Studies", "STF-T-0009", "R. Kiran", "Map work: rivers of Telangana", "Outline map provided.", -5, -2, "WORKSHEET",
                Map.of("GVS-2028-0117", "SUBMITTED"));
    }

    public void seedSjm() {
        if (notices.count() > 0) return;
        notices.save(ClassNotice.builder().id("NT-SJM-1").audienceCsv("ALL").priority("NORMAL").publishedAt(day(-1) + "T10:00:00+05:30").publishedBy("ACC-L-0004")
                .title("Children’s Day celebrations").body("Students may come in colour dress on 14 Nov.").build());
        hw("HW-SJM-1", "SJM-4-B", "EVS", "STF-T-0103", "D. Prakash", "Collect five different leaves", "Paste them in the scrapbook and name them.", -1, 3, "NOTEBOOK", Map.of());
    }
}
