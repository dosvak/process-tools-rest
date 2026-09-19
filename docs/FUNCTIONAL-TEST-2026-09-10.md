# Process Tools REST (PTREST) 1.1 - functional test, lab Process Center 8.6.2, 2026-09-10

Package `Process-Tools-REST-1.1.twx` (adds the Bulk Move Tokens tab and two-stage operation flows), branch
2063.f551f221-e5d7-5f7a-804d-575e8d562f32, dashboard 1.adbfa8c6-3424-532b-935c-067ac97e4596, user celladmin. Deployed with
`pc_app_delete2.py 'Process Tools REST (PTREST)' --do` + `pc_import.py Process-Tools-REST-1.1.twx`.

## Summary

| Check | Result |
|---|---|
| Smoke sweep `tools/dash_test.py` (11 tabs, first button of each, status line, JS errors, failed HTTP calls) | all tabs answer (Bulk Move Tokens: "Error: enter the process application acronym" without input); JS errors 0; failed HTTP 0; 20 REST calls |
| Deep functional test `tools/pc_ptrest_test.py` | **checks 79 failed: 0, JS errors: 0, service calls: 1 failed: 0** |
| Direct service runs (`/service/{id}?action=start`, callerModelId = dashboard) | PT App Processes: BAWJSON -> 4 processes (tip), GUITS / test-a -> 0 processes of that snapshot, GUITS / nope -> "Error: no snapshot nope in GUITS (installed: 1.0, 1.1, test-a, ...)"; PT Bulk Token Position over 2 real + 1 unknown instance -> common active token 'Test Task' (1 of 2), 7 merged steps, "not read: 2072.999999: CWTBG0059E ..." |
| Web Process Designer (`tools/pc_ptrest_webpd_check.py`) | PT App Processes, PT Bulk Move Tokens (Start -> Get CSRF Token -> Build requests -> Requests left? -> Call REST -> Collect response -> Second stage? -> Build stage 2 requests / Map response -> End) and PT Bulk Token Position open; validation counter 0; no page / console errors, no failed WebPD requests |
| Script syntax (143 generated scripts + pt-helpers.js, Node `--check`) | 0 errors |

Test data: fresh instances of the BAW JSON Test app (2 x Test Task Process with an open task, 1 x Test Timer Process with a 4 h timer,
label `PTREST test <epoch>`) plus 2 x Test Task Process for the bulk move (label `PTREST bulk <epoch>`); the bulk move sends their
tokens from 'Test Task' to 'End' and the REST header shows both instances STATE_FINISHED.

## Bulk Move Tokens, step by step

| Result | Check | Detail |
|---|---|---|
| OK | Search instances without a process -> Error | Error: pick a process first (Load processes, then a row of the Processes table) |
| OK | Load processes lists the process definitions of the application | Info: 4 process(es) of BAWJSON - BAW JSON Test (snapshot (tip)) - select one, then Search instances / ['Test Failing Process 25.71bf0185-4d59-53aa-99c8-fd06fab5eb84 (tip) BAWJSON', 'Test Straight Process 25.b0b796bf-3b11 |
| OK | unknown acronym -> Error message | Error: no process application with the acronym NOSUCHAPP CloseOK |
| OK | unknown snapshot -> Error with the installed snapshots | Error: no snapshot v999 in BAWJSON (installed: 1.0) CloseOK |
| OK | picking a process fills the Process input | Info: process 'Test Task Process' picked - click Search instances / Model=Test Task Process |
| OK | Search instances (app + process + running) finds the bulk instances | Info: 4 instance(s) / 4 rows |
| OK | Move before the analysis -> Error | Error: select the current token location and the target step (Analyze tokens first) |
| OK | Analyze tokens: common active token, locations, steps, tokens per instance | Info: 4 instance(s) analysed, 1 token location(s); common active token: 'Test Task' (4 of 4 instance(s)) - select the current location and the target step, then / ['Test Task activity 4 4 4 of 4 a26e538c-5559-5c5d-9fd4-7 |
| OK | Move tokens (selected) asks for confirmation naming source, target and count | Move the token at 'Test Task' to step 'End' for 2 selected instance(s)? CancelConfirm |
| OK | confirmation Cancel path |  |
| OK | Move confirmed -> Success (2 tokens moved) and both instances completed (REST) | Success: 2 token(s) moved from 'Test Task' to 'End' in 2 instance(s) CloseOK / ['STATE_FINISHED', 'STATE_FINISHED'] |
| OK | the analysis reloads after the move | Info: 4 instance(s) analysed, 1 token location(s); common active token: 'Test Task' (2 of 4 instance(s)) - select the current location and the target step, then |
| OK | Move tokens (all) needs the location and step (or confirms for all) | Error: select the current token location and the target step (Analyze tokens first) |
| OK | Export CSV of the tokens per instance | "Instance","Name","Token","Step","Flow object","Detail"
"2072.1373","","4","Test |

## All tabs, check by check

### setup

| Result | Check | Detail |
|---|---|---|
| OK | fresh test instances started (2 task, 1 timer) | ['1569', '1570', '1571'] |
| OK | fresh instances for the bulk move started (2 task) | ['1572', '1573'] |

### Instances

| Result | Check | Detail |
|---|---|---|
| OK | Lookup with model + term filter finds the fresh instances | Info: 2 instance(s) |
| OK | sortable headers + Export CSV |  |
| OK | Details opens the editor with JSON | Instance 2072.1569 - [running] Details (JSON) CloseOK |
| OK | Show errors opens the editor | Runtime errors of 1 instance(s) Details (JSON) CloseOK |
| OK | Suspend (classic bulk) -> Success | Success: suspend requested for 1 instance(s) |
| OK | Resume -> Success | Success: resume requested for 1 instance(s) |
| OK | Terminate asks for confirmation | Terminate 1 selected instance(s)? CancelConfirm |
| OK | confirmation Cancel path |  |
| OK | Delete asks for confirmation | Delete 1 selected instance(s) (Process REST v2)? CancelConfirm |
| OK | Delete force asks for confirmation |  |
| OK | Resume snapshot asks for confirmation | Resume all suspended instances of BAWJSON / 26e42d6e-8f19-4644-be13-863070b71103 (Operations REST)? CancelConfirm |
| OK | Export CSV dialog with CSV text | "Instance","Name","Process","App","Snapshot","Track","State","Created","Modified","Due"
"2072.1569", |
| OK | Terminate confirmed -> Success and the instance is terminated (REST) | Success: terminate requested for 1 instance(s) / 2072.1569 STATE_TERMINATED |

### Instance Data

| Result | Check | Detail |
|---|---|---|
| OK | row selection loads the variables | Info: instance 2072.1570: 2 variable(s) - Edit variables opens the editor |
| OK | editor with the {name: value} JSON | {
  "payload": "Process Tools REST deep test",
  "label": "PTREST test 1789080684"
} |
| OK | Update variables -> not an error and REST shows the new value (the list reloads after the update) | Info: instance 2072.1570: 2 variable(s) - Edit variables opens the editor / payload=set by Process Tools REST 1789080849 |
| OK | Export CSV of the variables |  |

### Tokens

| Result | Check | Detail |
|---|---|---|
| OK | position: tokens / tasks and steps | Info: instance 2072.1570: 2 token(s) / task(s), 3 step(s) / ['token 4 Test Task flow object a26e538c-5559-5c5d-9fd4-78f1a5a56bf1, task(s) 5418', 'task 2078.5418 Step: Test Task ready 2026-09-10 23:51: |
| OK | Instance details editor |  |
| OK | Move token asks for confirmation (or rejects a task row) | Move token 4 (Test Task) of instance 2072.1570 to step 'Test Task'? CancelConfirm |
| OK | Delete token asks for confirmation (or rejects a task row) | Delete token 4 (Test Task) of instance 2072.1570? The instance resumes without it. CancelConfirm |

### Bulk Move Tokens

| Result | Check | Detail |
|---|---|---|
| OK | Search instances without a process -> Error | Error: pick a process first (Load processes, then a row of the Processes table) |
| OK | Load processes lists the process definitions of the application | Info: 4 process(es) of BAWJSON - BAW JSON Test (snapshot (tip)) - select one, then Search instances / ['Test Failing Process 25.71bf0185-4d59-53aa-99c8-fd06fab5eb84 (tip) BAWJSON', 'Test Straight Proc |
| OK | unknown acronym -> Error message | Error: no process application with the acronym NOSUCHAPP CloseOK |
| OK | unknown snapshot -> Error with the installed snapshots | Error: no snapshot v999 in BAWJSON (installed: 1.0) CloseOK |
| OK | picking a process fills the Process input | Info: process 'Test Task Process' picked - click Search instances / Model=Test Task Process |
| OK | Search instances (app + process + running) finds the bulk instances | Info: 4 instance(s) / 4 rows |
| OK | Move before the analysis -> Error | Error: select the current token location and the target step (Analyze tokens first) |
| OK | Analyze tokens: common active token, locations, steps, tokens per instance | Info: 4 instance(s) analysed, 1 token location(s); common active token: 'Test Task' (4 of 4 instance(s)) - select the current location and the target step, then / ['Test Task activity 4 4 4 of 4 a26e5 |
| OK | Move tokens (selected) asks for confirmation naming source, target and count | Move the token at 'Test Task' to step 'End' for 2 selected instance(s)? CancelConfirm |
| OK | confirmation Cancel path |  |
| OK | Move confirmed -> Success (2 tokens moved) and both instances completed (REST) | Success: 2 token(s) moved from 'Test Task' to 'End' in 2 instance(s) CloseOK / ['STATE_FINISHED', 'STATE_FINISHED'] |
| OK | the analysis reloads after the move | Info: 4 instance(s) analysed, 1 token location(s); common active token: 'Test Task' (2 of 4 instance(s)) - select the current location and the target step, then |
| OK | Move tokens (all) needs the location and step (or confirms for all) | Error: select the current token location and the target step (Analyze tokens first) |
| OK | Export CSV of the tokens per instance | "Instance","Name","Token","Step","Flow object","Detail"
"2072.1373","","4","Test |

### Timers

| Result | Check | Detail |
|---|---|---|
| OK | timers of the instance (event manager tasks + timer tokens) | Info: instance 2072.1571: 1 event manager task(s), 0 timer token(s) / ["18383 scheduled BPD Queue 1970-01-01 00:00:02 Notify process instance 1571 to run the 'Wait 4 hours' timer 1571;0"] / tokens 0 |
| OK | timer Details editor | Info: event manager task 18383 |
| OK | Fire now asks for confirmation |  |
| OK | Delete asks for confirmation |  |

### Tasks

| Result | Check | Detail |
|---|---|---|
| OK | Lookup ready / claimed tasks of the model | ['2078.2299 Step: Test Task Test Task Process Test Task Process: test 2026-09-06T02:43 #4 ready All Users 30 2026-09-06 03:43:54'] |
| OK | Details editor |  |
| OK | Claim -> Success | Success: 1 of 1 task(s) claimed |
| OK | Assign to user opens the picker with users | 2 users |
| OK | picker filter (classic users API) | ['celladmin celladmin'] |
| OK | Assign to user -> Success | Success: 1 of 1 task(s) assigned |
| OK | Set priority picker with the priority list | ['Highest 10', 'High 20'] |
| OK | Set priority High -> Success and REST priority 20 | Success: 1 of 1 task(s) updated / priority=20 |
| OK | Set due date picker |  |
| OK | Set due date -> Success or a clear error | Error: choose a date and time |
| OK | Assign to group picker with groups | 10 groups |
| OK | Assign back -> Success or refused by the server | Success: 1 of 1 task(s) assigned |
| OK | Cancel task asks for confirmation |  |
| OK | Delete completed asks for confirmation |  |
| OK | Fail opens the editor with the error JSON | {"code": "OPS-001", "data": "failed from Process Tools REST"} |
| OK | Complete opens the editor with {} |  |
| OK | Complete Apply -> Success and the task is closed (REST) | Success: task 2078.2299 completed / 2078.2299 Closed |
| OK | Export CSV of tasks |  |

### Task Data

| Result | Check | Detail |
|---|---|---|
| OK | row selection loads the task variables | Info: task 2078.2300: 0 variable(s) - Edit task data opens the editor |
| OK | editor with the task data JSON | {} |
| OK | Set task data -> reload after the update, or a clear server error | Info: task 2078.2300: 0 variable(s) - Edit task data opens the editor |

### Event Manager Tasks

| Result | Check | Detail |
|---|---|---|
| OK | Lookup event manager tasks | Info: 8 event manager task(s) |
| OK | Details editor |  |
| OK | Delete selected asks for confirmation |  |
| OK | Delete all asks for confirmation |  |
| OK | Delete UCA tasks without inputs -> Error | Error: container, snapshot, undercover agent name and scheduled-after date are required |
| OK | Delete UCA tasks with inputs asks for confirmation | Delete the event manager tasks of UCA uca (DVBM / v1) scheduled after Tue Dec 31 2019 19:00:00 GMT-0 |
| OK | Replay selected -> Success or a clear server error | Success: replay requested for 1 task(s) |

### Instance Cleanup

| Result | Check | Detail |
|---|---|---|
| OK | Lookup finished instances older than 0 days | Info: 485 instance(s) older than the given number of days |
| OK | Delete selected asks for confirmation |  |
| OK | Delete force asks for confirmation |  |
| OK | Export CSV |  |

### Send Event Message

| Result | Check | Detail |
|---|---|---|
| OK | Send without a message -> Error | Error: enter the event message |
| OK | Insert template fills the XML | <eventmsg>   <event processApp="ACRONYM" ucaname="UCA NAME"> |
| OK | Send asks for confirmation |  |
| OK | Send confirmed -> server answer in the status line | Success: event message sent |

### Execute JavaScript

| Result | Check | Detail |
|---|---|---|
| OK | row selection opens the script editor | // example: tw.local.someVariable = 1; |
| OK | Execute -> server answer (disabled on this server = clear error) | Error: CWTBG0529E:Authorization Error, Javascript Expression execution is disabled. |
