// pt-helpers.js - Process Tools REST server file: the few helpers every "Build requests" and "Map response" script uses.
// Deliberately small; everything specific to one REST call stays inside that call's script.

// ---- text, ids, query strings
function ptText(value) { return (value === undefined || value === null) ? "" : String(value); }
function ptTrim(value) { return ptText(value).replace(/^\s+|\s+$/g, ""); }
function ptEncode(value) { return encodeURIComponent(ptTrim(value)); }
function ptNumericId(id) { var text = ptText(id); return text.substring(text.lastIndexOf(".") + 1); }
function ptJoinList(list, separator) {
  var parts = [];
  for (var i = 0; list != null && i < list.listLength; i++) parts.push(ptText(list[i]));
  return parts.join(separator);
}
function ptQuery(pairs) {
  var parts = [];
  for (var i = 0; i < pairs.length; i++) {
    if (ptTrim(pairs[i][1]) !== "") parts.push(pairs[i][0] + "=" + ptEncode(pairs[i][1]));
  }
  return parts.join("&");
}

// ---- environment variables: family = rest (classic v1) | bpm (Process REST v2) | ops (Operations REST) | fed (federated); host "(same)" = serverBaseURL
function ptEnv(name, fallback) {
  var value = ptTrim(tw.env[name]);
  return (value === "" || value === "undefined" || value === "null") ? fallback : value;
}
function ptApiUrl(family, path, query) {
  var families = { rest: ["restHost", "restContextPath", "/rest/bpm/wle/v1"], bpm: ["bpmHost", "bpmContextPath", "/bpm"], ops: ["opsHost", "opsContextPath", "/ops"], fed: ["federatedHost", "federatedContextPath", "/rest/bpm/federated/v1"] };
  var setting = families[family] || families.rest;
  var host = ptEnv(setting[0], "(same)");
  if (host === "(same)") host = ptEnv("serverBaseURL", "https://localhost:9443");
  var url = host.replace(/\/+$/, "") + "/" + ptEnv(setting[1], setting[2]).replace(/^\/+|\/+$/g, "") + path;
  return query ? url + (url.indexOf("?") >= 0 ? "&" : "?") + query : url;
}

// ---- RestCallParams for PT Call REST; the CSRF token and the login cookie (credDetails) travel as request headers of the bpm / ops / fed families
function ptRequest(serviceName, family, method, path, query, body, csrfToken, credDetails) {
  var request = new tw.object.RestCallParams();
  request.appName = "Process Tools REST";
  request.serviceName = serviceName;
  request.url = ptApiUrl(family, path, query);
  request.httpMethodName = method;
  request.requestParams = ptText(body);
  request.skipParsing = false;
  request.requestHeaders = new tw.object.Map();
  request.requestHeaders.put("Accept", "application/json");
  if (request.requestParams !== "") request.requestHeaders.put("Content-Type", "application/json; charset=utf-8");
  if (family !== "rest" && ptText(csrfToken) !== "") request.requestHeaders.put("BPMCSRFToken", ptText(csrfToken));
  if (family !== "rest" && credDetails != null && ptText(credDetails.value) !== "") request.requestHeaders.put(ptText(credDetails.name), ptText(credDetails.value));
  return request;
}

// ---- ReturnValue Map of PT Call REST: statusCode and responseBody (text); Map API of the engine: put, get, containsKey, containsValue, keyArray, valueArray, remove, size, isEmpty
function ptStatus(returnValue) { return (returnValue == null) ? 0 : (parseInt(ptText(returnValue.get("statusCode")), 10) || 0); }
function ptFailed(returnValue) { var status = ptStatus(returnValue); return status < 200 || status >= 400; }
function ptBody(returnValue) { return (returnValue == null) ? "" : ptText(returnValue.get("responseBody")); }
function ptJson(returnValue) { try { return JSON.parse(ptBody(returnValue)); } catch (error) { return null; } }
function ptPretty(object) { try { return JSON.stringify(object, null, 2); } catch (error) { return ptText(object); } }
function ptErrorText(returnValue) {
  if (returnValue == null) return "no response recorded (requests " + tw.local.requests.listLength + ", responses " + tw.local.responses.listLength + ", index " + tw.local.index + ")";
  var json = ptJson(returnValue);
  if (json != null && typeof json === "object") {
    if (json.Data && json.Data.errorMessage) return ptText(json.Data.errorMessage);
    if (json.data && json.data.errorMessage) return ptText(json.data.errorMessage);
    if (json.errorMessage || json.error_message || json.message) return ptText(json.errorMessage || json.error_message || json.message);
    if (typeof json.data === "string") return (json.code ? json.code + ": " : "") + json.data;
  }
  return "HTTP " + ptStatus(returnValue) + " " + ptBody(returnValue).substring(0, 200);
}
// ISO timestamps of the APIs -> "yyyy-MM-dd HH:mm:ss": the coach framework would revive ISO text bound to a table into browser-formatted dates
function ptDate(value) { var match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(ptText(value)); return match ? match[1] + " " + match[2] : ptText(value); }
