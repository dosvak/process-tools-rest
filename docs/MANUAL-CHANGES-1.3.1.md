# Process Tools REST 1.1 -> 1.3.1: services changed (for manual replication in another environment)

Five service flows changed; nothing else (business objects, coach views, the dashboard, the other 40+ services and all ids are unchanged).
Every change is inside a **Script** item of the flow; the flow diagram, variables and parameters are untouched. Scripts below are the full generated text
of the item (copy over the existing script) or the single line to change.


## PT App Processes (1.2) - three script items replaced

Why: the classic `GET /processApps` has no filter and returns every application with all snapshots (multi-MB on a large server, the tab appeared stuck). Stage 1 now calls `GET /ops/std/bpm/containers/{acronym}/versions` (CSRF token from the flow's first step, already present). Output business object unchanged.

### Script item "Build requests" (replace the whole script)

```javascript
// PT App Processes - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT App Processes", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
tw.local.stage = 1;
// stage 1: the versions of the one container named by the acronym (/ops, filtered); stage 2 asks for its BPD assets
var acr = ptTrim(ptTrim(d.containers).split(",")[0]);
if (acr !== "") add("ops", "GET", "/std/bpm/containers/" + ptEncode(acr) + "/versions", "", "");
```

### Script item "Build stage 2 requests" (replace the whole script)

```javascript
// PT App Processes - Build stage 2 requests: the answers of stage 1 (responses 0 .. stageStart - 1) -> the RestCallParams of the second round of calls
var d = tw.local.data;
tw.local.stage = 2;
tw.local.stageStart = tw.local.responses.listLength;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.index = 0;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT App Processes", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
var acronym = ptTrim(ptTrim(d.containers).split(",")[0]);
var wanted = ptTrim(ptTrim(d.versions).split(",")[0]);
function versionsOf(json) { return ((json || {}).versions) || []; }
function findApp(json) {
  var versions = versionsOf(json);
  if (versions.length === 0) return null;
  var v = versions[0];
  return { ID: ptText(v.container_id), shortName: ptText(v.container), name: ptText(v.container_name), installedSnapshots: versions };
}
function findSnapshot(app) {
  var versions = (app && app.installedSnapshots) || [];
  for (var s = 0; s < versions.length; s++) {
    if (ptText(versions[s].version_name).toUpperCase() === wanted.toUpperCase() || ptText(versions[s].version).toUpperCase() === wanted.toUpperCase()) return { ID: ptText(versions[s].id), name: ptText(versions[s].version_name) };
  }
  return null;
}
var app = findApp(ptJson(response(0)));
var snapshot = (app && wanted !== "") ? findSnapshot(app) : null;
if (app != null && (wanted === "" || snapshot != null)) {
  add("rest", "GET", "/assets", "processAppId=" + ptEncode(app.ID) + "&filter=BPD" + (snapshot ? "&snapshotId=" + ptEncode(snapshot.ID) : ""), "");
}
```

### Script item "Map response" (replace the whole script)

```javascript
// PT App Processes - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
var acronym = ptTrim(ptTrim(d.containers).split(",")[0]);
var wanted = ptTrim(ptTrim(d.versions).split(",")[0]);
function versionsOf(json) { return ((json || {}).versions) || []; }
function findApp(json) {
  var versions = versionsOf(json);
  if (versions.length === 0) return null;
  var v = versions[0];
  return { ID: ptText(v.container_id), shortName: ptText(v.container), name: ptText(v.container_name), installedSnapshots: versions };
}
function findSnapshot(app) {
  var versions = (app && app.installedSnapshots) || [];
  for (var s = 0; s < versions.length; s++) {
    if (ptText(versions[s].version_name).toUpperCase() === wanted.toUpperCase() || ptText(versions[s].version).toUpperCase() === wanted.toUpperCase()) return { ID: ptText(versions[s].id), name: ptText(versions[s].version_name) };
  }
  return null;
}
tw.local.results = new tw.object.PTProcesses();
tw.local.results.rows = new tw.object.listOf.ProcessDef();
var first = response(0);
var app = ptFailed(first) ? null : findApp(ptJson(first));
var snapshot = (app && wanted !== "") ? findSnapshot(app) : null;
var second = response(tw.local.stageStart);
if (acronym === "") {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: enter the process application acronym";
} else if (ptFailed(first)) {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: versions of " + acronym + ": " + ptErrorText(first);
} else if (app == null) {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: no process application with the acronym " + acronym;
} else if (wanted !== "" && snapshot == null) {
  var names = [];
  var installed = app.installedSnapshots || [];
  for (var n = 0; n < installed.length; n++) if (!installed[n].tip) names.push(ptText(installed[n].version_name));
  tw.local.results.ok = false;
  tw.local.results.message = "Error: no snapshot " + wanted + " in " + acronym + " (installed: " + names.join(", ") + ")";
} else if (ptFailed(second)) {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: assets of " + acronym + ": " + ptErrorText(second);
} else {
  var data = (ptJson(second) || {}).data || {};
  var bpds = data.BPD || [];
  var snapshotName = ptText(data.snapshotName) || "(tip)";   // the tip of a Process Center track has no snapshot name
  for (var i = 0; i < bpds.length; i++) {
    var row = new tw.object.ProcessDef();
    row.name = ptText(bpds[i].name);
    row.id = ptText(bpds[i].poId);
    row.snapshot = snapshotName;
    row.app = ptText(app.shortName);
    tw.local.results.rows.insertIntoList(tw.local.results.rows.listLength, row);
  }
  tw.local.results.appId = ptText(app.ID);
  tw.local.results.snapshotId = ptText(data.snapshotId);
  tw.local.results.ok = true;
  tw.local.results.message = "Info: " + bpds.length + " process(es) of " + ptText(app.shortName) + " - " + ptText(app.name) + " (snapshot " + snapshotName + ") - select one, then Search instances";
}
```


## Minimal `parts=` on the classic instance call (1.3.1) - one line each in the "Build requests" script

Why: `parts=all` also returns header, variables, business data, tasks and documents; the mappings only read the execution tree and the diagram. `parts` accepts a comma list (verified).

### PT Instance Position

In "Build requests" replace the `parts=all` line with:

```javascript
add("rest", "GET", "/process/" + ptNumericId(d.id), "parts=executionTree,diagram", "");   // only the parts the mapping reads (parts=all adds header, variables, business data, tasks, documents)
```

### PT Bulk Token Position

In "Build requests" replace the `parts=all` line with:

```javascript
for (var i = 0; i < rows; i++) add("rest", "GET", "/process/" + ptNumericId(d.rows[i].id), "parts=executionTree,diagram", "");
```

### PT Instance Timers

In "Build requests" replace the `parts=all` line with:

```javascript
add("rest", "GET", "/process/" + ptNumericId(d.id), "parts=diagram", "");   // attached timer tokens live in diagram.step[].attachedTimer
```

### PT Bulk Move Tokens

In "Build requests" replace the `parts=all` line with:

```javascript
for (var i = 0; i < d.ids.listLength; i++) add("rest", "GET", "/process/" + ptNumericId(d.ids[i]), "parts=executionTree", "");
```


## Verification used

`GET /process/{id}?parts=executionTree,diagram` answers with `snapshotTip`, `executionTree` and `diagram` only (2.4 KB vs 6.1 KB for `all` on a small instance). Flows checked after the change on BAW 20 and BAW 26: App Processes (tip, named snapshot, unknown snapshot, unknown acronym), Instance Position (3 tokens), Instance Timers (1 event manager task, 1 timer token), Bulk Token Position, Bulk Move Tokens (1 token moved).
