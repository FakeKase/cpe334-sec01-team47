# User Acceptance Test (UAT) guide: Equipment borrowing system

**For:** the UAT team (testers), no technical knowledge needed
**Product team:** team `sa8227601`, the YeumPeunMa inventory and borrowing system for the CPE equipment room
**Scope:** Sprint 1, features F-01 to F-05 (login, catalog, borrow requests, request review)
**Guide version:** 0.2 (2026-11-25)

## 1. What you are testing

The system lets a **Borrower** (a student or staff member) ask to borrow equipment for some dates. A
**Custodian** (equipment-room staff) then approves or rejects the request. You act as both, one after the
other.

Your job is to check that the system does what a real user expects, and to tell us when it does not. You
are not testing the code. If something confuses you, that counts as a finding too.

### In scope (Sprint 1)

| Area | What you can do | Requirements |
|---|---|---|
| Log in and out | Both roles | FR-01, FR-02, FR-03, NFR-01 |
| Catalog | Browse equipment, filter by category, open an item | FR-04, FR-05 |
| Borrow request | A Borrower asks for one item for a date range, with a purpose | FR-06, BR-01 to BR-05 |
| My requests | A Borrower sees their own requests, their status and any rejection reason | FR-07, BR-14 |
| Review | A Custodian approves a request, or rejects it with a reason | FR-08 to FR-10, BR-02, BR-03, BR-07 |
| Roles and ownership | Who may do what, and who may see whose requests | BR-13, BR-14, NFR-02 |

### Not in scope (do not report as defects)

Cancelling a request, handing items over (checkout), returning items, overdue tracking, adding or editing
items and categories, searching, loan history, the dashboard, reports, e-mail notifications, self-registration
and password reset. These are Sprint 2 and 3 features. They are not in the release under test, and they are not
part of this acceptance.

## 2. Handoff: what you need before you start

### 2.1 The release under test

| | |
|---|---|
| Release | **v0.1.1** (Git tag `v0.1.1`) |
| Commit | **`95b88cf`** on `main` |
| Deployed | 22 Nov 2026 by the "Deploy demo" run `45011041483` (it passed its smoke check) |
| Address (URL) | `https://sa8227601-4d7hbszvwq-as.a.run.app` |
| Accepted for test | Sprint 1 scope in section 1, and nothing else |

**The application does not show its version.** `/api/health` only says `{"status":"ok"}`. Copy the release and
commit above into your results as the tested version. If we redeploy, we will tell you before we do it and give
you the new commit.

### 2.2 Accounts

We give the passwords to you privately. They are not in this document and must not be copied into your report.

| Label | Role | Email |
|---|---|---|
| **B1** (Borrower 1) | Borrower | `borrower1@example.test` |
| **B2** (Borrower 2) | Borrower | `borrower2@example.test` |
| **C** (Custodian) | Custodian | `custodian@example.test` |

Use a separate private (incognito) window for each account, so two people can be logged in at once. Or log out
between accounts.

### 2.3 Equipment you can use

The asset tag is the code shown next to the name. All data is synthetic.

| Category | Items |
|---|---|
| Microcontrollers | Arduino Uno R3 (CPE-0001, CPE-0002), ESP32 DevKit (CPE-0003) |
| Single-board computers | Raspberry Pi 5 kit (CPE-0101), Raspberry Pi 4 kit (CPE-0102) |
| Measurement instruments | Rigol DS1054Z oscilloscope (CPE-0201), Fluke 117 multimeter (CPE-0202), Bench power supply (CPE-0203), Logic analyzer (CPE-0901, **under maintenance**) |
| Audio-visual | Epson portable projector (CPE-0301), Wireless microphone set (CPE-0302) |

There should be **11 items** in the catalog. One more item (an old oscilloscope, CPE-0999) is retired and must
**not** appear anywhere.

### 2.4 Rules to know first

- A loan lasts **at most 14 days**, counting both the first and the last day.
- The start date can be **today or later**, never in the past.
- A Borrower can hold at most **3 active requests** (pending or approved) at once.
- An item can be borrowed by only one person at a time. Two approved loans for the same item cannot overlap.
- A Custodian cannot borrow equipment, and a Borrower cannot review requests.

### 2.5 Order of the cases, and dates

**Order.** Sections 4.1, 4.2, 4.6 and 4.7 do not depend on anything and can be run in any order. Sections 4.3,
4.4 and 4.5 **must be run in that order**, because later cases use the requests made earlier. Section 5 (the full
story) is last.

**Dates.** Call the day you start **D**. Write the real date of D in your results, and use it for every date in
the guide: "D+3" means three days after D. Keep using the same D even if you continue on another day.

### 2.6 Test data, and what cannot be undone

This system has **no reset tool**, and a user cannot delete a request. The data lives in a database that is kept
between runs and redeployments. Please follow this plan, so that the permanent part stays small:

| What | Can it be undone? |
|---|---|
| A **pending** request | **Yes.** A Custodian rejects it with the reason "UAT cleanup". This frees the item and the Borrower's slot. |
| An **approved** request | **No** (Sprint 1 has no cancel). The item stays booked for those dates and the Borrower keeps that slot. |
| A rejected request | It stays in the history. This is normal. |

Only **three** approvals are permanent in this guide. Please do not approve anything else.

| Case | Account | Item | Dates | Result left behind |
|---|---|---|---|---|
| UAT-25, UAT-41 | B1 | CPE-0202 | D+3 to D+5 | **Approved, permanent** |
| UAT-45 | B2 | CPE-0302 | D+10 to D+12 | **Approved, permanent** |
| Section 5 | B2 | CPE-0301 | D+20 to D+22 | **Approved, permanent** |

Everything else must end **rejected** (cleanup in UAT-99). Please use "UAT test" or a similar harmless text in
the Purpose field.

**If you get stuck** (a Borrower is at the 3-request limit, or an item you need is already booked), do not work
around it. Mark the case **BLOCKED**, write why, and tell the product team. After the acceptance decision, the
product team asks the course TA to clear the database, because that is the only way to reset it fully.

### 2.7 The four kinds of case

| Kind | Cases |
|---|---|
| Normal journey | UAT-03, UAT-25, UAT-40, UAT-41, UAT-44, section 5 |
| Business rule or boundary | UAT-20 to UAT-24, UAT-27, UAT-32, UAT-45 |
| Forbidden role or ownership | UAT-16, UAT-31, UAT-60, UAT-61 |
| State, history or persistence | UAT-05, UAT-26, UAT-35, UAT-44 |

## 3. How to record results

For each case, write the **actual** result in your own words (do not copy the expected result), and mark one outcome:

- **PASS:** you saw what "Expected result" says.
- **FAIL:** you saw something different. Take a screenshot and write a defect (section 7).
- **BLOCKED:** you could not run the case. Say why. A blocked case is not a pass.

For every case, also note the tester name, the date and time, and the tested version (section 2.1). For a
refused action, check that nothing changed afterwards (for example that the request list is the same).

## 4. Test cases

Accounts: **B1**, **B2** are Borrowers and **C** is the Custodian. "Ref" is the requirement and the
acceptance criterion (AC) from the Sprint 1 contracts that the case checks.

### 4.1 Log in and log out

Precondition for all: nobody is logged in.

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-01 | none | NFR-01, F-01 §1 | Open the address. | You land on the **Log in** page (no catalog is visible). | |
| UAT-02 | none | NFR-01, AC-06 | Try to open `<URL>/items` directly without logging in. | You are sent to the Log in page. | |
| UAT-03 | B1 | FR-01, AC-01, AC-09 | Log in as **B1** with the correct password. | You land on the **Catalog**. The top bar shows your name, the role **Borrower**, and links to Catalog and My requests. There is no "Requests" link for reviewing. | |
| UAT-04 | B1 | FR-02, AC-05, AC-09 | Press **Log out**. | You return to the Log in page. | |
| UAT-05 | B1 | FR-02, AC-05, AC-06 | After logging out, press the browser Back button. Then try `<URL>/my-requests`. | You are not shown any requests. You are sent to the Log in page. | |
| UAT-06 | C | FR-01, AC-01 | Log in as **C**. | You land on the **Requests** page (the review queue). The top bar shows the role **Custodian**. | |
| UAT-07 | B1 | FR-01, AC-02, AC-09 | Log out. Log in with a correct email and a **wrong password**. | Message "Invalid email or password." You stay on the Log in page. | |
| UAT-08 | none | AC-02 | Log in with an email that does not exist, and any password. | The **same** message "Invalid email or password." (it must not say which part was wrong). | |
| UAT-09 | none | AC-03 | Leave the password empty and press **Log in**. | A message asks you to enter your password. You are not logged in. | |

### 4.2 Catalog

Precondition: log in as **B1** (UAT-16 uses **C**).

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-10 | B1 | FR-04, AC-10, AC-14 | Open **Catalog**. | A loading message may flash, then a list of **11 items**. Each shows a name, asset tag, category and a status such as "Available today". CPE-0999 is **not** listed. | |
| UAT-11 | B1 | FR-04, AC-10, AC-14 | Find the **Logic analyzer (CPE-0901)**. | It shows **Under maintenance**. | |
| UAT-12 | B1 | FR-04, AC-11 | Choose the category **Measurement instruments** in the filter. | Only items of that category are shown. | |
| UAT-13 | B1 | FR-04, AC-11 | Choose **All categories**. | All 11 items are shown again. | |
| UAT-14 | B1 | FR-05, AC-12 | Open the **Rigol DS1054Z oscilloscope**. | The item page shows the asset tag, category, location, description and a **Booked periods** list (or "No upcoming bookings."). A **Request this item** form is shown with start date, due date and purpose. | |
| UAT-15 | B1 | BR-02, AC-14, AC-18 | Open the **Logic analyzer**. | The page says "This item is under maintenance and cannot be requested." The request cannot be submitted. | |
| UAT-16 | C | BR-13, AC-22 | Log in as **C** and open the same oscilloscope page. | The item details are shown, but there is **no request form**. | |

### 4.3 Borrow request

Precondition: log in as **B1**. Use the **Fluke 117 multimeter (CPE-0202)** unless a step says otherwise.
Cases UAT-20 to UAT-24 and UAT-28 store nothing. Do them before UAT-25.

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-20 | B1 | BR-01, AC-16 | Open the item. Set the start date to **yesterday** and press **Submit request**. | An error says the start date cannot be in the past. Nothing is created. | |
| UAT-21 | B1 | BR-01, AC-16, AC-23 | Set start = D+3, due = D+1. Submit. | An error says the due date must be on or after the start date. | |
| UAT-22 | B1 | BR-01, AC-16 | Set start = D+3, due = D+20 (more than 14 days). Submit. | An error says a loan can be at most 14 days. | |
| UAT-23 | B1 | FR-06, AC-17 | Set start = D+3, due = D+5 and leave **Purpose** empty. Submit. | An error says the purpose is required. | |
| UAT-24 | B1 | FR-06, AC-17 | Fill Purpose with only spaces. Submit. | The same "purpose is required" error. | |
| UAT-28 | B1 | BR-02, AC-18 | Open the **Logic analyzer** and try to submit a request (if the form allows it). | The request is refused: the item is under maintenance. Nothing is created. | |
| UAT-25 | B1 | FR-06, AC-15 | Fill all fields correctly: start = D+3, due = D+5, purpose "UAT test". Submit. | You go to **My requests**. A message says "Request submitted. Waiting for approval." The new request is listed with the badge **Pending**. | |
| UAT-26 | B1 | FR-07, F-04 §6 | On My requests, reload the page (press F5). | The "Request submitted" message does **not** appear again. The request is still listed. | |
| UAT-27 | B1 | BR-04, AC-20 | Open the same item again and submit **the same dates** again. | An error says you already have a request for this item in that period. No second request is created. | |

### 4.4 My requests

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-30 | B1 | FR-07, AC-24 | Open **My requests**. | Your request from UAT-25 is shown with the item name, asset tag, the period, the status **Pending** and the date submitted. | |
| UAT-31 | B2 | BR-14, AC-24, AC-25 | Log in as **B2** (a separate window) and open **My requests**. | B2 does **not** see B1's requests. If B2 has none, the page says so. | |
| UAT-32 | B1 | BR-05, AC-21 | As B1, request **CPE-0203** and **CPE-0101**, each for D+3 to D+5. You now hold 3 active requests. Then try a 4th, for **CPE-0001**, D+3 to D+5. | The first two are accepted. The 4th is refused with a message that you can have at most 3 active requests. | |
| UAT-35 | B1 | NFR-07, AC-24 | Log out and log in as **B1** again. Open **My requests**. | The same three requests are listed with the same status (the data was kept). | |

### 4.5 Review requests

Precondition: B1 has the three pending requests from UAT-25 and UAT-32 (CPE-0202, CPE-0203, CPE-0101).

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-40 | C | FR-08, AC-27 | Log in as **C** and open **Requests**. | A list of pending requests, **oldest first**. Each shows the borrower name, item, period and purpose. | |
| UAT-41 | C | FR-09, AC-28 | Press **Approve** on the **CPE-0202** request (UAT-25). This one is permanent. | The request leaves the pending list and a short message says "Request approved". | |
| UAT-42 | C | FR-10, BR-07, AC-35 | Press **Reject** on the **CPE-0203** request. | A dialog asks for a **Reason**. The **Confirm** button stays disabled while the reason is empty or only spaces. | |
| UAT-43 | C | FR-10, BR-07, AC-31 | Type "Exam week, item needed in the lab" and press **Confirm**. | The dialog closes, the request leaves the pending list and a message says "Request rejected". | |
| UAT-44 | B1 | FR-07, AC-26, AC-28 | As B1, open **My requests**. | The CPE-0202 request shows **Approved**. The CPE-0203 request shows **Rejected** and the line "Reason: Exam week, item needed in the lab". CPE-0101 is still **Pending**. | |
| UAT-45 | B2, B1, C | BR-03, AC-29 | (1) As **B2**, request **CPE-0302** for D+10 to D+12. (2) As **B1**, request **CPE-0302** for D+11 to D+13. (3) As **C**, approve **B2's** request (permanent). (4) As **C**, try to approve **B1's** request. | Step 4 is refused with a message that the item is already booked for part of that period. B1's request stays **Pending**. Then reject it (reason "UAT cleanup"). | |

### 4.6 Who can do what

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-60 | B1 | BR-13, AC-33, AC-35 | As **B1**, type `<URL>/requests` in the address bar. | A page says "You are not allowed to do this" (or you are sent away). No requests of other people are shown. | |
| UAT-61 | C | BR-13, AC-22 | As **C**, type `<URL>/my-requests` in the address bar. | You are not allowed to use it (message or redirect). No request form is shown anywhere for the Custodian. | |
| UAT-62 | B1 | SDS C3.2 (404 page) | Type `<URL>/nothing-here` while logged in. | A friendly "Not found" page. | |

### 4.7 Looks and comfort

Run these on the **Catalog**, an **item page**, **My requests** and the Custodian **Requests** page.

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-70 | B1, C | NFR-12 | Narrow the browser window to a phone width (about 360 px), or open the system on a phone. | Everything is readable. There is **no sideways scrolling**. | |
| UAT-71 | C | NFR-13 | Use only the keyboard (Tab, Shift+Tab, Enter, Esc). As **C**, open the Reject dialog on a pending request (run this after UAT-32, so one exists), move through it, and close it with **Esc**. | You can reach and use every button and field. You can always see where the cursor is. **Esc** closes the dialog and the request is **not** rejected. | |
| UAT-72 | B1 | NFR-13 | Switch the theme (the light/dark toggle in the top bar), if shown. | Text stays readable in both. The date fields are still usable (the calendar icon is visible). | |
| UAT-73 | B2 | FR-06, AC-15 | As **B2**, request **CPE-0001** for D+30 to D+31 and press **Submit request** twice quickly. | Only one request is created. | |
| UAT-74 | any | usability | General impression. | Names, buttons and messages are clear. Note anything you did not understand. | |

## 5. One full story (do this last)

This repeats the main journey from start to end. It uses new dates, so earlier test data does not get in the way.

1. **B2** logs in and requests the **Epson projector** (CPE-0301) from D+20 to D+22.
2. The request shows as **Pending** on My requests.
3. **C** logs in, sees it in the queue and **approves** it (permanent).
4. **B2** sees **Approved**. **B1** opens the projector page and sees the booked period **without the borrower's
   name**. B1 then tries to request overlapping dates, and the system refuses.
5. Everyone logs out.

Result: PASS / FAIL / BLOCKED. Actual outcome:

## 6. Cleanup (do this at the very end)

| ID | Role | Ref | Steps | Expected result | Result and actual outcome |
|---|---|---|---|---|---|
| UAT-99 | C | FR-10 | As **C**, open **Requests**, tab **Pending**. For every request you created that is still there (for example CPE-0101 for B1 and CPE-0001 for B2), reject it with the reason "UAT cleanup". | No pending request from this test is left. Only the three approvals in section 2.6 remain. | |

## 7. When to stop, and how to report a problem

Stop and tell the team straight away (do not carry on) if you see:

- another person's data that you should not see (for example a request from another Borrower),
- a password, a technical error page, or a long block of code on screen,
- the system is not reachable at all.

Create one entry per problem. Copy the table, one per defect.

| Field | Your entry |
|---|---|
| Issue ID | UAT-D01, UAT-D02, … |
| Product team | `sa8227601` |
| Reporter and date/time | |
| Tested version | Release v0.1.1, commit `95b88cf` |
| Linked case and requirement | e.g. UAT-27, BR-04 |
| Account used | B1, B2 or C |
| Preconditions and data | Items and dates you used |
| Steps to repeat | Numbered list, as exact as you can |
| What you expected | |
| What happened | |
| Screenshot or screen recording | Attach it |
| Browser and device | e.g. Chrome on Windows, iPhone 14 Safari |
| Severity | See below |

**Defect or new feature?** A defect is behavior that is different from what this guide or the Sprint 1 contract
says. A request for something new (for example "add a cancel button") is an enhancement, and you should label it
that way.

**Severity** (by what it does to a user)

| Level | Meaning | Blocks acceptance? | Example |
|---|---|---|---|
| Critical | The system is unusable, or shows data to the wrong person | Yes | A Borrower sees someone else's requests |
| Major | A main task cannot be done and there is no workaround | Yes | Approving does nothing |
| Minor | A task works but in a wrong or confusing way, or it is cosmetic | No, if the product team fixes it or you accept it as a known limitation | Wrong message, text cut off, a typo |

## 8. Sign-off

### Tester details

| | |
|---|---|
| Tester names and team | |
| Date and time of the test | |
| D (the day you started) | |
| Release and commit tested | Release v0.1.1, commit `95b88cf` (confirm that this is what the team told you) |
| Address tested | |
| Browser and device | |

### Summary

| Result | Count |
|---|---|
| PASS | |
| FAIL | |
| BLOCKED | |

| Question | Answer |
|---|---|
| Could you complete the main journey (section 5)? | |
| Are there any open Critical or Major defects? | |
| Minor limitations you accept (list them) | |

**Decision for this release (choose one):** Accepted / Accepted with the minor limitations listed above / Not
Accepted. Reason:

Only the UAT team can record this decision. Never mark it Accepted while a Critical or Major defect is open or a
required case is BLOCKED.

Tester signature or name: ______________________    Date: ____________
