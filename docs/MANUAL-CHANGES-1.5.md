# Process Tools REST 1.4 -> 1.5.1: Fire Timers Selective (for manual replication in another environment)

Two new service flows, one new coach view and one new tab in the dashboard. **No new business object**: the tab reuses `PTIdList`,
`PTInstanceSearch`, `PTBulkPosition` (timers in `locations`, timer tokens in `tokens`), `PTBulkMove` (the fire request) and `PTResult`;
the services *PT Parse Instance Ids* (1.4) and *PT Bulk Tokens To CSV* are reused as they are. Nothing existing changes.
Order of work: 1 service flows, 2 coach view, 3 dashboard.

What the tab does: paste instance ids -> *Analyze timers* lists the instances and every timer that holds a token in them, grouped per
timer with the **common timer** (the one most instances wait on) first -> select **the one timer** to fire -> *Fire timers (selected instances)* / *(all instances)* -> confirmation -> one classic
`fireTimer` call per instance (the first token at that timer) -> report, then the analysis reloads.

Safety rule (1.5.1): exactly one timer per fire, one token per instance. There is no "every pending timer" option - firing all timers of
a list of instances at once is too dangerous for a bulk tool. Without a selected timer the button answers with an error and the flow
refuses an empty timer key without making any call. An instance holding more than one token at the chosen timer gets only the first one
fired; the report lists what was left pending. (1.5 was imported on 8.6.2 with the "none = every timer" option; 1.5.1 replaces it.)

Timers found: intermediate timer events (the token sits on the step itself: `diagram.step[].activityType == "timer"`, `step.tokenID`)
and timers attached to an activity (`diagram.step[].attachedTimer[].tokenID`). The *Timers* tab only lists the attached ones; an
intermediate timer's token is fired with the same `POST /process/{id}?action=fireTimer&timerTokenId=` call (verified on 8.6.2).

## 1. Service flows

Both are operation flows exactly like the others (Ajax exposed, input `data`, output `results`, variables `requests` RestCallParams[],
`index` Integer, `responses` Map[], `returnValue` Map, `csrftoken` String, `credDetails` NameValuePair): Start -> *Get CSRF Token* ->
*Build requests* -> gateway *Requests left?* (`tw.local.index < tw.local.requests.listLength`) -> *Call REST* (input
`tw.local.requests[tw.local.index]`, output `tw.local.returnValue`) -> *Collect response* -> back to the gateway; default flow -> *Map response* -> End.
The easiest way: **copy PT Bulk Token Position** for the first and **PT Bulk Move Tokens** for the second (same diagram, same variables)
and replace the scripts and the input / output types.

### 1a. `PT Bulk Timer Position` (copy of *PT Bulk Token Position*; input PTInstanceSearch, output PTBulkPosition - unchanged)

Script *Build requests*:

```javascript
// PT Bulk Timer Position - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Bulk Timer Position", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
// one classic diagram per listed instance (the timer tokens are part of the diagram steps)
var rows = (d == null || d.rows == null) ? 0 : d.rows.listLength;
for (var i = 0; i < rows; i++) add("rest", "GET", "/process/" + ptNumericId(d.rows[i].id), "parts=diagram", "");
```

Script *Map response*:

```javascript
// PT Bulk Timer Position - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function timerTokens(returnValue) {
  var found = [];
  var data = (ptJson(returnValue) || {}).data || {};
  var steps = (data.diagram || {}).step || [];
  for (var s = 0; s < steps.length; s++) {
    var step = steps[s];
    if (ptText(step.activityType) === "timer") {
      var own = step.tokenID || [];
      for (var k = 0; k < own.length; k++) found.push({ key: ptText(step.ID), name: ptText(step.name), kind: "timer event", tokenId: ptText(own[k]) });
    }
    var attached = step.attachedTimer || [];
    for (var a = 0; a < attached.length; a++) {
      var tokens = attached[a].tokenID || [];
      for (var m = 0; m < tokens.length; m++) {
        found.push({ key: ptText(step.ID) + "/" + ptText(attached[a].ID || attached[a].name), name: ptText(step.name) + " / " + ptText(attached[a].name), kind: "attached timer", tokenId: ptText(tokens[m]) });
      }
    }
  }
  return found;
}
tw.local.results = new tw.object.PTBulkPosition();
tw.local.results.locations = new tw.object.listOf.BulkLocation();
tw.local.results.steps = new tw.object.listOf.StepInfo();
tw.local.results.tokens = new tw.object.listOf.BulkToken();
var total = (d == null || d.rows == null) ? 0 : d.rows.listLength;
var errors = [];
var byTimer = {};     // timer key -> { name, kind, instances: { id: true }, count, tokens }
var order = [];       // timer keys in the order first seen
var pending = 0;      // timer tokens found over all instances
for (var i = 0; i < total; i++) {
  var id = ptText(d.rows[i].id);
  var r = response(i);
  if (ptFailed(r)) {
    errors.push(id + ": " + ptErrorText(r));
    continue;
  }
  var timers = timerTokens(r);
  for (var t = 0; t < timers.length; t++) {
    var key = timers[t].key;
    if (!byTimer[key]) {
      byTimer[key] = { name: timers[t].name, kind: timers[t].kind, instances: {}, count: 0, tokens: 0 };
      order.push(key);
    }
    byTimer[key].tokens++;
    if (!byTimer[key].instances[id]) {
      byTimer[key].instances[id] = true;
      byTimer[key].count++;
    }
    var token = new tw.object.BulkToken();
    token.instance = id;
    token.instanceName = ptText(d.rows[i].name);
    token.tokenId = timers[t].tokenId;
    token.step = timers[t].name;
    token.flowObjectId = key;
    token.detail = timers[t].kind;
    tw.local.results.tokens.insertIntoList(tw.local.results.tokens.listLength, token);
    pending++;
  }
}
var analysed = total - errors.length;
// the common timer = the timer that most of the analysed instances are waiting on (first row of the timers table)
order.sort(function (a, b) { return byTimer[b].count - byTimer[a].count; });
for (var o = 0; o < order.length; o++) {
  var location = new tw.object.BulkLocation();
  location.step = byTimer[order[o]].name;
  location.stepType = byTimer[order[o]].kind;
  location.flowObjectId = order[o];
  location.instances = byTimer[order[o]].count;
  location.tokens = byTimer[order[o]].tokens;
  location.share = byTimer[order[o]].count + " of " + analysed;
  tw.local.results.locations.insertIntoList(tw.local.results.locations.listLength, location);
}
tw.local.results.common = order.length ? order[0] : "";
tw.local.results.commonName = order.length ? byTimer[order[0]].name : "";
tw.local.results.ok = (total > 0 && errors.length === 0);
if (total === 0) {
  tw.local.results.message = "Error: no instances - paste instance ids first";
} else if (analysed === 0) {
  tw.local.results.message = "Error: no instance could be read - " + errors.join("; ");
} else {
  tw.local.results.message = "Info: " + analysed + " instance(s) analysed, " + pending + " timer token(s) at " + order.length + " timer(s)"
    + (order.length ? "; common timer: '" + tw.local.results.commonName + "' (" + byTimer[order[0]].count + " of " + analysed + " instance(s))" : "; no timer pending")
    + (errors.length ? "; not read: " + errors.join("; ") : "")
    + " - select the one timer to fire (the common timer is the first row), then Fire timers";
}
```

### 1b. `PT Bulk Fire Timers` (copy of *PT Bulk Move Tokens*, two stages; input PTBulkMove, output PTResult - unchanged)

`source` = the timer key of the selected row (`flowObjectId` of the timers table), `sourceName` = its name; `source` empty = error, no call.
`target` / `targetName` of PTBulkMove are not used. Variables additionally `stage` and `stageStart` (Integer), gateway *Second stage?*
(`tw.local.stage == 1`) -> *Build stage 2 requests* -> back to *Requests left?*, as in the copied flow.

Script *Build requests*:

```javascript
// PT Bulk Fire Timers - Build requests: the input business object -> one RestCallParams per HTTP call (manual parameter translation)
var d = tw.local.data;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.responses = new tw.object.listOf.Map();
tw.local.index = 0;
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Bulk Fire Timers", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
tw.local.stage = 1;
// stage 1: the current diagram of every instance (fresh timer token ids); stage 2 fires ONE token per instance, at the ONE chosen timer.
// No timer chosen = no call at all: firing every pending timer of a list of instances is never offered (too dangerous for a bulk tool).
if (ptText(d.source) !== "") {
  for (var i = 0; i < d.ids.listLength; i++) add("rest", "GET", "/process/" + ptNumericId(d.ids[i]), "parts=diagram", "");
}
```

Script *Build stage 2 requests*:

```javascript
// PT Bulk Fire Timers - Build stage 2 requests: the answers of stage 1 (responses 0 .. stageStart - 1) -> the RestCallParams of the second round of calls
var d = tw.local.data;
tw.local.stage = 2;
tw.local.stageStart = tw.local.responses.listLength;
tw.local.requests = new tw.object.listOf.RestCallParams();
tw.local.index = 0;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function add(family, method, path, query, body) {
  tw.local.requests.insertIntoList(tw.local.requests.listLength, ptRequest("PT Bulk Fire Timers", family, method, path, query, body, tw.local.csrftoken, tw.local.credDetails));
}
function timerTokens(returnValue) {
  var found = [];
  var data = (ptJson(returnValue) || {}).data || {};
  var steps = (data.diagram || {}).step || [];
  for (var s = 0; s < steps.length; s++) {
    var step = steps[s];
    if (ptText(step.activityType) === "timer") {
      var own = step.tokenID || [];
      for (var k = 0; k < own.length; k++) found.push({ key: ptText(step.ID), name: ptText(step.name), kind: "timer event", tokenId: ptText(own[k]) });
    }
    var attached = step.attachedTimer || [];
    for (var a = 0; a < attached.length; a++) {
      var tokens = attached[a].tokenID || [];
      for (var m = 0; m < tokens.length; m++) {
        found.push({ key: ptText(step.ID) + "/" + ptText(attached[a].ID || attached[a].name), name: ptText(step.name) + " / " + ptText(attached[a].name), kind: "attached timer", tokenId: ptText(tokens[m]) });
      }
    }
  }
  return found;
}
function atTimer(timers) {   // the tokens at the one chosen timer
  var out = [];
  for (var k = 0; k < timers.length; k++) if (timers[k].key === ptText(d.source)) out.push(timers[k]);
  return out;
}
for (var i = 0; i < d.ids.listLength; i++) {
  var r = response(i);
  if (ptFailed(r)) continue;
  var timers = atTimer(timerTokens(r));
  if (timers.length) add("rest", "POST", "/process/" + ptNumericId(d.ids[i]), "action=fireTimer&timerTokenId=" + ptEncode(timers[0].tokenId) + "&parts=none", "");
}
```

Script *Map response*:

```javascript
// PT Bulk Fire Timers - Map response: the answers (ReturnValue Maps, one per request) -> the output business object, field by field
var d = tw.local.data;
function response(i) { return (i < tw.local.responses.listLength) ? tw.local.responses[i] : null; }
function timerTokens(returnValue) {
  var found = [];
  var data = (ptJson(returnValue) || {}).data || {};
  var steps = (data.diagram || {}).step || [];
  for (var s = 0; s < steps.length; s++) {
    var step = steps[s];
    if (ptText(step.activityType) === "timer") {
      var own = step.tokenID || [];
      for (var k = 0; k < own.length; k++) found.push({ key: ptText(step.ID), name: ptText(step.name), kind: "timer event", tokenId: ptText(own[k]) });
    }
    var attached = step.attachedTimer || [];
    for (var a = 0; a < attached.length; a++) {
      var tokens = attached[a].tokenID || [];
      for (var m = 0; m < tokens.length; m++) {
        found.push({ key: ptText(step.ID) + "/" + ptText(attached[a].ID || attached[a].name), name: ptText(step.name) + " / " + ptText(attached[a].name), kind: "attached timer", tokenId: ptText(tokens[m]) });
      }
    }
  }
  return found;
}
function atTimer(timers) {   // the tokens at the one chosen timer
  var out = [];
  for (var k = 0; k < timers.length; k++) if (timers[k].key === ptText(d.source)) out.push(timers[k]);
  return out;
}
tw.local.results = new tw.object.PTResult();
if (ptText(d.source) === "") {
  tw.local.results.ok = false;
  tw.local.results.message = "Error: select the one timer to fire (the common timer is the first row) - nothing was fired";
} else {
  var fired = 0;
  var refused = [];
  var skipped = [];
  var unread = [];
  var extra = [];     // instances holding more than one token at the timer: only the first one is fired
  var lines = [];
  var next = tw.local.stageStart;   // the stage-2 answers follow the order in which Build stage 2 requests added the fires
  for (var i = 0; i < d.ids.listLength; i++) {
    var id = ptText(d.ids[i]);
    var r = response(i);
    if (ptFailed(r)) {
      unread.push(id + ": " + ptErrorText(r));
      continue;
    }
    var timers = atTimer(timerTokens(r));
    if (!timers.length) {
      skipped.push(id);
      continue;
    }
    if (timers.length > 1) extra.push(id + " (" + (timers.length - 1) + " more)");
    var answer = response(next);
    next++;
    if (ptFailed(answer)) refused.push(id + " timer token " + timers[0].tokenId + ": " + ptErrorText(answer));
    else {
      fired++;
      lines.push(id + " timer token " + timers[0].tokenId + " (" + timers[0].name + ") fired");
    }
  }
  tw.local.results.ok = (fired > 0 && refused.length === 0 && unread.length === 0);
  tw.local.results.json = lines.concat(refused, unread).join("\n");
  tw.local.results.message = (tw.local.results.ok ? "Success: " : (fired ? "Info: " : "Error: ")) + fired + " timer(s) fired at '" + ptText(d.sourceName) + "' in " + d.ids.listLength + " instance(s)"
    + (skipped.length ? "; " + skipped.length + " instance(s) without a pending token at that timer (" + skipped.join(", ") + ")" : "")
    + (extra.length ? "; one token fired per instance, left pending: " + extra.join(", ") : "")
    + (refused.length ? " - refused: " + refused.join("; ") : "")
    + (unread.length ? " - not read: " + unread.join("; ") : "");
}
```

## 2. Coach view `Fire Timers Selective`

Duplicate **Bulk Token Selective** (Designer: Copy), rename the copy *Fire Timers Selective*; binding PTInstanceSearch and the options
search (PTInstanceSearch), idlist (PTIdList), action (PTResult), position (PTBulkPosition), csv (PTCsv) stay as they are. Then:

### Layout - remove

| Item | What it is |
|---|---|
| Rows3 | the table *Steps (select the move target)* |
| ConfirmMove, MoveScope | replaced by ConfirmFire / FireScope below (or rename them and change the scripts) |

### Layout - change

| Item | Property | New value |
|---|---|---|
| Root | Label | Fire Timers Selective |
| BtnAnalyzetokens | Label / control id | *Analyze timers* / `BtnAnalyzetimers` (On click unchanged: `${StatusLine}.setText(""); ${SvcParse}.execute();`) |
| BtnMovetokensselectedinstances | Label / control id / On click | *Fire timers (selected instances)* / `BtnFiretimersselectedinstances` / script **Fire (selected)** below |
| BtnMovetokensallinstances | Label / control id / On click | *Fire timers (all instances)* / `BtnFiretimersallinstances` / script **Fire (all)** below |
| Rows2 | Label | Pending timers (common timer first - select the one timer to fire) |
| Rows2 columns | | step *Timer*, stepType *Kind*, instances *Instances*, tokens *Timer tokens*, share *Share*, flowObjectId *Timer key* |
| Rows4 | Label | Timer tokens per instance |
| Rows4 columns | | instance *Instance*, tokenId *Timer token*, step *Timer*, detail *Kind*, flowObjectId *Timer key* |
| SvcAnalyze | Attached service | **PT Bulk Timer Position** (input `tw.options.search`, result `tw.options.position` unchanged) |
| SvcMove | control id / Attached service | `SvcFire` / **PT Bulk Fire Timers** (result `tw.options.action`, On result unchanged: status, message, re-run SvcAnalyze) |

SvcParse (PT Parse Instance Ids), SvcCsv (PT Bulk Tokens To CSV), the Instances table Rows, the CSV dialog and the message dialog stay unchanged.

### Layout - add

Output Text `FireScope` (hidden) and a confirmation Modal Section `ConfirmFire` (title *Please confirm*, primary *Confirm*, secondary *Cancel*,
color W, width 700px, holding an Output Text `ConfirmFireText`; secondary: `${ConfirmFire}.setVisible(false);`).

Fire (selected) - On click:

```javascript
var loc = ${Rows2}.getSelectedRecords() || []; var sel = ${Rows}.getSelectedRecords() || []; var ids = sel.map(function (r) { return r.id; });
if (!(${Rows2}.getRecords() || []).length) { ${StatusLine}.setText("Error: no pending timer (Analyze timers first)"); }
else if (!loc.length) { ${StatusLine}.setText("Error: select the one timer to fire (the common timer is the first row)"); }
else if (!ids.length) { ${StatusLine}.setText("Error: no selected instance(s)"); }
else { ${FireScope}.setText("selected"); ${ConfirmFireText}.setText("Fire the timer '" + loc[0].step + "' now (one token per instance) for " + ids.length + " selected instance(s)?"); ${ConfirmFire}.show(); }
```

Fire (all) - the same with `var ids = (${Rows}.getRecords() || []).map(function (r) { return r.id; });`, `"all"` and `listed instance(s)`.

ConfirmFire primary - On click:

```javascript
${ConfirmFire}.setVisible(false); var loc = ${Rows2}.getSelectedRecords() || []; var sel = ${Rows}.getSelectedRecords() || [];
var ids = (${FireScope}.getText() == "all") ? (${Rows}.getRecords() || []).map(function (r) { return r.id; }) : sel.map(function (r) { return r.id; });
if (loc.length) { ${SvcFire}.execute({ ids: ids, source: loc[0].flowObjectId, sourceName: loc[0].step }); }
```

## 3. Dashboard (client-side human service `Process Tools REST`)

Variables (private, default value script `var autoObject = new tw.object.<Type>(); autoObject` as for the other tabs):
`FireTimersSelective_result` PTInstanceSearch, `FireTimersSelective_search` PTInstanceSearch, `FireTimersSelective_idlist` PTIdList,
`FireTimersSelective_action` PTResult, `FireTimersSelective_position` PTBulkPosition, `FireTimersSelective_csv` PTCsv.

Coach: in the Tab Section *Process*, add the view **Fire Timers Selective** right after *Timers* (control id `FireTimersSelective1`),
label *Fire Timers Selective*, binding `tw.local.FireTimersSelective_result`, configuration search / idlist / action / position / csv =
the variables above. No change to Initialize or the environment variables.
