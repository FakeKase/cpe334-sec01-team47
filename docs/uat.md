# User Acceptance Test (UAT) guide: Equipment borrowing system

**For:** testers (no technical knowledge needed)
**Product:** YeumPeunMa, the inventory and borrowing system for the CPE equipment room
**Scope of this round:** login, catalog, borrow requests, request review and cancelling (features F-01 to F-06)
**Version:** 0.1 (2026-11-24)

## 1. What you are testing

The system lets a **Borrower** (a student or staff member) ask to borrow equipment for some dates. A
**Custodian** (equipment-room staff) then approves or rejects the request. You will act as both, one after
the other.

Your job is to check that the system does what a real user expects, and to tell us when it does not. You
are not testing the code. If something confuses you, that counts as a finding too.

### In this round

| Area | What you can do |
|---|---|
| Log in and out | Both roles |
| Catalog | Browse equipment, filter by category, open an item |
| Borrow request | Borrower asks for one item for a date range, with a purpose |
| My requests | Borrower sees their own requests and their status |
| Review | Custodian approves a request, or rejects it with a reason |
| Cancel | Borrower cancels a pending or approved request |

### Not in this round (do not report as defects)

Handing items over (checkout), returning items, overdue tracking, adding or editing items and categories,
searching, loan history, dashboard, reports, e-mail notifications, self-registration and password reset.
These do not exist yet.

## 2. Before you start

### 2.1 What you need

| Item | Details |
|---|---|
| Address (URL) | `https://sa8227601-4d7hbszvwq-as.a.run.app` (confirm with the team that this is the one to test) |
| Browser | A current Chrome, Edge, Firefox or Safari. Note which one you use. |
| Accounts | Two Borrower accounts and one Custodian account. **Ask the team for the passwords. They are not in this document on purpose.** Do not share them outside the test group. |
| Time | About 60 to 90 minutes for all cases |

The accounts you will use:

| Name used below | Email |
|---|---|
| **Borrower 1** | `borrower1@example.test` |
| **Borrower 2** | `borrower2@example.test` |
| **Custodian** | `custodian@example.test` |

### 2.2 Write down the version you test

Open `<URL>/api/health` in a new tab. Copy what it shows (it contains the version of the system) into the
"Tester details" table in section 8. Without it we cannot tell which build your results belong to.

### 2.3 Equipment you can use

These items exist in the catalog. The asset tag is the code shown next to the name.

| Category | Items |
|---|---|
| Microcontrollers | Arduino Uno R3 (CPE-0001, CPE-0002), ESP32 DevKit (CPE-0003) |
| Single-board computers | Raspberry Pi 5 kit (CPE-0101), Raspberry Pi 4 kit (CPE-0102) |
| Measurement instruments | Rigol DS1054Z oscilloscope (CPE-0201), Fluke 117 multimeter (CPE-0202), Bench power supply (CPE-0203), Logic analyzer (CPE-0901, **under maintenance**) |
| Audio-visual | Epson portable projector (CPE-0301), Wireless microphone set (CPE-0302) |

There should be **11 items** in the catalog. One more item (an old oscilloscope, CPE-0999) is retired and
must **not** appear anywhere.

### 2.4 Rules to know first

- A loan lasts **at most 14 days**, counting both the first and the last day.
- The start date can be **today or later**, never in the past.
- A Borrower can hold at most **3 active requests** (pending or approved) at once.
- An item can be borrowed by only one person at a time. Two approved loans for the same item cannot
  overlap.
- A Custodian cannot borrow equipment, and a Borrower cannot review requests.

### 2.5 Tips for a clean test

- Several testers may use the same system. If an item already has a booking you did not make, use
  another item or other dates.
- Use **dates relative to today**, as written in the steps (for example "today + 5 days"). Write the real dates you
  used in the Notes column.
- Do the cases **in order** within a section. Some cases use what an earlier case created.
- Use a separate private (incognito) window per account, so two people can be logged in at once. Or log out
  between accounts.

## 3. How to record results

For each case, mark one result:

- **Pass:** you saw what "Expected result" says.
- **Fail:** you saw something different. Take a screenshot and write a defect (section 7).
- **Blocked:** you could not run the case (for example, an earlier case failed). Say why.

## 4. Test cases

### 4.1 Log in and log out

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-01 | Open the address. | You land on the **Log in** page (no catalog is visible). | | |
| UAT-02 | Try to open `<URL>/items` directly without logging in. | You are sent to the Log in page. | | |
| UAT-03 | Log in as **Borrower 1** with the correct password. | You land on the **Catalog**. The top bar shows your name and the role **Borrower**, and links to Catalog and My requests. There is no "Requests" link for reviewing. | | |
| UAT-04 | Press **Log out**. | You return to the Log in page. | | |
| UAT-05 | After logging out, press the browser Back button. Then try `<URL>/my-requests`. | You are not shown any requests. You are sent to the Log in page. | | |
| UAT-06 | Log in as the **Custodian**. | You land on the **Requests** page (the review queue). The top bar shows the role **Custodian**. | | |
| UAT-07 | Log out. Log in with a correct email and a **wrong password**. | Message "Invalid email or password." You stay on the Log in page. | | |
| UAT-08 | Log in with an email that does not exist, and any password. | The **same** message "Invalid email or password." (it must not say which part was wrong). | | |
| UAT-09 | Leave the password empty and press **Log in**. | A message asks you to enter your password. You are not logged in. | | |

### 4.2 Catalog (log in as Borrower 1)

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-10 | Open **Catalog**. | A loading message may flash, then a list of **11 items**. Each shows a name, asset tag, category and a status such as "Available today". CPE-0999 is **not** listed. | | |
| UAT-11 | Find the **Logic analyzer (CPE-0901)**. | It shows **Under maintenance**. | | |
| UAT-12 | Choose the category **Measurement instruments** in the filter. | Only items of that category are shown. | | |
| UAT-13 | Choose **All categories**. | All 11 items are shown again. | | |
| UAT-14 | Open the **Rigol DS1054Z oscilloscope**. | The item page shows the asset tag, category, location, description and a **Booked periods** list (or "No upcoming bookings."). A **Request this item** form is shown with start date, due date and purpose. | | |
| UAT-15 | Open the **Logic analyzer**. | The page says "This item is under maintenance and cannot be requested." The form is disabled, or the submit button cannot be used. | | |
| UAT-16 | Log in as the **Custodian** and open the same oscilloscope page. | The item details are shown, but there is **no request form**. | | |

### 4.3 Borrow request (log in as Borrower 1)

Use the **Fluke 117 multimeter (CPE-0202)** unless a step says otherwise.

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-20 | Open the item. Set the start date to **yesterday** (type it, or choose it) and press **Submit request**. | An error says the start date cannot be in the past. Nothing is created. | | |
| UAT-21 | Set start = today + 3 days, due = today + 1 day. Submit. | An error says the due date must be on or after the start date. | | |
| UAT-22 | Set start = today + 3 days, due = today + 20 days (more than 14 days). Submit. | An error says a loan can be at most 14 days. | | |
| UAT-23 | Set valid dates (start = today + 3 days, due = today + 5 days) and leave **Purpose** empty. Submit. | An error says the purpose is required. | | |
| UAT-24 | Fill Purpose with only spaces. Submit. | The same "purpose is required" error. | | |
| UAT-25 | Fill all fields correctly: start = today + 3 days, due = today + 5 days, purpose "UAT test". Submit. | You go to **My requests**. A message says "Request submitted. Waiting for approval." The new request is listed with the badge **Pending**. | | |
| UAT-26 | On My requests, reload the page (press F5). | The "Request submitted" message does **not** appear again. The request is still listed. | | |
| UAT-27 | Open the same item again and submit **the same dates** again. | An error says you already have a request for this item in that period. No second request is created. | | |
| UAT-28 | Open the **Logic analyzer** and try to submit a request (if the form allows it). | The request is refused: the item is under maintenance. Nothing is created. | | |

### 4.4 My requests (Borrower 1)

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-30 | Open **My requests**. | Your request from UAT-25 is shown with the item name, asset tag, the period, the status **Pending** and the date submitted. | | |
| UAT-31 | Log in as **Borrower 2** (a separate window) and open **My requests**. | Borrower 2 does **not** see Borrower 1's requests. If they have none, the page says so. | | |
| UAT-32 | As Borrower 1, keep making requests for **different** items with valid dates until you hold **3 active** requests. Then try a 4th. | The 4th is refused with a message that you can have at most 3 active requests. | | |

### 4.5 Review requests (Custodian)

Before this section, make sure Borrower 1 has at least **two Pending** requests for different items (for
example the multimeter from UAT-25 and the projector). Remember which is which.

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-40 | Log in as the **Custodian** and open **Requests**. | A list of pending requests, **oldest first**. Each shows the borrower name, item, period and purpose. | | |
| UAT-41 | Press **Approve** on one request. | The request leaves the pending list and a short message says "Request approved". | | |
| UAT-42 | Press **Reject** on another request. | A dialog asks for a **Reason**. The **Confirm** button stays disabled while the reason is empty or only spaces. | | |
| UAT-43 | Type "Exam week, item needed in the lab" and press **Confirm**. | The dialog closes, the request leaves the pending list and a message says "Request rejected". | | |
| UAT-44 | As Borrower 1, open **My requests**. | The approved request shows **Approved**. The rejected one shows **Rejected** and the line "Reason: Exam week, item needed in the lab". | | |
| UAT-45 | Try this with two requests for the **same item and overlapping dates** (use Borrower 1 and Borrower 2): approve the first, then try to approve the second. | The second approval is refused with a message that the item is already booked for part of that period. The second request stays Pending, and you can reject it. | | |

### 4.6 Cancel a request (Borrower 1)

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-50 | On My requests, look at the buttons on each request. | A **Cancel** button appears only on **Pending** and **Approved** requests. Rejected and Cancelled requests have none. On a wide screen the button is at the end of the row. | | |
| UAT-51 | Press **Cancel** on a Pending request, then press **Keep request**. | The dialog closes. The request is unchanged (still Pending). | | |
| UAT-52 | Press **Cancel** on a Pending request, then **Cancel request**. | The button briefly says "Cancelling…". The dialog closes, the row shows **Cancelled** with no Cancel button, and a message says "Request cancelled". | | |
| UAT-53 | Press **Cancel** on an **Approved** request and confirm. | The row shows **Cancelled**. | | |
| UAT-54 | As Borrower 2, request the item and dates of the request you cancelled in UAT-53. Then, as the Custodian, approve it. | The request is accepted and can be approved. The cancelled booking no longer blocks the item. | | |
| UAT-55 | As Borrower 1, cancel two different requests one after the other, quickly (within about 3 seconds). | Each time the message "Request cancelled" appears, and the second message stays visible for about 4 seconds on its own. | | |
| UAT-56 | As Borrower 1, open **My requests** in **two** windows. In one window the Custodian **rejects** that request. In the other window, still showing it as Pending, press Cancel and confirm. | A message on that row says only pending or approved requests can be cancelled, and the list refreshes to show **Rejected**. The system does not break. | | |
| UAT-57 | As the **Custodian**, look at the Requests page. | There is **no Cancel button** for requests. | | |

### 4.7 Who can do what

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-60 | As **Borrower 1**, type `<URL>/requests` in the address bar. | A page says "You are not allowed to do this" (or you are sent away). No requests of other people are shown. | | |
| UAT-61 | As the **Custodian**, open **My requests** by typing `<URL>/my-requests`. | You are not allowed to use it (message or redirect). No request form is shown anywhere for the Custodian. | | |
| UAT-62 | Type `<URL>/nothing-here` while logged in. | A friendly "Not found" page. | | |

### 4.8 Looks and comfort

Run these on the **Catalog**, an **item page**, **My requests** and the Custodian **Requests** page.

| ID | Steps | Expected result | Result | Notes |
|---|---|---|---|---|
| UAT-70 | Narrow the browser window to a phone width (about 360 px), or open the system on a phone. | Everything is readable. There is **no sideways scrolling**. The Cancel button sits on its own line under the request on a narrow screen. | | |
| UAT-71 | Use only the keyboard (Tab, Shift+Tab, Enter, Esc). Log in, request an item, open and close the Cancel dialog. | You can reach and use every button and field. You can always see where the cursor is. **Esc** closes a dialog. | | |
| UAT-72 | Switch the theme (the light/dark toggle in the top bar), if shown. | Text stays readable in both. The date fields are still usable (the calendar icon is visible). | | |
| UAT-73 | Try to cause a problem: press a submit button twice quickly. | Only one request is created. | | |
| UAT-74 | General impression. | Names, buttons and messages are clear. Note anything you did not understand. | | |

## 5. One full story (do this last)

This repeats the main journey from start to end. Use new dates so earlier test data does not get in the way.

1. **Borrower 1** logs in and requests the **Epson projector** (CPE-0301) from today + 10 days to today + 12 days.
2. The request shows as **Pending** on My requests.
3. The **Custodian** logs in, sees it in the queue and **approves** it.
4. **Borrower 1** sees **Approved**. **Borrower 2** opens the projector page and sees the booked period (without
   the borrower's name). Then Borrower 2 tries to request overlapping dates, and the system refuses.
5. **Borrower 1** cancels the request.
6. **Borrower 2** requests the same dates again. This time it is accepted.
7. Everyone logs out.

Result: Pass / Fail. Notes:

## 6. When to stop

Stop and tell the team straight away (do not carry on) if you see:

- another person's data that you should not see (for example a request from another Borrower),
- a password, a technical error page, or a long block of code on screen,
- the system is not reachable at all.

## 7. How to report a problem

Create one entry per problem. Copy the table, one per defect.

| Field | Your entry |
|---|---|
| Defect ID | UAT-D01, UAT-D02, … |
| Test case | e.g. UAT-27 |
| Title | One short sentence |
| Account used | Borrower 1, Borrower 2 or Custodian |
| Steps to repeat | Numbered list, as exact as you can |
| What you expected | |
| What happened | |
| Screenshot or screen recording | Attach it |
| Browser and device | e.g. Chrome on Windows, iPhone 14 Safari |
| Time it happened | Date and clock time |
| Severity | See below |

**Severity**

| Level | Meaning | Example |
|---|---|---|
| Critical | The system is unusable or shows data to the wrong person | A Borrower sees someone else's requests |
| High | A main task cannot be done, and there is no workaround | Approving does nothing |
| Medium | A task works but in a wrong or confusing way | Wrong message, or the wrong status shown |
| Low | A cosmetic or wording problem | Text cut off, a typo |

## 8. Sign-off

### Tester details

| | |
|---|---|
| Tester name | |
| Date of the test | |
| System address tested | |
| What `/api/health` showed (version) | |
| Browser and device | |

### Summary

| Result | Count |
|---|---|
| Pass | |
| Fail | |
| Blocked | |

| Question | Answer (Yes / No / Comment) |
|---|---|
| Could you complete the main journey (section 5)? | |
| Are there any Critical or High defects open? | |
| Would you accept the system for these features? | |

Tester signature or name: ______________________    Date: ____________
