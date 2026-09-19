# Process Tools REST (PTREST) - functional test, lab Process Center 8.6.2, 2026-09-06

Package `Process-Tools-REST-1.0.twx` (restructured build: RestCallParams / ReturnValue Map REST caller, loop flows, server file
pt-helpers.js), branch 2063.f551f221-e5d7-5f7a-804d-575e8d562f32, dashboard 1.adbfa8c6-3424-532b-935c-067ac97e4596, user celladmin.

## Summary

| Check | Result |
|---|---|
| Smoke sweep `tools/dash_test.py` (10 tabs, Lookup on each, status line, JS errors, failed HTTP calls) | all tabs answer; JS errors 0; failed HTTP 0; 19 service calls |
| Deep functional test `tools/pc_ptrest_test.py` | **checks 64 failed: 0, JS errors: 0, service calls: 1 failed: 0** |
| Direct service runs (`/service/{id}?action=start`, callerModelId = dashboard) | PT Get CSRF Token -> token + Cookie; PT Call REST -> statusCode 200 + body; PT Search Instances -> 2 rows; PT Claim Tasks -> per-id refusal text of the server |
| Web Process Designer | validation counter 0 before and after opening PT Claim Tasks; diagram Start -> Get CSRF Token -> Build requests -> Requests left? -> Call REST -> Collect response -> (loop) / Map response -> End |
| Script syntax (132 generated scripts + pt-helpers.js, Chromium `new Function`) | 0 errors |

Test data: fresh instances of the BAW JSON Test app (2 x Test Task Process with an open task, 1 x Test Timer Process with a 4 h timer),
label `PTREST test <epoch>`; REST verification through the classic API after terminate, set variables, set priority and complete.

## Deep test, check by check

### setup

| Result | Check | Detail |
|---|---|---|
| OK | fresh test instances started (2 task, 1 timer) | ['1375', '1376', '1377'] |

### Instances

| Result | Check | Detail |
|---|---|---|
| OK | Lookup with model + term filter finds the fresh instances | Info: 2 instance(s) |
| OK | sortable headers + Export CSV |  |
| OK | Details opens the editor with JSON | Instance 2072.1375 - [running] Details (JSON) CloseOK |
| OK | Show errors opens the editor | Runtime errors of 1 instance(s) Details (JSON) CloseOK |
| OK | Suspend (classic bulk) -> Success | Success: suspend requested for 1 instance(s) |
| OK | Resume -> Success | Success: resume requested for 1 instance(s) |
| OK | Terminate asks for confirmation | Terminate 1 selected instance(s)? CancelConfirm |
| OK | confirmation Cancel path |  |
| OK | Delete asks for confirmation | Delete 1 selected instance(s) (Process REST v2)? CancelConfirm |
| OK | Delete force asks for confirmation |  |
| OK | Resume snapshot asks for confirmation | Resume all suspended instances of BAWJSON / 26e42d6e-8f19-4644-be13-863070b71103 (Operations REST)? CancelConfirm |
| OK | Export CSV dialog with CSV text | "Instance","Name","Process","App","Snapshot","Track","State","Created","Modified","Due" |
| OK | Terminate confirmed -> Success and the instance is terminated (REST) | Success: terminate requested for 1 instance(s) \| 2072.1375 STATE_TERMINATED |

### Instance Data

| Result | Check | Detail |
|---|---|---|
| OK | row selection loads the variables | Info: instance 2072.1376: 2 variable(s) - Edit variables opens the editor |
| OK | editor with the {name: value} JSON | { |
| OK | Update variables -> not an error and REST shows the new value (the list reloads after the update) | Info: instance 2072.1376: 2 variable(s) - Edit variables opens the editor \| payload=set by Process Tools REST 1788724876 |
| OK | Export CSV of the variables |  |

### Tokens

| Result | Check | Detail |
|---|---|---|
| OK | position: tokens / tasks and steps | Info: instance 2072.1376: 2 token(s) / task(s), 3 step(s) \| ['token 4 Test Task flow object a26e538c-5559-5c5d-9fd4-78f1a5a56bf1, task(s) 2885', 'task 2078.2885 |
| OK | Instance details editor |  |
| OK | Move token asks for confirmation (or rejects a task row) | Move token 4 (Test Task) of instance 2072.1376 to step 'Test Task'? CancelConfirm |
| OK | Delete token asks for confirmation (or rejects a task row) | Delete token 4 (Test Task) of instance 2072.1376? The instance resumes without it. CancelConfirm |

### Timers

| Result | Check | Detail |
|---|---|---|
| OK | timers of the instance (event manager tasks + timer tokens) | Info: instance 2072.1377: 1 event manager task(s), 0 timer token(s) \| ["9505 scheduled BPD Queue 1970-01-01 00:00:02 Notify process instance 1377 to run the 'Wa |
| OK | timer Details editor | Info: event manager task 9505 |
| OK | Fire now asks for confirmation |  |
| OK | Delete asks for confirmation |  |

### Tasks

| Result | Check | Detail |
|---|---|---|
| OK | Lookup ready / claimed tasks of the model | ['2078.2297 Step: Test Task Test Task Process Test Task Process: test 2026-09-06T02:43 #5 ready All Users 30 2026-09-06 03:43:54'] |
| OK | Details editor |  |
| OK | Claim -> Success | Success: 1 of 1 task(s) claimed |
| OK | Assign to user opens the picker with users | 2 users |
| OK | picker filter (classic users API) | ['celladmin celladmin'] |
| OK | Assign to user -> Success | Success: 1 of 1 task(s) assigned |
| OK | Set priority picker with the priority list | ['Highest 10', 'High 20'] |
| OK | Set priority High -> Success and REST priority 20 | Success: 1 of 1 task(s) updated \| priority=20 |
| OK | Set due date picker |  |
| OK | Set due date -> Success or a clear error | Error: choose a date and time |
| OK | Assign to group picker with groups | 10 groups |
| OK | Assign back -> Success or refused by the server | Success: 1 of 1 task(s) assigned |
| OK | Cancel task asks for confirmation |  |
| OK | Delete completed asks for confirmation |  |
| OK | Fail opens the editor with the error JSON | {"code": "OPS-001", "data": "failed from Process Tools REST"} |
| OK | Complete opens the editor with {} |  |
| OK | Complete Apply -> Success and the task is closed (REST) | Success: task 2078.2297 completed \| 2078.2297 Closed |
| OK | Export CSV of tasks |  |

### Task Data

| Result | Check | Detail |
|---|---|---|
| OK | row selection loads the task variables | Info: task 2078.2298: 0 variable(s) - Edit task data opens the editor |
| OK | editor with the task data JSON | {} |
| OK | Set task data -> reload after the update, or a clear server error | Info: task 2078.2298: 0 variable(s) - Edit task data opens the editor |

### Event Manager Tasks

| Result | Check | Detail |
|---|---|---|
| OK | Lookup event manager tasks | Info: 10 event manager task(s) |
| OK | Details editor |  |
| OK | Delete selected asks for confirmation |  |
| OK | Delete all asks for confirmation |  |
| OK | Delete UCA tasks without inputs -> Error | Error: container, snapshot, undercover agent name and scheduled-after date are required |
| OK | Delete UCA tasks with inputs asks for confirmation | Delete the event manager tasks of UCA uca (DVBM / v1) scheduled after Tue Dec 31 2019 19:00:00 GMT-0 |
| OK | Replay selected -> Success or a clear server error | Success: replay requested for 1 task(s) |

### Instance Cleanup

| Result | Check | Detail |
|---|---|---|
| OK | Lookup finished instances older than 0 days | Info: 477 instance(s) older than the given number of days |
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

## Defects found and fixed during the test cycles

| Symptom | Cause | Fix |
|---|---|---|
| Every Lookup "Error: HTTP 0" after the restructure | header Map not enumerable with `keys()`; the CSRF header never left | `tw.object.Map.keyArray()` (its real API: put, get, containsKey, containsValue, keyArray, valueArray, remove, size, isEmpty) |
| Helper changes had no effect after delete + re-import | the engine caches a server file by its asset id / file uuid | asset id and file uuid derived from a content hash |
| Set priority picker empty | list default of a client-side human service variable is not applied at runtime | the priorities list is an output of Initialize (server side) mapped onto the Tasks view option |
| Date columns as browser-formatted Date text | the coach framework revives ISO strings bound to a table | mappers give `yyyy-MM-dd HH:mm:ss` |
| Harness: every second row click deselected the row | OOB Table toggles a selected row | idempotent row selection in the harness |
| Harness: user picker filter `cell` found nothing | classic users API filter is a pattern | `cell*` |

## Known limitations of the lab (not defects)

* `Execute JavaScript` answers CWTBG0529E (script execution disabled on the server) - the app shows the server's error text.
* `Assign back` of a task owned by the team answers CWTBG0549E (not authorized) - shown as a refusal with the task id.
* Export CSV is a copy dialog: without script the coach cannot start a browser download.
