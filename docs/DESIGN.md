# Process Tools REST (PTREST) - plan

Derivative of Operations CP4BA 1.2 limited to the **Process** section (tabs Instances, Instance Data, Tokens, Timers, Tasks, Task Data,
Event Manager Tasks, Instance Cleanup, Send Event Message, Execute JavaScript). Same UI, same behaviour, same REST operations, but a
**vanilla BAW implementation**: no JavaScript library (no ops-cp4ba.js, no REST Framework, no BAWJSON), business objects for every input and
output, one service flow per REST operation, manual translation of business objects to REST parameters and of JSON responses to
business objects, OOB UI Toolkit controls bound to business data, services called through OOB Service Call controls with bindings.

## 1. What stays identical

* Dashboard with the App Header, Notifications and one group of tabs "Process" holding the ten tools in the same order, same labels,
  same input fields (text, single select, checkbox groups), same tables and columns, same buttons and button order, same modal dialogs
  (details / editors), same confirmation dialogs, same pickers (user, group, priority, due date), same status line texts, Export CSV.
* Environment variables for the API hosts and context paths (bpm / ops / classic rest, csrf login path) and the app title / logo.
* Behaviour learned in the 1.2 sweep (v2 size < 500, classic ids numeric, CSRF token for /bpm and /ops GETs, optional_parts per API,
  v2 error body {code, data}, dates as ISO timestamps).

## 2. What changes

| Operations CP4BA 1.2 | Process Tools REST |
|---|---|
| ops-cp4ba.js library (queue, status, tables, pickers, CSV) | none; every behaviour is a control binding, a control event expression or a service |
| REST Framework service (catalogue, dynamic mapping, batch) | one service flow per REST operation with typed input / output business objects |
| JSON handled by JavaScript in the browser | JSON parsed on the server in the service flow's script step, fields copied one by one into business objects |
| view inputs read with getData() in JavaScript | view inputs bound to business objects (tw.local.<tool>.criteria.<field>) |
| tables filled with setData() | tables bound to list variables that the services return |
| confirmations, pickers, editors driven by library helpers | OOB Modal Section controls with primary / secondary button events |

## 3. Business objects (all new, prefixed PT)

* `PTApiConfig` - hosts, context paths, CSRF login path, user name (from Initialize).
* `PTRestRequest` {family, method, path, query: NameValuePair[], body, contentType} and `PTRestResponse` {status, ok, body, error} -
  the contract of the shared Call REST service.
* Per tool: `PT<Tool>Criteria` (the input fields of the tool), `PT<Tool>Selection` where needed (ids of selected rows), the row types
  reused from 1.2 (ProcessV2Row, UserTaskV2Row, VarRow, TokenRow, StepInfo, EmTaskRow, TimerInfo, UserDetails, GroupDetails,
  NameValuePair) and result objects `PTResult` {ok, message, detailsJson} for actions.

## 4. Services (service flows, one per REST operation)

Shared: `PT Get CSRF Token` (POST csrf login, cached in tw.local of the caller), `PT Call REST` (script step with HttpURLConnection:
builds the URL from family + path + query, sets auth and CSRF, returns PTRestResponse), `PT Initialize` (environment variables -> PTApiConfig).

| Tool | Services |
|---|---|
| Instances | Search Instances (v2 GET /processes), Instance Details (v2 GET /processes/{id}), Bulk Action suspend / resume / retry / terminate (classic PUT /process/bulk), Instance Errors (classic PUT /process/errors), Delete Instance (v2 DELETE), Delete Instances Force (ops DELETE), Resume Snapshot Instances (ops POST) |
| Instance Data | Search Instances, Instance Variables (v2 GET optional_parts=data -> VarRow[]), Set Instance Variables (classic PUT /process/{id}/variables) |
| Tokens | Search Instances, Instance Position (v2 GET actions + tasks -> TokenRow[], StepInfo[]), Move Token, Delete Token (classic POST action=moveToken / deleteToken) |
| Timers | Search Instances, Event Manager Tasks of Instance (ops GET -> EmTaskRow[], TimerInfo[]), Replay EM Task, Delete EM Task, EM Task Details, Fire Timer Token (classic POST action=fireTimer) |
| Tasks | Search Tasks (v2 GET /user-tasks), Task Details, Claim, Complete, Fail (v2 POST), Assign to User / Group / Back, Set Priority, Set Due Date, Cancel (classic PUT /task/{id}), Delete Completed Tasks (ops DELETE), List Users, List Groups (classic GET for the pickers) |
| Task Data | Search Tasks, Task Variables (v2 GET optional_parts=data -> VarRow[]), Set Task Data (classic PUT action=setData) |
| Event Manager Tasks | Search EM Tasks (ops GET), EM Task Details, Replay EM Tasks, Delete EM Tasks, Delete All On-Hold, Delete UCA Tasks |
| Instance Cleanup | Search Instances (older than n days), Delete Instance, Delete Instances Force |
| Send Event Message | Send Message (classic POST /process?action=sendMessage) |
| Execute JavaScript | Search Instances, Execute Script (classic PUT action=js) |

Every service: input mapping from the tool's criteria / selection objects -> script "Build request" (manual parameter translation, URL
encoding, numeric classic ids) -> nested PT Call REST -> script "Map response" (JSON.parse on the server, field-by-field copy into the
output business objects, error text from {code, data} / {status, Data.errorMessage}) -> outputs bound to the view.

## 5. Views

The ten tool views are regenerated from the same layout specification as 1.2 (identical controls and positions) with these bindings:
inputs bound to the criteria object, tables bound to the list outputs, one OOB Service Call control per service (attached service,
input data bound to criteria / selection, output bound to the result list or object), buttons whose On click event executes the
Service Call control, Service Call On result / On error events that set the status line, Modal Sections for editors / confirmations /
pickers with primary and secondary click events. Client-side code is limited to control event expressions (`${Svc}.execute()`,
`${Status}.setText(...)`, `${Rows}.getSelectedRecords()`); no library, no shared functions, no inline scripts beyond that.

## 6. Build and verification

`tools/build_ptrest.py` (new generator, reusing the layout builder of build_cp4ba.py), package `Process-Tools-REST-1.0.twx`, lab import,
functional sweep with `tools/pc_cp4ba_test.py` adapted to the new app (every tab, button, modal, picker, export), report in docs.

## 7. Result (2026-09-06, restructured the same evening)

Built package `Process-Tools-REST-1.0.twx` (104 objects: 10 views, 48 service flows, 32 business objects, the server file
pt-helpers.js, dashboard, Initialize, environment variables, the App Header / Notifications assets of the base). Generator
`tools/build_ptrest.py` with the modules `tools/ptrest/ops.py` (business objects, helper server file, shared scripts, the 40 REST
operations), `tools/ptrest/flow.py` (service flow renderer: script tasks, nested calls, exclusive gateways, conditional flows) and
`tools/ptrest/views.py` (the ten tool layouts, bound controls, event expressions). Imported on the lab Process Center 8.6.2
(branch 2063.f551f221-e5d7-5f7a-804d-575e8d562f32, dashboard 1.adbfa8c6-3424-532b-935c-067ac97e4596).

### Structure (user decisions of the restructure)

* **Reusable REST caller `PT Call REST`** - one HTTP exchange per call. Input `restCallParams` of type **RestCallParams**
  {appName, serviceName, url, requestHeaders (Map), requestParams, httpMethodName, skipParsing}; output `returnValue` (**Map**) with
  the entries `statusCode` and `responseBody`. `url` is absolute or relative to serverBaseURL; `requestParams` is the body of a
  POST / PUT / DELETE and the query string of a GET; `requestHeaders` carries Accept, Content-Type, BPMCSRFToken and Cookie (read with the Map's `keyArray()`);
  `skipParsing = false` validates and normalises a JSON answer (pretty printed), `true` returns the text as received. The Map type
  of the System Data toolkit holds primitives and business objects only (its own description), so the answer stays text and the
  Map response scripts parse it. `statusCode` 0 = the connection failed (the reason, the caller's app / service name, method and
  URL are in `responseBody`).
* **`PT Get CSRF Token`** - outputs `csrftoken` (String) and `credDetails` (NameValuePair: name `Cookie`, value = the cookies of the
  login session; on failure name `error` with the reason; csrfLoginPath = none gives name `info`).
* **Operation flows** (40) - Start -> Get CSRF Token -> Build requests (script: RestCallParams list) -> exclusive gateway
  "Requests left?" (`tw.local.index < tw.local.requests.listLength`) -> Call REST (input `tw.local.requests[tw.local.index]`) ->
  Collect response (appends the ReturnValue to `responses`, index + 1) -> back to the gateway; default flow -> Map response -> End.
  Variables: requests, index, responses (Map list), returnValue, csrftoken, credDetails. Bulk actions loop over the selected ids.
* **Server file `pt-helpers.js`** (71 lines including comments, about 45 statements) - the helpers every Build / Map script needs: ptText, ptTrim, ptEncode,
  ptNumericId, ptJoinList, ptQuery, ptEnv, ptApiUrl (family -> host + context path of the environment variables), ptRequest
  (RestCallParams with the headers), ptStatus, ptFailed, ptBody, ptJson, ptPretty, ptErrorText, ptDate. Everything specific to
  one call (row mappers, page size, the classic id list, the `add(...)` request builder naming the service) stays inside that
  call's script. All JavaScript is formatted for people (one statement per line, comments).
* Views unchanged: every input bound to the criteria object, tables bound to the result lists, one OOB Service Call control per
  operation (input `data`, output `results`), buttons execute the Service Call, On result / On error set the status line and open
  the editors / pickers / confirmations (Modal Sections).
* The priorities of the Set priority picker come from Initialize (server side, NameValuePair list mapped onto the Tasks view
  option): a list default on a client-side human service variable is not applied at runtime (both Designer syntaxes tried).
* Server-side row mappers give dates as `yyyy-MM-dd HH:mm:ss` text: the coach framework revives ISO strings bound to a table into
  browser-formatted Date objects.

### Deviations from Operations CP4BA 1.2

| Item | 1.2 | Process Tools REST |
|---|---|---|
| Export CSV | browser download through the library | dialog with the CSV text (copy) - no script allowed |
| Send Event Message parameters | NameValuePair table | XML message text with an Insert template button (the template holds the parameters) |
| Date columns | ISO text of the API | `yyyy-MM-dd HH:mm:ss` (UTC) |
| Status after Update variables / Set task data | success text stays | the list reloads after the update and its Info line replaces the success text |
| Row selection | library helper | OOB Table multi-select (a click on a selected row deselects it) |
| User / group filter | pattern as typed | classic API pattern as typed (`cell*`; `cell` alone finds nothing) |

### Verification

`tools/dash_test.py` (smoke: every tab, Lookup, status line, JS errors, failed HTTP) and `tools/pc_ptrest_test.py` (deep: fresh
instances of the BAW JSON Test app, every button of every tab, editors, pickers, confirmations Cancel / Confirm, CSV dialogs, REST
verification of terminate / set variables / priority / complete). Report: `docs/FUNCTIONAL-TEST-PTREST-2026-09-06.md`.

## 8. Snapshot 1.1 (2026-09-10): Bulk Move Tokens

Own tab (user decision: separate from Tokens, which moves one token of one instance). Package `Process-Tools-REST-1.1.twx`
(115 objects: 11 views, 52 service flows, 41 business objects). Same generator; ids unchanged (branch
2063.f551f221-e5d7-5f7a-804d-575e8d562f32, dashboard 1.adbfa8c6-3424-532b-935c-067ac97e4596, service ids in `tools/ptrest_ids.json`).

### Flow of the tab

1. **Process application acronym** (+ optional snapshot acronym) -> `Load processes` -> **Processes of the application** table.
2. Picking a process row fills the **Process** input; states / page size / offset as in the other tabs -> `Search instances` ->
   **Instances** table (multi-select; `PT Search Instances` with containers + model + versions + states).
3. `Analyze tokens` reads the execution tree of **every instance of the result** -> **Current token locations** (one row per
   step holding tokens: instances, tokens, share; the **common active token** = the step where most instances hold a token is the
   first row and is named in the status line), **Steps** (union of the diagram steps of all instances = move targets),
   **Tokens per instance** (Export CSV).
4. Select the current location + the target step -> `Move tokens (selected instances)` or `Move tokens (all instances)` ->
   confirmation naming source, target and count -> `PT Bulk Move Tokens` -> per-instance report in the status line / message,
   then the analysis reloads.

### Services

| Service | Input -> output | Calls |
|---|---|---|
| `PT App Processes` | PTInstanceCriteria (containers, versions) -> PTProcesses (ProcessDef rows, appId, snapshotId) | stage 1 `GET /ops/std/bpm/containers/{acronym}/versions` (filtered by acronym: container_id + versions; 1.2 - replaces the unfiltered classic `GET /processApps`, which returns every application with all its snapshots and stalled the flow on a server with many applications); stage 2 `GET /assets?processAppId=&filter=BPD[&snapshotId=]` (snapshot = the version named by Versions, empty = tip) |
| `PT Bulk Token Position` | PTInstanceSearch (the search result) -> PTBulkPosition (locations, steps, tokens, common, commonName) | one `GET /process/{id}?parts=all` per instance of the result; tokens grouped by `flowObjectId` (= diagram step ID); sorted by the number of instances |
| `PT Bulk Move Tokens` | PTBulkMove (ids, source, sourceName, target, targetName) -> PTResult | stage 1 `GET /process/{id}?parts=all` per selected instance (fresh token ids); stage 2 `POST /process/{id}?action=moveToken&tokenId=&target=&resume=true&parts=none` per token found at the source; report: moved / skipped (no token at the source) / refused / not read |
| `PT Bulk Tokens To CSV` | PTBulkPosition -> PTCsv | formats the tokens per instance |

### Two-stage operation flows (new in the renderer usage, `tools/build_ptrest.py`)

A call that depends on an earlier answer (the app id for the assets call, the token ids for the moves) gets a second stage:
Start -> Get CSRF Token -> Build requests (`tw.local.stage = 1`) -> Requests left? -> Call REST -> Collect response -> loop ->
default -> **Second stage?** (`tw.local.stage == 1`) -> **Build stage 2 requests** (`stage = 2`, `stageStart = responses.listLength`,
new request list, index 0) -> back to Requests left? -> ... -> Second stage? default -> Map response -> End. The Map script reads
the stage-1 answers as `response(0 .. stageStart - 1)` and the stage-2 answers from `response(stageStart)` on. Declared in
`ops.py` with `op(..., build2=<script>)`; the stage-2 script gets the same `d`, `response(i)` and `add(...)` helpers as the others.

### Business objects

ProcessDef {name, id, snapshot, app}; PTProcesses {ok, message, rows, appId, snapshotId}; BulkLocation {step, stepType,
flowObjectId, instances (Integer), tokens (Integer), share}; BulkToken {instance, instanceName, tokenId, step, flowObjectId, detail};
PTBulkPosition {ok, message, locations, steps (StepInfo), tokens, common, commonName}; PTBulkMove {ids, source, sourceName, target, targetName}.

### View (`views.py: bulk_move`)

Inputs bound to `tw.options.criteria` (PTInstanceCriteria): Containers, Versions, Model (filled by the Processes row selection
through `${Model}.setText`), States, Size, Offset. Buttons: Load processes, Search instances (refuses an empty Process), Analyze
tokens (Service Call input bound to `tw.options.search`), Move tokens (selected instances) / (all instances) - the "all" variant
takes the ids from `${Rows}.getRecords()`; a hidden Output Text `MoveScope` remembers which button opened the confirmation.
Tables: Procs, Rows (multi-select), Rows2 locations, Rows3 steps, Rows4 tokens per instance + Export CSV. After a successful move
the analysis service runs again.

### Generator housekeeping

The base of the build is now extracted by the generator itself from `Operations-REST-1.1-pc-export.twx` (the Process Center
export with the toolkits nested as `toolkits/*.zip`) into the session scratchpad (`PTREST_SCRATCH` overrides the path) - the
folders of an earlier session are not permanent. Service ids are written to `tools/ptrest_ids.json` as well.

### Verification (2026-09-10)

Smoke sweep of the 11 tabs (0 JS errors, 0 failed HTTP), deep test `tools/pc_ptrest_test.py` **79 checks, 0 failed** (14 checks of
the new tab: process list, unknown acronym / snapshot errors, process pick, search, analysis with the common active token, confirmation
Cancel / Confirm, 2 tokens moved to End -> both instances STATE_FINISHED over REST, analysis reload, "all instances" guard, CSV),
direct runs of the two-stage flows, designer check `tools/pc_ptrest_webpd_check.py` (validation counter 0). Report:
`docs/FUNCTIONAL-TEST-PTREST-2026-09-10.md`.

## 1.2 (2026-09-22): App Processes on a server with many applications

Symptom: *PT App Processes* never returned on a server with hundreds of applications. Cause: the classic `GET /processApps` has no filter
parameter (`?filter=` / `?processAppAcronym=` are ignored, verified on the lab) and returns every application with all installed snapshots -
several MB that the engine-side script then parses. Fix: stage 1 now calls `GET /ops/std/bpm/containers/{acronym}/versions` (CSRF token
from the flow's first step), which answers only for that container (2.3 KB on the lab) with `container_id`, `container_name` and every
version (`id`, `version_name`, `tip`); `GET /ops/std/bpm/containers?acronym=` is **not** filtered (returns all containers). Needs BAW 18+
(/ops); on plain BPM 8.6.x without /ops the 1.1 flow is the fallback.

## 1.3.1 (2026-09-22): minimal `parts=` on the classic instance call (1.3 = the same content; the BAW 20 lab already had a 1.3 snapshot, so 1.3.1 is the deployed name)

`GET /process/{id}?parts=all` returns header, variables, business data, execution tree, diagram, tasks, documents and actions - on a loaded
server with large variables that is the expensive part of every token / timer operation. The four calls now ask only for what their mapping
reads (verified on the lab: `parts` takes a comma list; 6 116 bytes for `all` vs 2 425 for `executionTree,diagram` on a small instance, far more
on real ones): *PT Instance Position* and *PT Bulk Token Position* `parts=executionTree,diagram`, *PT Instance Timers* `parts=diagram`
(attached timer tokens in `diagram.step[].attachedTimer`), *PT Bulk Move Tokens* stage 1 `parts=executionTree`. Answers keep `snapshotTip`.
`GET /users?parts=all` (assign picker) is a different endpoint and stays.

## 1.4 (2026-09-23): Bulk Token Selective

User request: a replica of Bulk Move Tokens where the instances come from a pasted list instead of the application / process lookup,
the analysis and the move run over exactly that list, everything else unchanged, services and coaches reused as far as possible.

### What changed (generator only, `tools/build_ptrest.py --snapshot 1.4`, 118 objects)

- Business object `PTIdList {text}`; script flow **PT Parse Instance Ids** (`PTIdList -> PTInstanceSearch`): splits the text on commas,
  semicolons, spaces and line breaks, strips quotes, accepts `2072.55` and bare `55` (prefixed `2072.`), drops blanks and duplicates,
  reports invalid entries in the message; the result has the same shape as *PT Search Instances* (one `ProcessV2Row` per id, name empty).
- View **Bulk Token Selective** = `views.bulk_move(svc, selective=True)`: the inputs row, the Load processes / Search instances buttons
  and the Processes table are replaced by a Text Area bound to `tw.options.idlist.text` and the button *Analyze tokens* runs
  `PT Parse Instance Ids` first; its result fills the **Instances (from the list)** table (`tw.options.search`) and, when ok, runs the
  shared *PT Bulk Token Position*. Tables (Instances multi-select, Current token locations, Steps, Tokens per instance + CSV), the
  confirmation dialog, *Move tokens (selected instances)* / *(all instances)*, *PT Bulk Move Tokens* and the reload of the analysis are the
  same code as the Bulk Move Tokens tab (one function, one flag). Tab order: after Bulk Move Tokens.
- Deep test `tools/pc_ptrest_test.py`: two more Test Task Process instances; the new section pastes `abc, <bare id>\n2072.<id>;<id>`
  (invalid, bare, prefixed, duplicate), expects 2 listed instances and the common active token, the location / step guard, the
  confirmation for 2 instances, Success with 2 tokens moved and both instances completed over REST, the reload, the CSV.

### Verification (2026-09-23)

Imported on 8.6.2 (`<process-center-host>`) and BAW 26 (`https://wc.dosvak.net`) as snapshot 1.4 (same branch / dashboard ids). *PT Parse Instance
Ids* run directly on both (`ft_rest_test.py tools/ptrest_ids.json "PT Parse Instance Ids" '{"data": {"text": "abc, 55\n2072.66; 66 \"77\""}}'`
-> 3 ids, abc ignored). Deep test on 8.6.2 (`docs/ptrest_test_14.json`): 85 checks, the 8 of the new tab pass; 2 failures are unrelated to
1.4 (the "unknown acronym" expectation dated from 1.1 - since 1.2 the /ops lookup answers `CWTBG0624E: Container ... does not exist`, the test
now accepts both; Task Data finds no open task because the Tasks section completes the last one - known ordering issue). Designer: *PT Parse
Instance Ids* opens with validation counter 0. Manual replication guide: `docs/PTREST-1.4-MANUAL-CHANGES.md`.

## 1.5 / 1.5.1 (2026-09-23): Fire Timers Selective

User request: fire timers in bulk over a pasted list of instance ids, in the same fashion as Bulk Token Selective, reusing its services
and coach code as far as possible. Follow-up (user, after 1.5): "select a timer, or none for every timer" is too dangerous - allow only
**one (common) timer per fire**. 1.5 (imported on 8.6.2 only) had the "none = every pending timer" option; **1.5.1 replaces it** and is the
only version to publish.

### What changed (generator only, `tools/build_ptrest.py --snapshot 1.5.1`, 121 objects; no new business object)

- **PT Bulk Timer Position** (`PTInstanceSearch -> PTBulkPosition`, copy of *PT Bulk Token Position*): classic
  `GET /process/{id}?parts=diagram` per listed instance; the timers holding tokens = intermediate timer events (`step.activityType ==
  "timer"`, `step.tokenID`) and timers attached to an activity (`step.attachedTimer[].tokenID`) - the Timers tab only shows the attached
  ones. Grouped per timer (key = step ID, or step ID / attached timer ID), instances / tokens / share per timer, **common timer first**,
  timer tokens per instance.
- **PT Bulk Fire Timers** (`PTBulkMove -> PTResult`, copy of *PT Bulk Move Tokens*, two stages): stage 1 re-reads the diagrams (fresh
  token ids), stage 2 = **one** `POST /process/{id}?action=fireTimer&timerTokenId=` per instance, for the first token at the chosen timer
  (`source` = timer key, `sourceName` = its name). An empty `source` is refused before any call ("Error: select the one timer to fire ...
  nothing was fired"); an instance with more than one token at that timer gets one fired and is reported as having tokens left pending;
  instances without a token there are reported as skipped.
- View **Fire Timers Selective** (`views.fire_timers_selective`, tab after Timers): the Text Area + *PT Parse Instance Ids* of 1.4
  (reused unchanged), Instances table (multi-select), Pending timers table (single-select, common timer first), Timer tokens per instance
  + CSV (*PT Bulk Tokens To CSV*, reused), *Fire timers (selected instances)* / *(all instances)*: both refuse without a selected timer
  row, the confirmation names the timer and "one token per instance", the analysis reloads after the fire.

### Verification (2026-09-23)

8.6.2: 1.5.1 imported; *PT Bulk Fire Timers* run directly with an empty timer key -> Error, nothing fired. Deep test
(`docs/ptrest_test_151.json`, two fresh Test Timer Process instances): the 8 checks of the new tab pass - empty list error, 2 instances
with the common timer 'Wait 4 hours' (2 of 2), Fire without a selected timer -> error and no confirmation, Fire (selected) without an
instance -> error, confirmation text, "Success: 2 timer(s) fired at 'Wait 4 hours'" with both instances `STATE_FINISHED` over REST, reload
with no timer pending, CSV. The first run also exposed a test bug: the unknown-acronym check (passing since the 1.4 test fix) left its error
dialog open and the rest of the Bulk Move Tokens section failed behind it - the test now closes it. BAW 26 (`https://wc.dosvak.net`): 1.5.1 imported
(snapshots 1.3.1, 1.4, 1.5.1 - 1.5 never went there); flows run directly on two fresh Test Timer Process instances: analysis -> common
timer 'Wait 4 hours' (2 of 2), fire with that key -> "Success: 2 timer(s) fired", both `STATE_FINISHED`; empty key -> error, nothing fired.
Full deep test after the test fixes below: 8.6.2 **96 / 96** (`docs/ptrest_test_151.json`); BAW 26 **94 / 96**
(`docs/ptrest_test_151_26.json`, test app Test Data Generator - BAW JSON Test is not installed there; the 8 new checks pass; failures outside
this release: the Assign-to-group picker lists 0 groups on 26, and the known Task Data ordering issue). Test fixes: the unknown-acronym error
dialog is closed; `tab()` clicks tabs that overflowed into the tab-row menu (the new tab pushed Execute JavaScript there at 1800 px); cleanup
deletes with `?action=delete`; the test app / BPD ids are resolved per lab from `GET /exposed/process` (BAWJSON, else TDGEN).
Manual replication guide: `docs/PTREST-1.5-MANUAL-CHANGES.md` (1.4 -> 1.5.1).

## 1.6 / 1.6.1 (2026-09-24): ENV Manager and EPV Manager

User request: two tabs that list the environment variables / EPVs of an application from its acronym and filter inputs, and edit them
in a user-friendly way. 1.6 (imported on 8.6.2 only) failed in *Build requests* of the list flows (`acronyms` not defined in stage 1);
**1.6.1** is the fixed build and the only one to publish.

### What changed (generator only, `tools/build_ptrest.py --snapshot 1.6.1`)

- Business objects: `PTVarCriteria` {containers, versions, scope, epv, name, value}, `PTEnvRow` / `PTEpvRow` (one row per variable and
  snapshot; `value` = edited in the table, `original` = the stored value; EPV rows add epv, epvContainer, variable, type, scheduled,
  history, description), `PTEnvList` / `PTEpvList`, `PTEnvSave` {rows}, `PTEpvSave` {rows, effective, reason}.
- **PT Env List** / **PT EPV List** (two stages): stage 1 `GET /ops/std/bpm/containers/{acronym}/versions` per acronym; stage 2
  `GET .../versions/{version}/env_vars` or `.../epvs?optional_parts=previous_values,future_values` for every picked snapshot - named,
  not archived, the listed snapshots (empty = all), scope all / active / newest, newest first, at most 100 snapshots. Rows filtered by
  "contains" (case-insensitive) on the EPV name, variable name and value. The snapshot selection (`PICK_VERSIONS`) is one script shared
  by *Build stage 2 requests* and *Map response*, so both walk the same snapshots in the same order.
- **PT Env Save**: the rows grouped per snapshot -> one `POST .../env_vars {pairs: [{name, value}]}` per snapshot.
- **PT EPV Save** (two stages): one `POST .../epvs {variable_value_details: [{epv_name, epv_variable_name, epv_variable_value,
  effective_date, reason, epv_container_acronym}]}` per snapshot; a request refused with *Unrecognized field* (8.6.2 knows neither
  `reason` nor `epv_container_acronym`) is sent again in stage 2 without them.
- Views **ENV Manager** / **EPV Manager** (`views.var_manager`, tabs after Execute JavaScript): filter row, *Lookup*, multi-select table
  whose *Value* column is a Text input (`table(..., editable=('value',))`), *Save changes* (the rows whose value differs from the stored
  one; confirmation lists them), *Set value for selected* (dialog prefilled with the first selected value, one value for all selected
  rows), *Discard changes* (= Lookup), CSV (*PT Env To CSV* / *PT EPV To CSV*); EPV Manager adds *Effective from* (date/time, empty =
  now), *Reason*, *Scheduled values* column and a *History* dialog (current, default, scheduled, previous values). The list reloads
  after every save.

### Verification (2026-09-24)

Flow scripts run locally against both labs with a mock `tw` runtime (`<scratch>/runflow.cjs`: Build -> curl loop -> stage 2 -> Map, real
REST answers): lists with scope / snapshot / name / value filters, unknown acronym, empty acronym; env save of two snapshots and
restore; EPV save with a reason and restore (8.6.2: 500 *Unrecognized field "reason"* -> stage 2 without it -> stored; BAW 26: stored
with the reason in one call). Deep test `tools/pc_ptrest_test.py` sections ENV Manager / EPV Manager (fixture `VAR_APP`, default GUITS:
googleMapsApiKey and PDiagramData.processDiagramString edited in the table, stored, checked over REST, restored).
Imported as 1.6.1 on 8.6.2 and BAW 26 (flows answer on both through `ft_rest_test.py`). Full deep test: 8.6.2 **109 / 110**
(`docs/ptrest_test_161.json`), BAW 26 **109 / 110** (`docs/ptrest_test_161_26.json`); the 16 new checks pass on both, the one failure is
the known Task Data ordering issue (the Tasks section completes the last open task first). One BAW 26 run lost the coach from Event
Manager Tasks onwards (every later tab failed); the rerun was clean. Test fix: the edited Value cell is an input, so its text is not
part of the row text - the check reads the cell. The 1.6 snapshot (list flows broken) was archived on 8.6.2.
