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
| `PT App Processes` | PTInstanceCriteria (containers, versions) -> PTProcesses (ProcessDef rows, appId, snapshotId) | stage 1 `GET /processApps` (classic) -> the app of the acronym; stage 2 `GET /assets?processAppId=&filter=BPD[&snapshotId=]` -> `data.BPD[]` (name, poId, snapshotName). Snapshot: the one whose acronym / name matches Versions, else the tip / default; unknown acronym or snapshot -> Error with the installed snapshots |
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
