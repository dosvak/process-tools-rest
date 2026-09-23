# Process Tools REST 1.3.1 -> 1.4: Bulk Token Selective (for manual replication in another environment)

One new business object, one new service flow, one new coach view (a copy of *Bulk Move Tokens* with the lookup replaced by a text
area) and one new tab in the dashboard. Nothing existing changes: *PT Bulk Token Position*, *PT Bulk Move Tokens*, *PT Bulk Tokens To CSV*
and the *Bulk Move Tokens* view are reused as they are. Order of work: 1 business object, 2 service flow, 3 coach view, 4 dashboard.

## 1. Business object `PTIdList`

| Field | Type |
|---|---|
| text | String |

## 2. Service flow `PT Parse Instance Ids` (Service Flow, exposed as Ajax like the other PT services)

Input `data` (PTIdList), output `results` (PTInstanceSearch - the existing type: ok Boolean, message String, rows ProcessV2Row[]).
Diagram: Start -> Script "Parse instance ids" -> End. Script (copy as is):

```javascript
// Bulk Token Selective: the pasted instance ids -> the same result shape as PT Search Instances (id per row; the name stays empty)
tw.local.results = new tw.object.PTInstanceSearch();
tw.local.results.rows = new tw.object.listOf.ProcessV2Row();
var text = (tw.local.data == null || tw.local.data.text == null) ? "" : String(tw.local.data.text);
var parts = text.split(/[\s,;]+/);
var seen = {};
var bad = [];
var count = 0;
for (var i = 0; i < parts.length; i++) {
  var part = parts[i].replace(/^"+|"+$/g, "");
  if (!part) continue;
  if (!/^(\d+\.)?\d+$/.test(part)) { bad.push(part); continue; }
  var id = part.indexOf(".") >= 0 ? part : "2072." + part;   // bare number = the numeric part of a process instance id
  if (seen[id]) continue;
  seen[id] = true;
  var row = new tw.object.ProcessV2Row();
  row.id = id;
  row.name = "";
  row.model = "";
  row.state = "";
  tw.local.results.rows.insertIntoList(tw.local.results.rows.listLength, row);
  count++;
}
tw.local.results.ok = count > 0;
if (count > 0) {
  tw.local.results.message = "Info: " + count + " instance id(s) listed" + (bad.length ? "; ignored: " + bad.join(", ") : "") + " - analysing tokens";
} else {
  tw.local.results.message = "Error: no instance ids found" + (bad.length ? " (ignored: " + bad.join(", ") + ")" : "") + " - paste instance ids such as 2072.55 or 55, separated by commas, spaces or new lines";
}
```

The result has the same shape as *PT Search Instances*, so the analysis and the move read it unchanged (`id` per row, `name` empty:
the tokens table shows the instance id with an empty Name column). A bare number is prefixed with `2072.` (the numeric part is what the
classic calls use anyway); `2072.55`, quoted values and duplicates are accepted, anything else is reported in the message as ignored.

## 3. Coach view `Bulk Token Selective`

Duplicate the coach view **Bulk Move Tokens** (Designer: Copy) and rename the copy *Bulk Token Selective*; the binding stays
PTInstanceSearch. Then:

### Configuration options (Variables tab of the view)

| Option | Change |
|---|---|
| criteria (PTInstanceCriteria) | **delete** |
| processes (PTProcesses) | **delete** |
| idlist (PTIdList) | **add** (object, not a list) |
| search, action, position, csv | unchanged |

### Layout - remove

| Item | What it is |
|---|---|
| Inputs | the Horizontal Layout with the six inputs Containers, Versions, Model, States, Size, Offset |
| BtnLoadprocesses, BtnSearchinstances | the buttons *Load processes* and *Search instances* in the Actions row |
| Procs | the table *Processes of the application* |
| SvcProcesses, SvcSearch | the Service Call controls of *PT App Processes* and *PT Search Instances* |

### Layout - add

**Text Area** (control id `IdList`) as the first item after the Status line, before the Actions row:

| Property | Value |
|---|---|
| Label | Instance ids (comma, space or line separated; 2072.55 or 55) |
| Binding | `tw.options.idlist.text` |
| Width | 100% |
| Height | 110px |

**Service Call** (control id `SvcParse`) next to the other Service Call controls:

| Property | Value |
|---|---|
| Attached service | PT Parse Instance Ids |
| Input data | `tw.options.idlist` |
| Binding (result) | `tw.options.search` |
| Auto run | false |
| Busy indicator | S (standard) |
| On result | `${StatusLine}.setText(result ? result.message : ""); if (result && result.message && result.message.indexOf("Info:") != 0) { ${MsgText}.setText(result.message); ${Msg}.show(); } if (result && result.ok) { ${SvcAnalyze}.execute(); }` |
| On error | `${StatusLine}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${MsgText}.setText("Error: " + (error && error.errorText ? error.errorText : error)); ${Msg}.show();` |

### Layout - change

| Item | Property | Old | New |
|---|---|---|---|
| Root (the view's own label) | Label | Bulk Move Tokens | Bulk Token Selective |
| BtnAnalyzetokens (*Analyze tokens*) | On click | `${StatusLine}.setText(""); ${SvcAnalyze}.execute();` | `${StatusLine}.setText(""); ${SvcParse}.execute();` |
| BtnAnalyzetokens | Color style | D (default) | P (primary) - cosmetic, it is now the first button |
| Rows (the Instances table) | Label | Instances | Instances (from the list) |

Everything else stays exactly as in Bulk Move Tokens: the buttons *Move tokens (selected instances)* / *(all instances)* with their
click scripts (they read the ids from the Instances table: selected rows or `${Rows}.getRecords()`), the tables Rows2 (locations),
Rows3 (steps), Rows4 (tokens per instance) with Export CSV, the hidden MoveScope text, the ConfirmMove dialog and its Confirm script,
SvcAnalyze (PT Bulk Token Position, input `tw.options.search`, result `tw.options.position`), SvcMove (PT Bulk Move Tokens, result
`tw.options.action`, On result re-runs SvcAnalyze), SvcCsv, the CSV dialog and the message dialog.

## 4. Dashboard (client-side human service `Process Tools REST`)

Variables (private, one per option, with the default value script of the other tabs):

| Variable | Type | Default |
|---|---|---|
| BulkSelective_result | PTInstanceSearch | `var autoObject = new tw.object.PTInstanceSearch(); autoObject` |
| BulkSelective_search | PTInstanceSearch | same pattern |
| BulkSelective_idlist | PTIdList | `var autoObject = new tw.object.PTIdList(); autoObject` |
| BulkSelective_action | PTResult | same pattern |
| BulkSelective_position | PTBulkPosition | same pattern |
| BulkSelective_csv | PTCsv | same pattern |

Coach: in the Tab Section *Process*, add the view **Bulk Token Selective** right after *Bulk Move Tokens* (control id `BulkSelective`),
label *Bulk Token Selective*, binding `tw.local.BulkSelective_result`, configuration: search = `tw.local.BulkSelective_search`,
idlist = `tw.local.BulkSelective_idlist`, action = `tw.local.BulkSelective_action`, position = `tw.local.BulkSelective_position`,
csv = `tw.local.BulkSelective_csv`. No change to Initialize or the environment variables.

## Verified (2026-09-23)

Package `Process-Tools-REST-1.4.twx` (generator `tools/build_ptrest.py --snapshot 1.4`, 118 objects) imported on BAW 8.6.2 and BAW 26;
*PT Parse Instance Ids* run directly on both; deep test on 8.6.2: the 8 checks of the new tab pass (empty list error; bare, prefixed,
duplicate and invalid ids -> 2 instances listed, common active token found; move guard; confirmation for 2 instances; 2 tokens moved to
End and both instances finished over REST; analysis reload; CSV); designer opens the new flow with validation counter 0.
