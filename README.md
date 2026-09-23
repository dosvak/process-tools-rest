# Process Tools REST

The process administration tools of IBM Business Automation Workflow - **Instances, Instance Data, Tokens, Timers, Tasks, Task Data,
Event Manager Tasks, Instance Cleanup, Send Event Message, Execute JavaScript** and, new in 1.1, **Bulk Move Tokens** - as a
"vanilla" BAW process application: business objects for every input and output, one service flow per REST operation, out-of-the-box
controls bound to business data, Service Call controls, modal sections for editors, pickers and confirmations. No JavaScript
library, no inline coach scripts, no third-party toolkit, no Java: everything a BAW developer can open, read and change in the designer.

It is the same tool set as the Process group of [Operations CP4BA](https://github.com/dosvak/operations-cp4ba), rebuilt to show how
far the standard building blocks go.

## Packages

| File | Target | Notes |
|---|---|---|
| [`packages/Process-Tools-REST-1.4.twx`](packages/Process-Tools-REST-1.4.twx) | traditional BAW 18 and later (needs the `/ops` API) | **1.4**: new tab *Bulk Token Selective* - paste a list of instance ids (`2072.55` or `55`, separated by commas, spaces or line breaks) instead of looking the instances up; the token analysis, the location / step tables and *Move tokens* run over exactly that list through the same services (*PT Bulk Token Position*, *PT Bulk Move Tokens*) plus the small script flow *PT Parse Instance Ids*. Manual replication on another environment: [docs/MANUAL-CHANGES-1.4.md](docs/MANUAL-CHANGES-1.4.md). Verified on BAW 8.6.2 and BAW 26 |
| [`packages/Process-Tools-REST-1.3.1.twx`](packages/Process-Tools-REST-1.3.1.twx) | traditional BAW 18 and later (needs the `/ops` API) | **1.3.1**: the classic instance calls of *Tokens*, *Timers* and *Bulk Move Tokens* ask only for the parts they read (`parts=executionTree,diagram`, `parts=diagram`, `parts=executionTree`) instead of `parts=all`, which also carried variables, business data, tasks and documents - lighter on a loaded server; includes the 1.2 change |
| [`packages/Process-Tools-REST-1.2.twx`](packages/Process-Tools-REST-1.2.twx) | traditional BAW 18 and later (needs the `/ops` API) | **1.2**: *App Processes* resolves the application through the acronym-filtered `GET /ops/std/bpm/containers/{acronym}/versions` instead of the unfiltered classic `GET /processApps`, which returned every application with all its snapshots and stalled the tab on servers with hundreds of applications; everything else unchanged |
| [`packages/Process-Tools-REST-1.1.twx`](packages/Process-Tools-REST-1.1.twx) | traditional BAW / IBM BPM 8.6.x and later | process app **Process Tools REST** (`PTREST`) 1.1 |
| [`packages/cp4ba/Process-Tools-REST-1.1-CP4BA_25.twx`](packages/cp4ba/Process-Tools-REST-1.1-CP4BA_25.twx) | CP4BA 25.0.x Workflow Authoring | exported from CP4BA 25.0.1 after validation, `/bas` context paths preset |

The same files are attached to the [releases](../../releases). Dependencies: System Data and UI Toolkit only.

## How it works

* **Business objects** for every input and output (PTInstanceCriteria, PTInstanceSearch, PTIds, PTResult, PTVariables, PTPosition,
  PTTimers, PTTaskCriteria, PTTaskSearch, PTTaskAssign, PTTaskUpdate, PTTaskComplete, PTUsers, PTGroups, PTEmCriteria, PTEmTasks,
  PTUca, PTCleanupCriteria, PTMessage, PTScript, PTCsv, ...) and **RestCallParams** / **ReturnValue** for the REST caller.
* **PT Call REST** - the reusable single-call REST caller: input RestCallParams {appName, serviceName, url, requestHeaders (Map),
  requestParams, httpMethodName, skipParsing}, output ReturnValue (Map) {statusCode, responseBody}; HttpURLConnection, basic
  authentication with the technical user of the environment variables, optional trust-all TLS. **PT Get CSRF Token** obtains the
  CSRF token and the login cookies.
* **40 operation service flows** (Ajax exposed, input `data`, output `results`): Get CSRF Token -> Build requests (translate the
  business object into RestCallParams) -> loop [Requests left? -> Call REST -> Collect response] -> Map response (JSON text ->
  business object, field by field). Two-stage flows (Build -> loop -> Build stage 2 -> loop -> Map) serve the calls that depend on an
  earlier answer. 6 CSV formatter flows.
* **Server file [`pt-helpers.js`](lib/pt-helpers.js)** with the few helpers every script needs (text, query strings, API URLs per
  family, RestCallParams, ReturnValue access, error text, dates); everything specific to one REST call stays inside that call's script.
* **Views** with bound OOB controls only: inputs bound to the criteria object, tables bound to the result lists, one Service Call
  control per operation, buttons that execute it, Modal Sections for editors, pickers and confirmations.

### Tools

| Tab | Functions |
|---|---|
| Instances | search by term, model, containers, snapshots, states, sort, paging; details; suspend, resume, retry, terminate, delete; runtime errors |
| Instance Data | variables of an instance as table and JSON; edit and update; CSV |
| Tokens | execution tree tokens, open tasks, diagram steps as targets; move token, delete token |
| Timers | event manager tasks of the instance (fire now, delete) and timer tokens (fire timer) |
| Tasks | search by model, instance, states, sort, paging; details; claim, complete with output variables, fail, assign to user / group / back (pickers), priority, due date, cancel |
| Task Data | variables of a task; edit and set; CSV |
| Event Manager Tasks | all event manager tasks with state and instance filters; replay, delete on hold, delete all on hold, delete UCA tasks |
| Instance Cleanup | instances of chosen states older than N days; delete selected or all |
| Send Event Message | event message XML with a template; send |
| Execute JavaScript | evaluate a script in the context of an instance |
| Bulk Move Tokens (1.1) | process definitions of an application -> instances of one definition -> **current token locations** with the common active token first (instances / tokens / share per step) -> move every token at the selected step to a target step for the selected or all instances, with a confirmation and a per-instance report |

## Install and configure

1. Import the package (Process Center console > *Import Process App*; CP4BA: Business Automation Studio > *Business automations* > *Import*).
2. Environment variables: `serverBaseURL`, `restAuthUser` / `restAuthPassword` (technical user; **the password ships empty - set it
   after the import**), `restTrustAllCertificates`, `restHost` / `restContextPath`, `opsHost` / `opsContextPath`, `bpmHost` /
   `bpmContextPath`, `federatedHost` / `federatedContextPath`, `csrfLoginPath`, `appTitle`, `logoURL`.
3. Expose the dashboard *Process Tools* to the administrators' team and run it.

## Documentation and verification

* [docs/DESIGN.md](docs/DESIGN.md) - the design: business objects, flows, caller, helpers, views, decisions.
* [docs/FUNCTIONAL-TEST-2026-09-10.md](docs/FUNCTIONAL-TEST-2026-09-10.md) - deep functional test on BAW 8.6.2 / 20.0.0.1: smoke sweep
  of the 11 tabs and 79 checks (editors, pickers, confirmations, CSV dialogs, REST verification of every data change; the bulk move
  sends the tokens of two instances to End and both finish), 0 failed; [the 1.0 test](docs/FUNCTIONAL-TEST-2026-09-06.md).
* CP4BA 25.0.1: imported with 0 validation errors, environment values set for the `/bas` context.

The packages are generated from a declarative build in a private workspace of Dosvak LLC; the design document mentions its tools
by name.

## License and attribution

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE). You may use, modify and redistribute this software, including in
commercial products, provided the copyright notice, the license and the NOTICE file stay with every copy (attribution to Dosvak LLC).

## About

Published by [Dosvak LLC](https://dosvak.com), an IBM Business Partner (Silver, IBM Partner Plus), as part of its open-source tooling
for IBM Business Automation Workflow. More: [github.com/dosvak](https://github.com/dosvak), questions and answers on
[bpm.tips](https://bpm.tips).

IBM, IBM Business Automation Workflow, IBM Business Process Manager and IBM Cloud Pak are trademarks or registered trademarks of
International Business Machines Corporation. This project is not affiliated with, endorsed by or supported by IBM.
