# Process Tools REST 1.5.1 -> 1.6.1: ENV Manager and EPV Manager (for manual replication in another environment)

Seven new business objects, six new service flows, two new coach views and two new tabs in the dashboard. Nothing existing changes;
the flows reuse *PT Get CSRF Token*, *PT Call REST* and the server file `pt-helpers.js` like every other operation.
Order of work: 1 business objects, 2 service flows, 3 coach views, 4 dashboard.

What the tabs do: enter application / toolkit acronyms and filters -> *Lookup* lists every environment variable (ENV Manager) or EPV
variable (EPV Manager) of the picked snapshots, one row per variable and snapshot -> edit the **Value** cells and click *Save changes*
(only the changed rows are stored, after a confirmation), or select rows and use *Set value for selected* (one value for all of them)
-> one Operations REST call per snapshot, then the list reloads. EPV Manager adds an *Effective from* date (empty = now), a *Reason*,
the *Scheduled values* column and a *History* dialog.

Scope: the tabs manage the **value on the current server** - the override stored per snapshot by `POST /ops/.../env_vars` and
`POST /ops/.../epvs`. The per-environment-type values of the designer (Default, Development, Test, Staging, Production) are part of the
snapshot and are not changed; no REST API reads or writes them.

REST calls (Operations REST, BPMCSRFToken header as for the other /ops calls):

| Call | Used by |
|---|---|
| `GET /ops/std/bpm/containers/{acronym}/versions` | both lists, stage 1 (the snapshots of each acronym) |
| `GET /ops/std/bpm/containers/{acronym}/versions/{version}/env_vars` | PT Env List, stage 2 |
| `GET /ops/std/bpm/containers/{acronym}/versions/{version}/epvs?optional_parts=previous_values,future_values` | PT EPV List, stage 2 |
| `POST /ops/std/bpm/containers/{acronym}/versions/{version}/env_vars` `{pairs: [{name, value}]}` | PT Env Save |
| `POST /ops/std/bpm/containers/{acronym}/versions/{version}/epvs` `{variable_value_details: [{epv_name, epv_variable_name, epv_variable_value, effective_date, reason}]}` | PT EPV Save |

Server differences: 8.6.2 refuses `reason` (and `epv_container_acronym`) with 500 *Unrecognized field* - PT EPV Save sends a refused
request again without them. 8.6.2 applies a changed environment value when the snapshot is reloaded, BAW 24+ at once.

## 1. Business objects
- **PTVarCriteria**: `containers` String, `versions` String, `scope` String, `epv` String, `name` String, `value` String
- **PTEnvRow**: `container` String, `version` String, `active` String, `name` String, `value` String, `original` String
- **PTEnvList**: `ok` Boolean, `message` String, `rows` PTEnvRow[]
- **PTEnvSave**: `rows` PTEnvRow[]
- **PTEpvRow**: `container` String, `version` String, `active` String, `epv` String, `epvContainer` String, `variable` String, `type` String, `value` String, `original` String, `scheduled` String, `history` String, `description` String
- **PTEpvList**: `ok` Boolean, `message` String, `rows` PTEpvRow[]
- **PTEpvSave**: `rows` PTEpvRow[], `effective` String, `reason` String

`value` = the value edited in the table, `original` = the value read from the server (unchanged; *Save changes* compares the two).

## 2. Service flows

The four operation flows have the usual shape (Ajax exposed, input `data`, output `results`, variables `requests` RestCallParams[],
`index` Integer, `responses` Map[], `returnValue` Map, `csrftoken` String, `credDetails` NameValuePair): Start -> *Get CSRF Token* ->
*Build requests* -> gateway *Requests left?* (`tw.local.index < tw.local.requests.listLength`) -> *Call REST* -> *Collect response* ->
back; default flow -> *Map response* -> End. The **two-stage** ones (PT Env List, PT EPV List, PT EPV Save) add the variables `stage`
and `stageStart` (Integer) and the gateway *Second stage?* (`tw.local.stage == 1`) -> *Build stage 2 requests* -> back to *Requests
left?*; its default flow leads to *Map response*. Easiest: copy **PT App Processes** (two stages) or **PT Delete Token** (one stage)
and replace the types and scripts.

### 2a. `PT Env List` (input PTVarCriteria, output PTEnvList, two stages)

ENV Manager: GET /ops/std/bpm/containers/{acronym}/versions per acronym (stage 1) -> GET .../versions/{version}/env_vars of every picked snapshot (stage 2; named, not archived, filter Snapshots / scope all | active | newest) -> PTEnvRow per variable matching the name / value filters

Script *Build requests*:

```javascript
// PT Env List - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Env List", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
tw.local.stage = 1;
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
for (var a = 0; a < acronyms.length; a++) add("ops", "GET", "/std/bpm/containers/" + ptEncode(acronyms[a]) + "/versions", "", "");
```

Script *Build stage 2 requests*:

```javascript
// PT Env List - Build stage 2 requests: the answers of stage 1 (responses 0 .. stageStart - 1) -> the RestCallParams of the second round of calls
var d = tw.local.data;
tw.local.stage = 2;
tw.local.stageStart = tw.local.responses.listLength;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.index = 0;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Env List", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
var picks = allPicks();
for (var p = 0; p < picks.length; p++) add("ops", "GET", "/std/bpm/containers/" + ptEncode(picks[p].container) + "/versions/" + ptEncode(picks[p].version) + "/env_vars", "", "");
```

Script *Map response*:

```javascript
// PT Env List - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
tw.local.results = new tw.object.PTEnvList();
tw.local.results.rows = new tw.object.listOf.PTEnvRow();
var problems = lookupProblems();
var picks = (acronyms.length === 0) ? [] : allPicks();
if (acronyms.length === 0) {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: enter at least one process application or toolkit acronym";
} else {
  for (var p = 0; p < picks.length; p++) {
    var r = response(tw.local.stageStart + p);
    if (ptFailed(r)) { problems.push(picks[p].container + " / " + picks[p].version + ": " + ptErrorText(r)); continue; }
    var json = ptJson(r) || {};
    var pairs = json.pairs || [];
    for (var i = 0; i < pairs.length; i++) {
      if (!contains(pairs[i].name, d.name) || !contains(pairs[i].value, d.value)) continue;
      var row = new tw.object.PTEnvRow();
      row.container = picks[p].container;
      row.version = picks[p].version;
      row.active = picks[p].active;
      row.name = ptText(pairs[i].name);
      row.value = ptText(pairs[i].value);
      row.original = row.value;
      tw.local.results.rows.insertIntoList(tw.local.results.rows.listLength, row);
    }
  }
  var count = tw.local.results.rows.listLength;
  tw.local.results.ok = problems.length === 0 || count > 0;
  if (problems.length && !count) tw.local.results.message = "Error: " + problems.join("; ");
  else tw.local.results.message = "Info: " + count + " environment variable(s) in " + picks.length + " snapshot(s)"
    + (picks.length >= MAX_SNAPSHOTS ? " (first " + MAX_SNAPSHOTS + " snapshots - narrow the filter)" : "")
    + (picks.length === 0 && !problems.length ? " - no snapshot matches the filter (named, not archived" + (scope === "active" ? ", active" : "") + ")" : "")
    + (count ? " - edit the Value column and click Save changes, or select rows and click Set value for selected" : "")
    + (problems.length ? " - refused: " + problems.join("; ") : "");
}
```

### 2b. `PT Env Save` (input PTEnvSave, output PTResult)

ENV Manager: the edited rows grouped by snapshot -> POST /ops/std/bpm/containers/{acronym}/versions/{version}/env_vars {pairs: [{name, value}]} per snapshot

Script *Build requests*:

```javascript
// PT Env Save - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Env Save", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
function saveGroups() {
  var groups = [];
  var byKey = {};
  for (var i = 0; d.rows != null && i < d.rows.listLength; i++) {
    var row = d.rows[i];
    var key = ptTrim(row.container) + "/" + ptTrim(row.version);
    if (!byKey[key]) { byKey[key] = { container: ptTrim(row.container), version: ptTrim(row.version), rows: [] }; groups.push(byKey[key]); }
    byKey[key].rows.push(row);
  }
  return groups;
}
var groups = saveGroups();
function groupNames(g) { var names = []; for (var i = 0; i < g.rows.length; i++) names.push(ptText(g.rows[i].variable || g.rows[i].name)); return names.join(", "); }
for (var g = 0; g < groups.length; g++) {
  var pairs = [];
  for (var i = 0; i < groups[g].rows.length; i++) pairs.push({ name: ptText(groups[g].rows[i].name), value: ptText(groups[g].rows[i].value) });
  add("ops", "POST", "/std/bpm/containers/" + ptEncode(groups[g].container) + "/versions/" + ptEncode(groups[g].version) + "/env_vars", "", JSON.stringify({ pairs: pairs }));
}
```

Script *Map response*:

```javascript
// PT Env Save - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function finalResponse(g) { return response(g); }
function saveGroups() {
  var groups = [];
  var byKey = {};
  for (var i = 0; d.rows != null && i < d.rows.listLength; i++) {
    var row = d.rows[i];
    var key = ptTrim(row.container) + "/" + ptTrim(row.version);
    if (!byKey[key]) { byKey[key] = { container: ptTrim(row.container), version: ptTrim(row.version), rows: [] }; groups.push(byKey[key]); }
    byKey[key].rows.push(row);
  }
  return groups;
}
var groups = saveGroups();
function groupNames(g) { var names = []; for (var i = 0; i < g.rows.length; i++) names.push(ptText(g.rows[i].variable || g.rows[i].name)); return names.join(", "); }
tw.local.results = new tw.object.PTResult();
var stored = 0;
var errors = [];
var done = [];
for (var g = 0; g < groups.length; g++) {
  var r = finalResponse(g);
  if (ptFailed(r)) errors.push(groups[g].container + " / " + groups[g].version + " (" + groupNames(groups[g]) + "): " + ptErrorText(r));
  else { stored += groups[g].rows.length; done.push(groups[g].container + " / " + groups[g].version); }
}
tw.local.results.ok = groups.length > 0 && errors.length === 0;
tw.local.results.json = errors.join("\n");
if (groups.length === 0) tw.local.results.message = "Error: nothing to store";
else tw.local.results.message = (errors.length ? (stored ? "Info: " : "Error: ") : "Success: ") + stored + " value(s) stored in " + done.length + " of " + groups.length + " snapshot(s)"
  + (done.length ? " (" + done.join(", ") + ")" : "") + (errors.length ? " - refused: " + errors.join("; ") : "") + (stored ? " - the engine reads environment values when it loads the snapshot: live at once on BAW 24+ servers, on an 8.6.2 Process Center after the snapshot is reloaded" : "");
```

### 2c. `PT EPV List` (input PTVarCriteria, output PTEpvList, two stages)

EPV Manager: GET /ops/std/bpm/containers/{acronym}/versions per acronym (stage 1) -> GET .../versions/{version}/epvs?optional_parts=previous_values,future_values of every picked snapshot (stage 2) -> PTEpvRow per EPV variable matching the EPV / name / value filters (scheduled values, history text)

Script *Build requests*:

```javascript
// PT EPV List - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT EPV List", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
tw.local.stage = 1;
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
for (var a = 0; a < acronyms.length; a++) add("ops", "GET", "/std/bpm/containers/" + ptEncode(acronyms[a]) + "/versions", "", "");
```

Script *Build stage 2 requests*:

```javascript
// PT EPV List - Build stage 2 requests: the answers of stage 1 (responses 0 .. stageStart - 1) -> the RestCallParams of the second round of calls
var d = tw.local.data;
tw.local.stage = 2;
tw.local.stageStart = tw.local.responses.listLength;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.index = 0;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT EPV List", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
var picks = allPicks();
for (var p = 0; p < picks.length; p++) add("ops", "GET", "/std/bpm/containers/" + ptEncode(picks[p].container) + "/versions/" + ptEncode(picks[p].version) + "/epvs", "optional_parts=previous_values,future_values", "");
```

Script *Map response*:

```javascript
// PT EPV List - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function ptList(text) {
  var out = [];
  var parts = ptText(text).split(/[\s,;]+/);
  for (var i = 0; i < parts.length; i++) if (ptTrim(parts[i]) !== "" && out.indexOf(ptTrim(parts[i])) < 0) out.push(ptTrim(parts[i]));
  return out;
}
var acronyms = ptList(d.containers);
var wantedVersions = ptList(d.versions);
var scope = ptTrim(d.scope) || "all";
var MAX_SNAPSHOTS = 100;
function wantedVersion(v) {
  if (wantedVersions.length === 0) return true;
  for (var i = 0; i < wantedVersions.length; i++) {
    var w = wantedVersions[i].toUpperCase();
    if (ptText(v.version).toUpperCase() === w || ptText(v.version_name).toUpperCase() === w) return true;
  }
  return false;
}
// the snapshots of acronym number a (its stage 1 answer): not archived, the requested ones, the scope (all / active / newest), newest first
function pickVersions(a) {
  var r = response(a);
  if (ptFailed(r)) return [];
  var all = ((ptJson(r) || {}).versions) || [];
  var picked = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].archived || !wantedVersion(all[i])) continue;
    if (scope === "active" && !all[i].active) continue;
    picked.push(all[i]);
  }
  picked.sort(function (x, y) { var a1 = ptText(x.creation_date), b1 = ptText(y.creation_date); return a1 < b1 ? 1 : (a1 > b1 ? -1 : 0); });
  if (scope === "newest" && picked.length > 1) picked = [picked[0]];
  return picked;
}
function allPicks() {
  var out = [];
  for (var a = 0; a < acronyms.length; a++) {
    var versions = pickVersions(a);
    for (var k = 0; k < versions.length && out.length < MAX_SNAPSHOTS; k++) {
      out.push({ container: ptText(versions[k].container) || acronyms[a], version: ptText(versions[k].version), active: versions[k].active ? "yes" : "no" });
    }
  }
  return out;
}
function contains(text, part) { return ptTrim(part) === "" || ptText(text).toLowerCase().indexOf(ptTrim(part).toLowerCase()) >= 0; }
// stage 1 refusals (unknown acronym, ...) and the empty cases, as one message part
function lookupProblems() {
  var problems = [];
  for (var a = 0; a < acronyms.length; a++) if (ptFailed(response(a))) problems.push(acronyms[a] + ": " + ptErrorText(response(a)));
  return problems;
}
tw.local.results = new tw.object.PTEpvList();
tw.local.results.rows = new tw.object.listOf.PTEpvRow();
var problems = lookupProblems();
var picks = (acronyms.length === 0) ? [] : allPicks();
if (acronyms.length === 0) {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: enter at least one process application or toolkit acronym";
} else {
  for (var p = 0; p < picks.length; p++) {
    var r = response(tw.local.stageStart + p);
    if (ptFailed(r)) { problems.push(picks[p].container + " / " + picks[p].version + ": " + ptErrorText(r)); continue; }
    var json = ptJson(r) || {};
    var epvs = json.epvs || [];
    for (var e = 0; e < epvs.length; e++) {
      if (!contains(epvs[e].name, d.epv)) continue;
      var vars = epvs[e].epv_variables || [];
      for (var i = 0; i < vars.length; i++) {
        var v = vars[i];
        if (!contains(v.name, d.name) || !contains(v.current_value, d.value)) continue;
        var row = new tw.object.PTEpvRow();
        row.container = picks[p].container;
        row.version = picks[p].version;
        row.active = picks[p].active;
        row.epv = ptText(epvs[e].name);
        row.epvContainer = ptText(epvs[e].container_acronym);
        row.variable = ptText(v.name);
        row.type = ptText(v.class_type);
        row.value = ptText(v.current_value);
        row.original = row.value;
        row.description = ptText(v.description).replace(/<[^>]*>/g, "");
        var future = v.future_variable_values || [];
        var scheduled = [];
        for (var f = 0; f < future.length; f++) scheduled.push(ptText(future[f].value) + " from " + ptDate(future[f].effective_date));
        row.scheduled = scheduled.join("; ");
        var lines = ["EPV " + row.epv + " / " + row.variable + " of " + row.container + " / " + row.version + (row.type ? " (" + row.type + ")" : ""),
                     "Current value: " + row.value];
        if (v.default_value !== undefined) lines.push("Default value: " + ptText(v.default_value));
        if (row.description) lines.push("Description: " + row.description);
        lines.push("", "Scheduled values (" + future.length + "):");
        for (var f2 = 0; f2 < future.length; f2++) lines.push("  from " + ptDate(future[f2].effective_date) + ": " + ptText(future[f2].value) + (future[f2].modified_by ? "  (set by " + future[f2].modified_by + " " + ptDate(future[f2].modified_date) + ")" : ""));
        var previous = v.previous_variable_values || [];
        lines.push("", "Previous values (" + previous.length + "):");
        for (var h = 0; h < previous.length; h++) lines.push("  from " + ptDate(previous[h].effective_date) + ": " + ptText(previous[h].value) + (previous[h].modified_by ? "  (set by " + previous[h].modified_by + " " + ptDate(previous[h].modified_date) + ")" : "") + (previous[h].reason ? "  reason: " + previous[h].reason : ""));
        row.history = lines.join("\n");
        tw.local.results.rows.insertIntoList(tw.local.results.rows.listLength, row);
      }
    }
  }
  var count = tw.local.results.rows.listLength;
  tw.local.results.ok = problems.length === 0 || count > 0;
  if (problems.length && !count) tw.local.results.message = "Error: " + problems.join("; ");
  else tw.local.results.message = "Info: " + count + " EPV variable(s) in " + picks.length + " snapshot(s)"
    + (picks.length >= MAX_SNAPSHOTS ? " (first " + MAX_SNAPSHOTS + " snapshots - narrow the filter)" : "")
    + (picks.length === 0 && !problems.length ? " - no snapshot matches the filter (named, not archived" + (scope === "active" ? ", active" : "") + ")" : "")
    + (count ? " - edit the Value column and click Save changes, or select rows and click Set value for selected" : "")
    + (problems.length ? " - refused: " + problems.join("; ") : "");
}
```

### 2d. `PT EPV Save` (input PTEpvSave, output PTResult, two stages)

EPV Manager: the edited rows grouped by snapshot -> POST /ops/std/bpm/containers/{acronym}/versions/{version}/epvs {variable_value_details: [{epv_name, epv_variable_name, epv_variable_value, effective_date, reason}]} per snapshot; stage 2 repeats a refused request without reason / epv_container_acronym (8.6.2 does not know them)

Script *Build requests*:

```javascript
// PT EPV Save - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT EPV Save", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
tw.local.stage = 1;
function saveGroups() {
  var groups = [];
  var byKey = {};
  for (var i = 0; d.rows != null && i < d.rows.listLength; i++) {
    var row = d.rows[i];
    var key = ptTrim(row.container) + "/" + ptTrim(row.version);
    if (!byKey[key]) { byKey[key] = { container: ptTrim(row.container), version: ptTrim(row.version), rows: [] }; groups.push(byKey[key]); }
    byKey[key].rows.push(row);
  }
  return groups;
}
var groups = saveGroups();
function groupNames(g) { var names = []; for (var i = 0; i < g.rows.length; i++) names.push(ptText(g.rows[i].variable || g.rows[i].name)); return names.join(", "); }
function epvBody(g, optional) {
  var details = [];
  for (var i = 0; i < g.rows.length; i++) {
    var row = g.rows[i];
    var detail = { epv_name: ptText(row.epv), epv_variable_name: ptText(row.variable), epv_variable_value: ptText(row.value) };
    if (ptTrim(d.effective) !== "") detail.effective_date = ptTrim(d.effective).replace(/\.\d{3}Z$/, "Z");
    if (optional && ptTrim(d.reason) !== "") detail.reason = ptTrim(d.reason);
    if (optional && ptTrim(row.epvContainer) !== "" && ptTrim(row.epvContainer) !== g.container) detail.epv_container_acronym = ptTrim(row.epvContainer);
    details.push(detail);
  }
  return JSON.stringify({ variable_value_details: details });
}
function epvPath(g) { return "/std/bpm/containers/" + ptEncode(g.container) + "/versions/" + ptEncode(g.version) + "/epvs"; }
function unknownField(r) { return ptFailed(r) && /Unrecognized field/.test(ptBody(r)); }
for (var g = 0; g < groups.length; g++) add("ops", "POST", epvPath(groups[g]), "", epvBody(groups[g], true));
```

Script *Build stage 2 requests*:

```javascript
// PT EPV Save - Build stage 2 requests: the answers of stage 1 (responses 0 .. stageStart - 1) -> the RestCallParams of the second round of calls
var d = tw.local.data;
tw.local.stage = 2;
tw.local.stageStart = tw.local.responses.listLength;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.index = 0;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT EPV Save", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
function saveGroups() {
  var groups = [];
  var byKey = {};
  for (var i = 0; d.rows != null && i < d.rows.listLength; i++) {
    var row = d.rows[i];
    var key = ptTrim(row.container) + "/" + ptTrim(row.version);
    if (!byKey[key]) { byKey[key] = { container: ptTrim(row.container), version: ptTrim(row.version), rows: [] }; groups.push(byKey[key]); }
    byKey[key].rows.push(row);
  }
  return groups;
}
var groups = saveGroups();
function groupNames(g) { var names = []; for (var i = 0; i < g.rows.length; i++) names.push(ptText(g.rows[i].variable || g.rows[i].name)); return names.join(", "); }
function epvBody(g, optional) {
  var details = [];
  for (var i = 0; i < g.rows.length; i++) {
    var row = g.rows[i];
    var detail = { epv_name: ptText(row.epv), epv_variable_name: ptText(row.variable), epv_variable_value: ptText(row.value) };
    if (ptTrim(d.effective) !== "") detail.effective_date = ptTrim(d.effective).replace(/\.\d{3}Z$/, "Z");
    if (optional && ptTrim(d.reason) !== "") detail.reason = ptTrim(d.reason);
    if (optional && ptTrim(row.epvContainer) !== "" && ptTrim(row.epvContainer) !== g.container) detail.epv_container_acronym = ptTrim(row.epvContainer);
    details.push(detail);
  }
  return JSON.stringify({ variable_value_details: details });
}
function epvPath(g) { return "/std/bpm/containers/" + ptEncode(g.container) + "/versions/" + ptEncode(g.version) + "/epvs"; }
function unknownField(r) { return ptFailed(r) && /Unrecognized field/.test(ptBody(r)); }
for (var g = 0; g < groups.length; g++) if (unknownField(response(g))) add("ops", "POST", epvPath(groups[g]), "", epvBody(groups[g], false));
```

Script *Map response*:

```javascript
// PT EPV Save - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function epvBody(g, optional) {
  var details = [];
  for (var i = 0; i < g.rows.length; i++) {
    var row = g.rows[i];
    var detail = { epv_name: ptText(row.epv), epv_variable_name: ptText(row.variable), epv_variable_value: ptText(row.value) };
    if (ptTrim(d.effective) !== "") detail.effective_date = ptTrim(d.effective).replace(/\.\d{3}Z$/, "Z");
    if (optional && ptTrim(d.reason) !== "") detail.reason = ptTrim(d.reason);
    if (optional && ptTrim(row.epvContainer) !== "" && ptTrim(row.epvContainer) !== g.container) detail.epv_container_acronym = ptTrim(row.epvContainer);
    details.push(detail);
  }
  return JSON.stringify({ variable_value_details: details });
}
function epvPath(g) { return "/std/bpm/containers/" + ptEncode(g.container) + "/versions/" + ptEncode(g.version) + "/epvs"; }
function unknownField(r) { return ptFailed(r) && /Unrecognized field/.test(ptBody(r)); }
function finalResponse(g) {   // the stage 2 answer replaces a refusal of the optional fields
  var retried = 0;
  for (var k = 0; k < g; k++) if (unknownField(response(k))) retried++;
  return unknownField(response(g)) ? response(tw.local.stageStart + retried) : response(g);
}
function saveGroups() {
  var groups = [];
  var byKey = {};
  for (var i = 0; d.rows != null && i < d.rows.listLength; i++) {
    var row = d.rows[i];
    var key = ptTrim(row.container) + "/" + ptTrim(row.version);
    if (!byKey[key]) { byKey[key] = { container: ptTrim(row.container), version: ptTrim(row.version), rows: [] }; groups.push(byKey[key]); }
    byKey[key].rows.push(row);
  }
  return groups;
}
var groups = saveGroups();
function groupNames(g) { var names = []; for (var i = 0; i < g.rows.length; i++) names.push(ptText(g.rows[i].variable || g.rows[i].name)); return names.join(", "); }
tw.local.results = new tw.object.PTResult();
var stored = 0;
var errors = [];
var done = [];
for (var g = 0; g < groups.length; g++) {
  var r = finalResponse(g);
  if (ptFailed(r)) errors.push(groups[g].container + " / " + groups[g].version + " (" + groupNames(groups[g]) + "): " + ptErrorText(r));
  else { stored += groups[g].rows.length; done.push(groups[g].container + " / " + groups[g].version); }
}
tw.local.results.ok = groups.length > 0 && errors.length === 0;
tw.local.results.json = errors.join("\n");
if (groups.length === 0) tw.local.results.message = "Error: nothing to store";
else tw.local.results.message = (errors.length ? (stored ? "Info: " : "Error: ") : "Success: ") + stored + " EPV value(s) stored in " + done.length + " of " + groups.length + " snapshot(s)"
  + (done.length ? " (" + done.join(", ") + ")" : "") + (errors.length ? " - refused: " + errors.join("; ") : "") + (stored ? " - EPV values apply from their effective date (empty = now)" : "");
```

### `PT Env To CSV` (service flow, one script *Format CSV*; input `data` PTEnvList, output `results` PTCsv - copy *PT Instances To CSV*)

```javascript
// rows of the bound result object -> CSV text (shown in a dialog to copy; the coach cannot start a download without script)
var cols = [["container", "App"], ["version", "Snapshot"], ["active", "Active"], ["name", "Variable"], ["value", "Value (edit here)"], ["original", "Stored value"]];
var lines = [];
var head = [];
for (var c = 0; c < cols.length; c++) head.push('"' + cols[c][1].replace(/"/g, '""') + '"');
lines.push(head.join(","));
var list = (tw.local.data == null) ? null : tw.local.data.rows;
var n = (list == null) ? 0 : list.listLength;
for (var i = 0; i < n; i++) {
  var cells = [];
  for (var c = 0; c < cols.length; c++) cells.push('"' + ptText(list[i][cols[c][0]]).replace(/"/g, '""') + '"');
  lines.push(cells.join(","));
}
tw.local.results = new tw.object.PTCsv();
tw.local.results.csv = lines.join("\n");
tw.local.results.filename = "environment-variables.csv";
tw.local.results.ok = true;
tw.local.results.message = "Info: " + n + " row(s) exported as CSV (environment-variables.csv) - copy the text from the dialog";
```

### `PT EPV To CSV` (service flow, one script *Format CSV*; input `data` PTEpvList, output `results` PTCsv - copy *PT Instances To CSV*)

```javascript
// rows of the bound result object -> CSV text (shown in a dialog to copy; the coach cannot start a download without script)
var cols = [["container", "App"], ["version", "Snapshot"], ["active", "Active"], ["epv", "EPV"], ["variable", "Variable"], ["type", "Type"], ["value", "Value (edit here)"], ["original", "Stored value"], ["scheduled", "Scheduled values"], ["description", "Description"]];
var lines = [];
var head = [];
for (var c = 0; c < cols.length; c++) head.push('"' + cols[c][1].replace(/"/g, '""') + '"');
lines.push(head.join(","));
var list = (tw.local.data == null) ? null : tw.local.data.rows;
var n = (list == null) ? 0 : list.listLength;
for (var i = 0; i < n; i++) {
  var cells = [];
  for (var c = 0; c < cols.length; c++) cells.push('"' + ptText(list[i][cols[c][0]]).replace(/"/g, '""') + '"');
  lines.push(cells.join(","));
}
tw.local.results = new tw.object.PTCsv();
tw.local.results.csv = lines.join("\n");
tw.local.results.filename = "epvs.csv";
tw.local.results.ok = true;
tw.local.results.message = "Info: " + n + " row(s) exported as CSV (epvs.csv) - copy the text from the dialog";
```

## 3. Coach views

### 3a. `ENV Manager`

Binding PTEpvList / PTEnvList; configuration options `search` (PTEnvList), `criteria` (PTVarCriteria), `action` (PTResult), `csv` (PTCsv).
Build it like the other tool views (Vertical Layout `Root`, Output Text `StatusLine` first, message dialog `Msg` / `MsgText` last):

| Item | Control | Settings |
|---|---|---|
| Inputs | Horizontal Layout (wrap) | Text `Containers` *Application / toolkit acronyms (comma separated)* -> `tw.options.criteria.containers`; Text `Versions` *Snapshots (comma separated; empty = all)* -> `.versions`; Single Select `Scope` *Snapshots to list* -> `.scope`, static list all = *All named snapshots*, active = *Active snapshots only*, newest = *Newest snapshot only*; Text `Name` *Variable name contains* -> `.name`; Text `Value` *Value contains* -> `.value` |
| Actions | Horizontal Layout (wrap) | Buttons *Lookup* (primary), *Save changes*, *Set value for selected*, *Discard changes* |
| Rows | Table, multiple selection, page size 20 | bound to `tw.options.search.rows[]`; columns container *App*, version *Snapshot*, active *Active*, name *Variable*, value *Value (edit here)*, original *Stored value*; the **value** column holds a **Text** control bound to `tw.options.search.rows.currentItem.value`, every other column an Output Text |
| ExportRows | Button *Export CSV* | On click `${SvcCsv}.execute();` |
| SetValue | Modal Section *Set value for selected* (primary *Store*, secondary *Cancel*, width 900px) | Output Text `SetValueInfo`, Text Area `NewValue` *New value* (unbound) |
| ConfirmSave | Modal Section *Please confirm* (primary *Confirm*, secondary *Cancel*, color W, width 700px) | Output Text `ConfirmSaveText` |
| SvcSearch | Service Call | **PT Env List**, input `tw.options.criteria`, result `tw.options.search` |
| SvcSave | Service Call | **PT Env Save**, result `tw.options.action` |
| SvcCsv | Service Call | **PT Env To CSV**, input `tw.options.search`, result `tw.options.csv`; plus the CSV dialog `CsvDialog` as in the other tabs |

Events (secondary buttons of the dialogs: `${<Dialog>}.setVisible(false);`):

BtnLookup - eventON_CLICK:

```javascript
${StatusLine}.setText(""); ${SvcSearch}.execute();
```

BtnSavechanges - eventON_CLICK:

```javascript
var ch = (${Rows}.getRecords() || []).filter(function (r) { return String(r.value == null ? "" : r.value) != String(r.original == null ? "" : r.original); }); if (!ch.length) { ${StatusLine}.setText("Error: no changed value - edit the Value column first (Lookup discards the edits)"); } else { ${ConfirmSaveText}.setText("Store " + ch.length + " changed value(s)" + ": " + ch.slice(0, 8).map(function (r) { return (r.container + " / " + r.version + " / " + r.name); }).join(", ") + (ch.length > 8 ? ", ..." : "") + "?"); ${ConfirmSave}.show(); }
```

BtnSetvalueforselected - eventON_CLICK:

```javascript
var sel = ${Rows}.getSelectedRecords() || []; if (!sel.length) { ${StatusLine}.setText("Error: select at least one row"); } else { ${NewValue}.setText(sel[0].value == null ? "" : String(sel[0].value)); ${SetValueInfo}.setText("One new value for " + sel.length + " selected row(s): " + sel.slice(0, 8).map(function (r) { return (r.container + " / " + r.version + " / " + r.name); }).join(", ") + (sel.length > 8 ? ", ..." : "")); ${SetValue}.show(); }
```

BtnDiscardchanges - eventON_CLICK:

```javascript
${StatusLine}.setText(""); ${SvcSearch}.execute();
```

ExportRows - eventON_CLICK:

```javascript
${SvcCsv}.execute();
```

SetValue - eventPRIMARY_ON_CLICK:

```javascript
${SetValue}.setVisible(false); var sel = ${Rows}.getSelectedRecords() || []; var nv = ${NewValue}.getText(); ${SvcSave}.execute({ rows: sel.map(function (r) { var p = (function (r) { return { container: r.container, version: r.version, name: r.name, value: r.value, original: r.original }; })(r); p.value = nv; return p; }) });
```

ConfirmSave - eventPRIMARY_ON_CLICK:

```javascript
${ConfirmSave}.setVisible(false); var ch = (${Rows}.getRecords() || []).filter(function (r) { return String(r.value == null ? "" : r.value) != String(r.original == null ? "" : r.original); }); ${SvcSave}.execute({ rows: ch.map(function (r) { return { container: r.container, version: r.version, name: r.name, value: r.value, original: r.original }; }) });
```

SvcSearch - eventON_SVCRESULT:

```javascript
var cur = ${StatusLine}.getText(); if (!cur || cur.indexOf("Info:") == 0 || cur.indexOf("Error:") == 0) { ${StatusLine}.setText(result ? result.message : ""); }
```

SvcSearch - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

SvcSave - eventON_SVCRESULT:

```javascript
${StatusLine}.setText(result ? result.message : ""); if (result && result.message && result.message.indexOf("Info:") != 0) { ${MsgText}.setText(result.message); ${Msg}.show(); } if (result && result.ok) { ${SvcSearch}.execute(); }
```

SvcSave - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

SvcCsv - eventON_SVCRESULT:

```javascript
${StatusLine}.setText(result ? result.message : ""); ${CsvDialog}.show();
```

SvcCsv - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

CsvDialog - eventPRIMARY_ON_CLICK:

```javascript
${CsvDialog}.setVisible(false);
```

### 3b. `EPV Manager`

Binding PTEpvList / PTEnvList; configuration options `search` (PTEpvList), `criteria` (PTVarCriteria), `action` (PTResult), `csv` (PTCsv).
Build it like the other tool views (Vertical Layout `Root`, Output Text `StatusLine` first, message dialog `Msg` / `MsgText` last):

| Item | Control | Settings |
|---|---|---|
| Inputs | Horizontal Layout (wrap) | Text `Containers` *Application / toolkit acronyms (comma separated)* -> `tw.options.criteria.containers`; Text `Versions` *Snapshots (comma separated; empty = all)* -> `.versions`; Single Select `Scope` *Snapshots to list* -> `.scope`, static list all = *All named snapshots*, active = *Active snapshots only*, newest = *Newest snapshot only*; Text `Epv` *EPV name contains* -> `.epv`; Text `Name` *Variable name contains* -> `.name`; Text `Value` *Value contains* -> `.value` |
| Actions | Horizontal Layout (wrap) | Buttons *Lookup* (primary), *Save changes*, *Set value for selected*, *History*, *Discard changes* |
| ChangeOptions | Horizontal Layout (wrap) | Date Time Picker `Effective` *Effective from (empty = now)* (time picker on, unbound); Text `Reason` *Reason of the change (kept in the EPV history; 8.6.2 ignores it)* (unbound) |
| Rows | Table, multiple selection, page size 20 | bound to `tw.options.search.rows[]`; columns container *App*, version *Snapshot*, active *Active*, epv *EPV*, variable *Variable*, type *Type*, value *Value (edit here)*, original *Stored value*, scheduled *Scheduled values*; the **value** column holds a **Text** control bound to `tw.options.search.rows.currentItem.value`, every other column an Output Text |
| ExportRows | Button *Export CSV* | On click `${SvcCsv}.execute();` |
| SetValue | Modal Section *Set value for selected* (primary *Store*, secondary *Cancel*, width 900px) | Output Text `SetValueInfo`, Text Area `NewValue` *New value* (unbound) |
| ConfirmSave | Modal Section *Please confirm* (primary *Confirm*, secondary *Cancel*, color W, width 700px) | Output Text `ConfirmSaveText` |
| History | Modal Section *EPV variable history* (primary *Close*, width 1000px) | Text Area `HistoryText` *Current, scheduled and previous values* (unbound) |
| SvcSearch | Service Call | **PT EPV List**, input `tw.options.criteria`, result `tw.options.search` |
| SvcSave | Service Call | **PT EPV Save**, result `tw.options.action` |
| SvcCsv | Service Call | **PT EPV To CSV**, input `tw.options.search`, result `tw.options.csv`; plus the CSV dialog `CsvDialog` as in the other tabs |

Events (secondary buttons of the dialogs: `${<Dialog>}.setVisible(false);`):

BtnLookup - eventON_CLICK:

```javascript
${StatusLine}.setText(""); ${SvcSearch}.execute();
```

BtnSavechanges - eventON_CLICK:

```javascript
var ch = (${Rows}.getRecords() || []).filter(function (r) { return String(r.value == null ? "" : r.value) != String(r.original == null ? "" : r.original); }); var dt = ${Effective}.getDate ? ${Effective}.getDate() : ${Effective}.getData(); var eff = dt ? new Date(dt).toISOString() : ""; if (!ch.length) { ${StatusLine}.setText("Error: no changed value - edit the Value column first (Lookup discards the edits)"); } else { ${ConfirmSaveText}.setText("Store " + ch.length + " changed value(s)" + (eff ? " effective from " + eff : " effective now") + ": " + ch.slice(0, 8).map(function (r) { return (r.container + " / " + r.version + " / " + r.epv + "." + r.variable); }).join(", ") + (ch.length > 8 ? ", ..." : "") + "?"); ${ConfirmSave}.show(); }
```

BtnSetvalueforselected - eventON_CLICK:

```javascript
var sel = ${Rows}.getSelectedRecords() || []; if (!sel.length) { ${StatusLine}.setText("Error: select at least one row"); } else { ${NewValue}.setText(sel[0].value == null ? "" : String(sel[0].value)); ${SetValueInfo}.setText("One new value for " + sel.length + " selected row(s): " + sel.slice(0, 8).map(function (r) { return (r.container + " / " + r.version + " / " + r.epv + "." + r.variable); }).join(", ") + (sel.length > 8 ? ", ..." : "")); ${SetValue}.show(); }
```

BtnHistory - eventON_CLICK:

```javascript
var sel = ${Rows}.getSelectedRecords() || []; if (!sel.length) { ${StatusLine}.setText("Error: select at least one row"); } else { ${HistoryText}.setText(sel[0].history); ${History}.show(); }
```

BtnDiscardchanges - eventON_CLICK:

```javascript
${StatusLine}.setText(""); ${SvcSearch}.execute();
```

ExportRows - eventON_CLICK:

```javascript
${SvcCsv}.execute();
```

SetValue - eventPRIMARY_ON_CLICK:

```javascript
${SetValue}.setVisible(false); var sel = ${Rows}.getSelectedRecords() || []; var dt = ${Effective}.getDate ? ${Effective}.getDate() : ${Effective}.getData(); var eff = dt ? new Date(dt).toISOString() : ""; var nv = ${NewValue}.getText(); ${SvcSave}.execute({ rows: sel.map(function (r) { var p = (function (r) { return { container: r.container, version: r.version, epv: r.epv, epvContainer: r.epvContainer, variable: r.variable, value: r.value, original: r.original }; })(r); p.value = nv; return p; }), effective: eff, reason: ${Reason}.getText() });
```

ConfirmSave - eventPRIMARY_ON_CLICK:

```javascript
${ConfirmSave}.setVisible(false); var ch = (${Rows}.getRecords() || []).filter(function (r) { return String(r.value == null ? "" : r.value) != String(r.original == null ? "" : r.original); }); var dt = ${Effective}.getDate ? ${Effective}.getDate() : ${Effective}.getData(); var eff = dt ? new Date(dt).toISOString() : ""; ${SvcSave}.execute({ rows: ch.map(function (r) { return { container: r.container, version: r.version, epv: r.epv, epvContainer: r.epvContainer, variable: r.variable, value: r.value, original: r.original }; }), effective: eff, reason: ${Reason}.getText() });
```

History - eventPRIMARY_ON_CLICK:

```javascript
${History}.setVisible(false);
```

SvcSearch - eventON_SVCRESULT:

```javascript
var cur = ${StatusLine}.getText(); if (!cur || cur.indexOf("Info:") == 0 || cur.indexOf("Error:") == 0) { ${StatusLine}.setText(result ? result.message : ""); }
```

SvcSearch - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

SvcSave - eventON_SVCRESULT:

```javascript
${StatusLine}.setText(result ? result.message : ""); if (result && result.message && result.message.indexOf("Info:") != 0) { ${MsgText}.setText(result.message); ${Msg}.show(); } if (result && result.ok) { ${SvcSearch}.execute(); }
```

SvcSave - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

SvcCsv - eventON_SVCRESULT:

```javascript
${StatusLine}.setText(result ? result.message : ""); ${CsvDialog}.show();
```

SvcCsv - eventON_SVCERROR:

```javascript
${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();
```

CsvDialog - eventPRIMARY_ON_CLICK:

```javascript
${CsvDialog}.setVisible(false);
```

## 4. Dashboard (client-side human service `Process Tools REST`)

Variables (private, default value script `var autoObject = new tw.object.<Type>(); autoObject`):
`EnvManager_result` PTEnvList, `EnvManager_search` PTEnvList, `EnvManager_criteria` PTVarCriteria, `EnvManager_action` PTResult,
`EnvManager_csv` PTCsv; `EpvManager_result` PTEpvList, `EpvManager_search` PTEpvList, `EpvManager_criteria` PTVarCriteria,
`EpvManager_action` PTResult, `EpvManager_csv` PTCsv.

Coach: in the Tab Section *Process*, after *Execute JavaScript*, add the views **ENV Manager** (control id `EnvManager1`, binding
`tw.local.EnvManager_result`) and **EPV Manager** (`EpvManager1`, binding `tw.local.EpvManager_result`); configuration search / criteria /
action / csv = the variables above. No change to Initialize or the environment variables.
